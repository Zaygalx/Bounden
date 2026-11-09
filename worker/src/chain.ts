import { Account, JsonRpcProvider, KeyPairSigner, actions } from "near-api-js";
import type { KeyPairString } from "near-api-js";
import type { ChainOrder, Constitution, AccessKeyViewLike } from "./types.js";
import { loadCredentialsFile } from "./config.js";

/**
 * THE LEASH — layer 2 of 3 (the others: the on-chain function-call key
 * permission object, and the contract itself).
 *
 * The worker's entire on-chain authority is these two method names.
 * Every signed call the worker makes goes through `LeashedChainClient`,
 * which refuses — in-process, before any network traffic — to sign
 * anything else. The type system helps (`AgentMethod`), and the runtime
 * guard catches casts, dynamic strings, and future code that tries.
 */
export const AGENT_METHOD_ALLOWLIST = ["fulfil_order", "issue_refund"] as const;
export type AgentMethod = (typeof AGENT_METHOD_ALLOWLIST)[number];

export function isAgentMethod(method: string): method is AgentMethod {
  return (AGENT_METHOD_ALLOWLIST as readonly string[]).includes(method);
}

export class LeashViolationError extends Error {
  readonly method: string;
  constructor(method: string) {
    super(
      `leash violation: the Bounden cashier may only call ${AGENT_METHOD_ALLOWLIST.join(", ")}; refused "${method}" before any network traffic`,
    );
    this.name = "LeashViolationError";
    this.method = method;
  }
}

export interface CallOptions {
  /** Attached deposit in yoctoNEAR, as a decimal string. Defaults to "0". */
  depositYocto?: string;
  gas?: bigint;
}

export interface ChainClient {
  readonly contractId: string;
  getConstitution(): Promise<Constitution>;
  /** Returns null when the order does not exist (probe past the tip). */
  getOrder(orderId: number): Promise<ChainOrder | null>;
  callAgentMethod(
    method: AgentMethod,
    args: Record<string, unknown>,
    opts?: CallOptions,
  ): Promise<{ txHash?: string }>;
  /** Access-key view for an arbitrary account/key (evidence checks). */
  viewAccessKey(accountId: string, publicKey: string): Promise<AccessKeyViewLike | null>;
}

/**
 * Runtime leash guard wrapping any ChainClient. Records blocked attempts
 * (method names only — never args, which might carry payload text) so
 * tests and operators can prove refusals happened.
 */
export class LeashedChainClient implements ChainClient {
  readonly blockedAttempts: string[] = [];
  constructor(private readonly inner: ChainClient) {}
  get contractId(): string {
    return this.inner.contractId;
  }
  getConstitution(): Promise<Constitution> {
    return this.inner.getConstitution();
  }
  getOrder(orderId: number): Promise<ChainOrder | null> {
    return this.inner.getOrder(orderId);
  }
  viewAccessKey(accountId: string, publicKey: string): Promise<AccessKeyViewLike | null> {
    return this.inner.viewAccessKey(accountId, publicKey);
  }
  async callAgentMethod(
    method: AgentMethod,
    args: Record<string, unknown>,
    opts?: CallOptions,
  ): Promise<{ txHash?: string }> {
    if (!isAgentMethod(method)) {
      this.blockedAttempts.push(method);
      throw new LeashViolationError(method);
    }
    return this.inner.callAgentMethod(method, args, opts);
  }
}

const DEFAULT_GAS = 30_000_000_000_000n; // 30 TGas

/**
 * Live NEAR client backed by near-api-js (pinned 7.4.0 — see NOTES.md).
 * Views go through the RPC provider unsigned; change calls are signed
 * with the keypair loaded from the vault credential file and broadcast
 * via signAndSendTransaction so the caller gets the transaction hash.
 */
export class NearChainClient implements ChainClient {
  readonly contractId: string;
  private readonly provider: JsonRpcProvider;
  private readonly account: Account;

  constructor(opts: {
    rpcUrl: string;
    contractId: string;
    signerAccountId: string;
    signerKeyFile: string;
  }) {
    this.contractId = opts.contractId;
    this.provider = new JsonRpcProvider({ url: opts.rpcUrl });
    const creds = loadCredentialsFile(opts.signerKeyFile);
    const signer = KeyPairSigner.fromSecretKey(creds.private_key as KeyPairString);
    this.account = new Account(opts.signerAccountId, this.provider, signer);
  }

  async getConstitution(): Promise<Constitution> {
    const result = await this.provider.callFunction({
      contractId: this.contractId,
      method: "get_constitution",
      args: {},
    });
    return result as Constitution;
  }

  async getOrder(orderId: number): Promise<ChainOrder | null> {
    const result = await this.provider.callFunction({
      contractId: this.contractId,
      method: "get_order",
      args: { order_id: orderId },
    });
    return (result as ChainOrder | null) ?? null;
  }

  async callAgentMethod(
    method: AgentMethod,
    args: Record<string, unknown>,
    opts?: CallOptions,
  ): Promise<{ txHash?: string }> {
    const argsBytes = new TextEncoder().encode(JSON.stringify(args));
    const deposit = BigInt(opts?.depositYocto ?? "0");
    const outcome = await this.account.signAndSendTransaction({
      receiverId: this.contractId,
      actions: [actions.functionCall(method, argsBytes, opts?.gas ?? DEFAULT_GAS, deposit)],
      waitUntil: "FINAL",
    });
    const hash = (outcome as { transaction?: { hash?: string } }).transaction?.hash;
    return hash ? { txHash: hash } : {};
  }

  async viewAccessKey(accountId: string, publicKey: string): Promise<AccessKeyViewLike | null> {
    try {
      const view = await this.provider.viewAccessKey({ accountId, publicKey });
      return view as unknown as AccessKeyViewLike;
    } catch {
      return null;
    }
  }
}

// ---------------------------------------------------------------------------
// Mock client for unit tests. Simulates the contract's OBSERVABLE behaviour
// (state machine + refund band semantics from contract/src/lib.rs) without
// any network. Records every signed call it receives in `callLog` — note it
// sits INSIDE the leash guard in tests, so its log proves what actually
// would have been broadcast.
// ---------------------------------------------------------------------------

export interface RecordedCall {
  method: string;
  args: Record<string, unknown>;
  depositYocto: string;
}

export class MockChainClient implements ChainClient {
  readonly contractId: string;
  readonly callLog: RecordedCall[] = [];
  private readonly orders = new Map<number, ChainOrder>();
  private constitution: Constitution;
  /** Simulated clock (ns since epoch) for refund-window behaviour. */
  nowNs: bigint;

  constructor(opts?: { contractId?: string; constitution?: Partial<Constitution> }) {
    this.contractId = opts?.contractId ?? "bounden.testnet";
    this.constitution = {
      owner_id: "owner.testnet",
      agent_account_id: "cashier.bounden.testnet",
      agent_code_hash: "deadbeef",
      payment_token: "usdc.testnet",
      price_band_bps: 1000,
      refund_cap_usd: "50000000",
      refund_window_ns: 3_600_000_000_000,
      ...opts?.constitution,
    };
    this.nowNs = BigInt(this.constitution.refund_window_ns) * 10n;
  }

  addOrder(order: ChainOrder): void {
    this.orders.set(order.id, { ...order });
  }

  orderState(orderId: number): string | undefined {
    return this.orders.get(orderId)?.state;
  }

  async getConstitution(): Promise<Constitution> {
    return { ...this.constitution };
  }

  async getOrder(orderId: number): Promise<ChainOrder | null> {
    const o = this.orders.get(orderId);
    return o ? { ...o } : null;
  }

  async viewAccessKey(): Promise<AccessKeyViewLike | null> {
    return {
      nonce: 0,
      permission: {
        FunctionCall: {
          allowance: "250000000000000000000000",
          receiver_id: this.contractId,
          method_names: [...AGENT_METHOD_ALLOWLIST],
        },
      },
    };
  }

  async callAgentMethod(
    method: AgentMethod,
    args: Record<string, unknown>,
    opts?: CallOptions,
  ): Promise<{ txHash?: string }> {
    this.callLog.push({ method, args, depositYocto: opts?.depositYocto ?? "0" });
    const orderId = Number(args["order_id"]);
    const order = this.orders.get(orderId);
    if (!order) throw new Error("order not found");
    if (method === "fulfil_order") {
      if (order.state !== "Paid") throw new Error("only a Paid order can be fulfilled");
      order.state = "Fulfilled";
      return { txHash: `mock-fulfil-${orderId}` };
    }
    // issue_refund — mirrors the contract: band failure does NOT throw;
    // the order parks in RefundRejected and no money moves.
    if (order.state !== "Paid" && order.state !== "Fulfilled") {
      throw new Error("only a Paid or Fulfilled order can be refunded");
    }
    const withinCap = BigInt(order.amount_usd) <= BigInt(this.constitution.refund_cap_usd);
    const paidAt = order.paid_at === null ? 0n : BigInt(Math.trunc(order.paid_at));
    const withinWindow = this.nowNs - paidAt <= BigInt(this.constitution.refund_window_ns);
    if (withinCap && withinWindow) {
      order.state = "Refunded";
    } else {
      order.state = "RefundRejected";
    }
    return { txHash: `mock-refund-${orderId}` };
  }
}
