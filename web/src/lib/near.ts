import type { AccessKeyPermissionView } from "./types";

/**
 * Server-side NEAR RPC view calls (JSON-RPC `query`). Read-only and
 * public: no keys, no signing. This module is imported only by server
 * components / the data layer — it must never ship to the browser,
 * because live configuration (contract id, RPC URLs) is server env.
 *
 * The call shape is the same one verified live against testnet RPC in
 * docs/PREFLIGHT.md (args_base64, finality "final").
 *
 * Resilience (Stage 5 v3): the public testnet RPC rate-limits (HTTP
 * 429) and occasionally drops connections, and a shop page must not
 * greet a visitor with a fixture fallback for a transient transport
 * failure. So a query rotates across several public endpoints, with a
 * retry and backoff on rate limits and server errors:
 *
 *   endpoints = NEAR_RPC_URLS (comma list, full override — used by the
 *               failure-mode tests)
 *             | NEAR_RPC_URL (single primary, if set) + defaults
 *             | defaults alone:
 *               https://rpc.testnet.near.org      (NEAR public RPC)
 *               https://rpc.testnet.fastnear.com  (FASTNEAR public RPC)
 *               https://near-testnet.drpc.org     (dRPC public RPC)
 *
 * Endpoints were verified live against bounden11.testnet on
 * 2026-11-10. A JSON-RPC error response is a definitive answer from a
 * healthy node (e.g. the method itself rejected the call), so it is
 * not retried and does not trigger rotation.
 */

export class NearRpcError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NearRpcError";
  }
}

const DEFAULT_ENDPOINTS = [
  "https://rpc.testnet.near.org",
  "https://rpc.testnet.fastnear.com",
  "https://near-testnet.drpc.org",
];

export function rpcEndpoints(): string[] {
  const list = process.env.NEAR_RPC_URLS?.trim();
  if (list) {
    return list.split(",").map((s) => s.trim()).filter(Boolean);
  }
  const single = process.env.NEAR_RPC_URL?.trim();
  const out = single ? [single, ...DEFAULT_ENDPOINTS] : [...DEFAULT_ENDPOINTS];
  return [...new Set(out)];
}

/** Backwards-compatible accessor: the primary endpoint. */
export function rpcUrl(): string {
  return rpcEndpoints()[0] ?? "https://rpc.testnet.near.org";
}

const REQUEST_TIMEOUT_MS = 15_000;
const ATTEMPTS_PER_ENDPOINT = 2;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface JsonRpcResponse {
  result?: { result?: number[]; [k: string]: unknown };
  error?: { message?: string; data?: unknown; [k: string]: unknown };
}

type AttemptOutcome =
  | { kind: "ok"; value: unknown }
  | { kind: "retryable"; message: string }
  | { kind: "fatal"; message: string };

async function attempt(url: string, params: Record<string, unknown>): Promise<AttemptOutcome> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      // "connection: close": the public endpoints reset reused
      // keep-alive sockets often enough (UND_ERR_SOCKET on the second
      // rapid call, measured 2026-11-10) that a fresh socket per
      // attempt is the reliable choice for read-only view calls.
      headers: { "content-type": "application/json", connection: "close" },
      body: JSON.stringify({ jsonrpc: "2.0", id: "bounden-web", method: "query", params }),
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    return {
      kind: "retryable",
      message: `NEAR RPC unreachable at ${url}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  if (res.status === 429 || res.status >= 500) {
    return { kind: "retryable", message: `NEAR RPC returned HTTP ${res.status} at ${url}` };
  }
  if (!res.ok) {
    // A different endpoint may still serve the call (e.g. a 403 from a
    // key-gated gateway), so treat other HTTP failures as rotatable,
    // just not worth an immediate same-endpoint retry.
    return { kind: "retryable", message: `NEAR RPC returned HTTP ${res.status} at ${url}` };
  }
  let json: JsonRpcResponse;
  try {
    json = (await res.json()) as JsonRpcResponse;
  } catch {
    return { kind: "retryable", message: `NEAR RPC returned unparseable JSON at ${url}` };
  }
  if (json.error) {
    return {
      kind: "fatal",
      message: `NEAR RPC error: ${json.error.message ?? JSON.stringify(json.error).slice(0, 200)}`,
    };
  }
  return { kind: "ok", value: json.result };
}

async function query(params: Record<string, unknown>): Promise<unknown> {
  const endpoints = rpcEndpoints();
  const failures: string[] = [];
  for (const url of endpoints) {
    for (let i = 0; i < ATTEMPTS_PER_ENDPOINT; i++) {
      if (i > 0) await sleep(300);
      const outcome = await attempt(url, params);
      if (outcome.kind === "ok") return outcome.value;
      if (outcome.kind === "fatal") throw new NearRpcError(outcome.message);
      failures.push(outcome.message);
    }
    await sleep(600);
  }
  throw new NearRpcError(
    `NEAR RPC failed on all ${endpoints.length} endpoint(s). Last failure: ${failures[failures.length - 1] ?? "none"}`,
  );
}

/** Call a contract view method and decode its JSON result. */
export async function viewCall<T>(
  contractId: string,
  methodName: string,
  args: Record<string, unknown>,
): Promise<T> {
  const result = (await query({
    request_type: "call_function",
    finality: "final",
    account_id: contractId,
    method_name: methodName,
    args_base64: Buffer.from(JSON.stringify(args), "utf8").toString("base64"),
  })) as { result?: number[] } | undefined;
  if (!result || !Array.isArray(result.result)) {
    throw new NearRpcError(`view call ${methodName} returned no result bytes`);
  }
  const text = Buffer.from(result.result).toString("utf8");
  return JSON.parse(text) as T;
}

/** Read an access key's permission object (the leash evidence). */
export async function viewAccessKey(
  accountId: string,
  publicKey: string,
): Promise<{ nonce: number; permission: AccessKeyPermissionView }> {
  const result = (await query({
    request_type: "view_access_key",
    finality: "final",
    account_id: accountId,
    public_key: publicKey,
  })) as { nonce?: number; permission?: AccessKeyPermissionView } | undefined;
  if (!result || typeof result.nonce !== "number" || result.permission === undefined) {
    throw new NearRpcError(`view_access_key for ${accountId} returned an unexpected shape`);
  }
  return { nonce: result.nonce, permission: result.permission };
}
