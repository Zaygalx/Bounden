import type { AccessKeyPermissionView } from "./types";

/**
 * Server-side NEAR RPC view calls (JSON-RPC `query`). Read-only and
 * public: no keys, no signing. This module is imported only by server
 * components / the data layer — it must never ship to the browser,
 * because live configuration (contract id, RPC URL) is server env.
 *
 * The call shape is the same one verified live against testnet RPC in
 * docs/PREFLIGHT.md (args_base64, finality "final").
 */

export class NearRpcError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NearRpcError";
  }
}

export function rpcUrl(): string {
  return process.env.NEAR_RPC_URL?.trim() || "https://rpc.testnet.near.org";
}

interface JsonRpcResponse {
  result?: { result?: number[]; [k: string]: unknown };
  error?: { message?: string; data?: unknown; [k: string]: unknown };
}

async function query(params: Record<string, unknown>): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(rpcUrl(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: "bounden-web", method: "query", params }),
      cache: "no-store",
    });
  } catch (err) {
    throw new NearRpcError(
      `NEAR RPC unreachable: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!res.ok) throw new NearRpcError(`NEAR RPC returned HTTP ${res.status}`);
  const json = (await res.json()) as JsonRpcResponse;
  if (json.error) {
    throw new NearRpcError(
      `NEAR RPC error: ${json.error.message ?? JSON.stringify(json.error).slice(0, 200)}`,
    );
  }
  return json.result;
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
