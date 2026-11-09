/**
 * Shared shapes mirroring contract/src/lib.rs JSON views.
 * Amounts are stablecoin base units (usdc.testnet: 6 decimals) and are
 * carried as strings/bigints — never floats.
 */

export type OrderState =
  | "Created"
  | "Paid"
  | "Fulfilled"
  | "Cancelled"
  | "Refunded"
  | "RefundRejected";

export interface ChainOrder {
  id: number;
  buyer: string;
  product_id: string;
  /** U128 serialised as a decimal string. */
  amount_usd: string;
  state: OrderState;
  /** Block timestamp, nanoseconds since epoch. JSON number: at ~1.7e18
   *  a double loses only ~256 ns of precision — irrelevant against an
   *  hour-scale refund window; window maths below uses bigint deltas. */
  created_at: number;
  paid_at: number | null;
  judgement_attestation_hash: string | null;
  /** The contract ignores unknown fields; so does the worker. Anything
   *  extra on an order record (notes, memos, free text of any kind) is
   *  NEVER read, parsed for instructions, or acted on. */
  [extra: string]: unknown;
}

export interface Constitution {
  owner_id: string;
  agent_account_id: string | null;
  agent_code_hash: string | null;
  payment_token: string;
  price_band_bps: number;
  /** U128 serialised as a decimal string. */
  refund_cap_usd: string;
  refund_window_ns: number;
}

export interface FulfilmentRecord {
  order_id: number;
  action: string; // "fulfil" | "refund"
  evidence_hash: string;
  attestation_hash: string | null;
  at: number;
}

/** NEAR access-key view, structurally as returned by view_access_key. */
export type AccessKeyPermissionView =
  | "FullAccess"
  | {
      FunctionCall: {
        allowance: string | null;
        receiver_id: string;
        method_names: string[];
      };
    };

export interface AccessKeyViewLike {
  nonce: number;
  permission: AccessKeyPermissionView;
}
