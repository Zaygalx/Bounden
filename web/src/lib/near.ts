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
 * failure. So a query is served by several public endpoints.
 *
 * Buyer-experience pass (10 Nov 2026): the rotation is now a RACE, not
 * a queue. Measured that morning: the first endpoint in the old
 * sequential rotation (rpc.testnet.near.org) took 3.4–3.8 s per call
 * and dropped connections mid-response, while fastnear and dRPC
 * answered in 0.2–0.8 s — sequential rotation made every page pay the
 * slowest endpoint first, and a dropped connection burned a second
 * full attempt plus sleeps before a healthy endpoint was even asked
 * (home page: 39 s server time). Now all endpoints are asked at once
 * with a short per-attempt timeout; the first definitive answer wins.
 * If every endpoint fails retryably, one more race runs after a short
 * pause. A JSON-RPC error is a definitive answer from a healthy node
 * and is surfaced, not raced past.
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

const REQUEST_TIMEOUT_MS = 4_000;
const RACE_ROUNDS = 2;
const ROUND_PAUSE_MS = 400;

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

type RaceResult =
  | { kind: "ok"; value: unknown }
  | { kind: "fatal"; message: string }
  | { kind: "retryable"; failures: string[] };

/** Ask every endpoint at once; settle on the first definitive answer. */
async function raceOnce(endpoints: string[], params: Record<string, unknown>): Promise<RaceResult> {
  return new Promise<RaceResult>((resolve) => {
    let remaining = endpoints.length;
    let fatal: string | null = null;
    const failures: string[] = [];
    if (remaining === 0) {
      resolve({ kind: "retryable", failures: ["no endpoints configured"] });
      return;
    }
    for (const url of endpoints) {
      attempt(url, params).then(
        (outcome) => {
          if (outcome.kind === "ok") {
            resolve({ kind: "ok", value: outcome.value });
            return;
          }
          if (outcome.kind === "fatal") fatal = outcome.message;
          else failures.push(outcome.message);
          remaining -= 1;
          if (remaining === 0) {
            resolve(
              fatal !== null
                ? { kind: "fatal", message: fatal }
                : { kind: "retryable", failures },
            );
          }
        },
        (err: unknown) => {
          failures.push(err instanceof Error ? err.message : String(err));
          remaining -= 1;
          if (remaining === 0) {
            resolve(
              fatal !== null
                ? { kind: "fatal", message: fatal }
                : { kind: "retryable", failures },
            );
          }
        },
      );
    }
  });
}

async function query(params: Record<string, unknown>): Promise<unknown> {
  const endpoints = rpcEndpoints();
  let lastFailures: string[] = [];
  for (let round = 0; round < RACE_ROUNDS; round++) {
    if (round > 0) await sleep(ROUND_PAUSE_MS);
    const result = await raceOnce(endpoints, params);
    if (result.kind === "ok") return result.value;
    if (result.kind === "fatal") throw new NearRpcError(result.message);
    lastFailures = result.failures;
  }
  throw new NearRpcError(
    `NEAR RPC failed on all ${endpoints.length} endpoint(s). Last failure: ${lastFailures[lastFailures.length - 1] ?? "none"}`,
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
