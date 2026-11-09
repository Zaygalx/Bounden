/**
 * Shapes mirroring the shop contract's JSON views
 * (contract/src/lib.rs: Product, Order, ConstitutionView) and the NEAR
 * access-key view. Amounts are stablecoin base units (usdc.testnet:
 * 6 decimals), carried as strings — never floats.
 */

export type ProductKind = "LicenceKey" | "ApiCreditCode" | "DownloadableAsset";

export interface ChainProduct {
  id: string;
  name: string;
  kind: ProductKind;
  /** U128 serialised as a decimal string (base units). */
  price_usd: string;
  active: boolean;
}

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
  amount_usd: string;
  state: OrderState;
  /** Block timestamps, nanoseconds since epoch (JSON numbers). */
  created_at: number;
  paid_at: number | null;
  judgement_attestation_hash: string | null;
}

export interface ChainConstitution {
  owner_id: string;
  agent_account_id: string | null;
  agent_code_hash: string | null;
  payment_token: string;
  price_band_bps: number;
  /** U128 serialised as a decimal string (base units). */
  refund_cap_usd: string;
  refund_window_ns: number;
}

/** NEAR access-key permission, structurally as returned by view_access_key. */
export type AccessKeyPermissionView =
  | "FullAccess"
  | {
      FunctionCall: {
        allowance: string | null;
        receiver_id: string;
        method_names: string[];
      };
    };

export interface AgentKeyInfo {
  accountId: string;
  publicKey: string;
  nonce: number;
  permission: AccessKeyPermissionView;
}

/** A product as the storefront renders it (chain product + stock count). */
export interface ShopProduct extends ChainProduct {
  inventoryAvailable: number | null;
}
