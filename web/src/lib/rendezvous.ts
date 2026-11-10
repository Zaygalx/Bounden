import { del, head, list, put } from "@vercel/blob";

/**
 * The delivery-counter rendezvous (server-side only).
 *
 * How a buyer collects a fulfilled order, given the shop's shape: the
 * vault lives on the cashier's machine, which accepts no inbound
 * connections, and this storefront is serverless. So the storefront
 * keeps a small post box with two compartments:
 *
 *   requests — a buyer's signed collection note (NEP-413), posted by
 *              the order page after the buyer's wallet signs it;
 *   replies  — the cashier's answer, posted by the worker: either the
 *              item sealed to the buyer's one-time key, or a plain
 *              refusal with its reason.
 *
 * The post box is a private Vercel Blob store (bounden-rendezvous-2),
 * one small JSON file per note or answer, kept for fifteen minutes.
 * It began as instance memory and was measured failing in production
 * on its first morning (10 Nov 2026): a buyer's note landed on one
 * serverless instance, the cashier's polls were served by another,
 * and the note was never seen — while the very next note, luckier,
 * was answered in seconds. A post box that loses letters is not a
 * post box, so the store is durable now; instance memory remains
 * only as the fallback for a deployment with no store configured
 * (local development), where one process really is the whole shop.
 *
 * Nothing secret rests in the store either way: a request is a
 * signature anyone may carry, and a "ready" reply is ciphertext only
 * the buyer's browser can open (see lib/collect.ts and the worker's
 * delivery counter). No code, no delivery key, and no plaintext ever
 * enters it.
 *
 * The worker endpoints are gated by a shared secret
 * (BOUNDEN_RENDEZVOUS_SECRET, set on both sides). The secret unlocks
 * nothing by itself — a request still needs the buyer's own wallet
 * signature before the cashier will answer it. When the secret is not
 * configured, the counter is closed and the routes say so.
 */

export interface CollectRequestPayload {
  requestId: string;
  orderId: number;
  accountId: string;
  message: string;
  signatureB64: string;
  publicKey: string;
  nonceB64: string;
  recipient: string;
}

export type CollectReply =
  | { requestId: string; status: "ready"; sealedB64: string; workerPubB64: string }
  | { requestId: string; status: "rejected"; reason: string };

const TTL_MS = 15 * 60 * 1000;
const REQUESTS_PREFIX = "collect/requests/";
const REPLIES_PREFIX = "collect/replies/";

function blobConfigured(): boolean {
  return (process.env.BLOB_READ_WRITE_TOKEN?.trim() ?? "") !== "";
}

/* ------------------------------------------------------------------ */
/* In-memory fallback (single-process deployments only).               */
/* ------------------------------------------------------------------ */

interface MemStore {
  requests: Map<string, { payload: CollectRequestPayload; receivedAt: number }>;
  replies: Map<string, { reply: CollectReply; receivedAt: number }>;
}

const globalMem = globalThis as unknown as { __boundenRendezvous?: MemStore };
function mem(): MemStore {
  if (!globalMem.__boundenRendezvous) {
    globalMem.__boundenRendezvous = { requests: new Map(), replies: new Map() };
  }
  return globalMem.__boundenRendezvous;
}

function memSweep(): void {
  const s = mem();
  const now = Date.now();
  for (const [id, e] of s.requests) if (now - e.receivedAt > TTL_MS) s.requests.delete(id);
  for (const [id, e] of s.replies) if (now - e.receivedAt > TTL_MS) s.replies.delete(id);
}

/* ------------------------------------------------------------------ */
/* Shared surface — durable when a store is configured.                */
/* ------------------------------------------------------------------ */

export function rendezvousConfigured(): boolean {
  return (process.env.BOUNDEN_RENDEZVOUS_SECRET?.trim() ?? "") !== "";
}

export function workerAuthorized(req: Request): boolean {
  const secret = process.env.BOUNDEN_RENDEZVOUS_SECRET?.trim() ?? "";
  if (secret === "") return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

/**
 * Read a stored JSON file. This goes by hand — head() for the private
 * URL, then an authenticated fetch — rather than through the SDK's
 * get(): measured from the cashier's network, get()'s transport can
 * stall indefinitely behind an egress proxy, while the equivalent
 * fetch answers in about a second (and inside Vercel both paths are
 * the same hop). Every call here is time-bounded regardless.
 */
async function readJson<T>(pathname: string): Promise<T | null> {
  let url: string;
  try {
    const meta = await head(pathname, { abortSignal: AbortSignal.timeout(8_000) });
    url = meta.url;
  } catch {
    return null;
  }
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN ?? ""}` },
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) return null;
  try {
    return JSON.parse(await res.text()) as T;
  } catch {
    return null;
  }
}

async function writeJson(pathname: string, value: unknown): Promise<void> {
  await put(pathname, JSON.stringify(value), {
    access: "private",
    contentType: "application/json",
    allowOverwrite: true,
    addRandomSuffix: false,
    abortSignal: AbortSignal.timeout(10_000),
  });
}

export async function putRequest(payload: CollectRequestPayload): Promise<void> {
  if (!blobConfigured()) {
    memSweep();
    mem().requests.set(payload.requestId, { payload, receivedAt: Date.now() });
    return;
  }
  await writeJson(`${REQUESTS_PREFIX}${payload.requestId}.json`, {
    payload,
    receivedAt: Date.now(),
  });
}

export async function listRequests(): Promise<CollectRequestPayload[]> {
  if (!blobConfigured()) {
    memSweep();
    return [...mem().requests.values()].map((e) => e.payload);
  }
  const { blobs } = await list({
    prefix: REQUESTS_PREFIX,
    limit: 200,
    abortSignal: AbortSignal.timeout(10_000),
  });
  const now = Date.now();
  const out: CollectRequestPayload[] = [];
  for (const blob of blobs) {
    if (now - new Date(blob.uploadedAt).getTime() > TTL_MS) {
      await del(blob.pathname).catch(() => undefined);
      continue;
    }
    const entry = await readJson<{ payload: CollectRequestPayload }>(blob.pathname);
    if (entry?.payload) out.push(entry.payload);
  }
  return out;
}

export async function hasRequest(requestId: string): Promise<boolean> {
  if (!blobConfigured()) {
    memSweep();
    return mem().requests.has(requestId);
  }
  try {
    await head(`${REQUESTS_PREFIX}${requestId}.json`, {
      abortSignal: AbortSignal.timeout(8_000),
    });
    return true;
  } catch {
    return false;
  }
}

export async function putReply(reply: CollectReply): Promise<void> {
  if (!blobConfigured()) {
    memSweep();
    mem().replies.set(reply.requestId, { reply, receivedAt: Date.now() });
    return;
  }
  await writeJson(`${REPLIES_PREFIX}${reply.requestId}.json`, {
    reply,
    receivedAt: Date.now(),
  });
}

export async function getReply(requestId: string): Promise<CollectReply | null> {
  if (!blobConfigured()) {
    memSweep();
    return mem().replies.get(requestId)?.reply ?? null;
  }
  const entry = await readJson<{ reply: CollectReply; receivedAt: number }>(
    `${REPLIES_PREFIX}${requestId}.json`,
  );
  if (!entry) return null;
  if (Date.now() - entry.receivedAt > TTL_MS) return null;
  return entry.reply;
}
