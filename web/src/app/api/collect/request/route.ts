import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import {
  putRequest,
  rendezvousConfigured,
  type CollectRequestPayload,
} from "@/lib/rendezvous";
import { COLLECT_RECIPIENT } from "@/lib/collect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/collect/request — a buyer's signed collection note arrives.
 *
 * This route judges nothing: it checks the note is well-formed enough
 * to queue and files it for the cashier. Every question that matters —
 * is this the buyer, is the order fulfilled, does the signature check
 * out — is answered by the cashier worker, the only component that can
 * open the vault. The request id is the hash of the signature, so
 * re-posting the same note (the page does, while it waits) is the
 * same request, and a replayed note can only ever draw a reply sealed
 * to a key the replayer does not hold.
 */

const ACCOUNT_ID_RE = /^(?:[a-z0-9][a-z0-9._-]{1,62}[a-z0-9]|[0-9a-f]{64})$/;

function b64Len(value: unknown): number {
  if (typeof value !== "string" || value.length > 8192) return -1;
  try {
    return Buffer.from(value, "base64").length;
  } catch {
    return -1;
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  if (!rendezvousConfigured()) {
    return NextResponse.json(
      { error: "The delivery counter is closed on this deployment." },
      { status: 503 },
    );
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "That was not a readable request." }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const orderId = b.orderId;
  const accountId = b.accountId;
  const message = b.message;
  const signatureB64 = b.signatureB64;
  const publicKey = b.publicKey;
  const nonceB64 = b.nonceB64;
  const recipient = b.recipient;

  const valid =
    typeof orderId === "number" &&
    Number.isSafeInteger(orderId) &&
    orderId >= 0 &&
    orderId <= 1_000_000 &&
    typeof accountId === "string" &&
    ACCOUNT_ID_RE.test(accountId) &&
    typeof message === "string" &&
    message.length > 0 &&
    message.length <= 512 &&
    b64Len(signatureB64) === 64 &&
    typeof publicKey === "string" &&
    publicKey.startsWith("ed25519:") &&
    publicKey.length <= 64 &&
    b64Len(nonceB64) === 32 &&
    recipient === COLLECT_RECIPIENT;

  if (!valid) {
    return NextResponse.json(
      { error: "That collection note was not well-formed, so it was not queued." },
      { status: 400 },
    );
  }

  const signature = Buffer.from(signatureB64 as string, "base64");
  const requestId = createHash("sha256").update(signature).digest("hex");
  const payload: CollectRequestPayload = {
    requestId,
    orderId: orderId as number,
    accountId: accountId as string,
    message: message as string,
    signatureB64: signatureB64 as string,
    publicKey: publicKey as string,
    nonceB64: nonceB64 as string,
    recipient: recipient as string,
  };
  try {
    await putRequest(payload);
  } catch {
    return NextResponse.json(
      { error: "The counter could not file the note just now. Try again in a moment." },
      { status: 503 },
    );
  }
  return NextResponse.json({ requestId });
}
