import type {
  AgentKeyInfo,
  ChainConstitution,
  ChainOrder,
  ShopProduct,
} from "./types";

/**
 * FIXTURE DATA — sample shop state for FIXTURE MODE (no contract
 * configured). Every value here is invented for local demonstration:
 * the accounts do not hold the contract, the orders never happened,
 * the attestation hash below is not a real TEE attestation. Pages
 * render fixture data only under a visible FIXTURE MODE banner, and
 * the data layer falls back here — labelled — when a live read fails.
 * The prices, bands and product ids deliberately mirror the planned
 * live configuration (docs/PREFLIGHT.md §7) so the demo looks the same
 * in both modes; the numbers are not chain state.
 */

export const FIXTURE_PRODUCTS: ShopProduct[] = [
  {
    id: "licence-pro",
    name: "Bounden Studio Pro — 1-year licence",
    kind: "LicenceKey",
    price_usd: "25000000",
    active: true,
    inventoryAvailable: 3,
  },
  {
    id: "api-credits-10k",
    name: "Bounden API Credits — 10,000 calls",
    kind: "ApiCreditCode",
    price_usd: "10000000",
    active: true,
    inventoryAvailable: 5,
  },
  {
    id: "asset-pack-starter",
    name: "Starter Asset Pack — downloadable",
    kind: "DownloadableAsset",
    price_usd: "15000000",
    active: true,
    inventoryAvailable: 2,
  },
];

export const FIXTURE_CONSTITUTION: ChainConstitution = {
  owner_id: "bounden.testnet",
  agent_account_id: "cashier.bounden.testnet",
  // Hex-shaped but visibly patterned: a placeholder, not a real hash.
  agent_code_hash:
    "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
  // The live shop's real settlement token: Circle's NEAR testnet USDC.
  payment_token: "3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af",
  price_band_bps: 1000,
  refund_cap_usd: "50000000",
  refund_window_ns: 3_600_000_000_000,
};

export const FIXTURE_AGENT_PUBLIC_KEY =
  "ed25519:7wQzFixtureKeyForBoundenDemo1111111111111111";

export const FIXTURE_AGENT_KEY: AgentKeyInfo = {
  accountId: "cashier.bounden.testnet",
  publicKey: FIXTURE_AGENT_PUBLIC_KEY,
  nonce: 0,
  permission: {
    FunctionCall: {
      allowance: "250000000000000000000000", // 0.25 NEAR
      receiver_id: "bounden.testnet",
      method_names: ["fulfil_order", "issue_refund"],
    },
  },
};

const FIXTURE_EPOCH = 1_794_200_000_000_000_000; // illustrative only

export const FIXTURE_ORDERS: ChainOrder[] = [
  {
    id: 0,
    buyer: "demo-buyer.testnet",
    product_id: "licence-pro",
    amount_usd: "25000000",
    state: "Fulfilled",
    created_at: FIXTURE_EPOCH,
    paid_at: FIXTURE_EPOCH + 120_000_000_000,
    // Hex-shaped but visibly patterned: a placeholder, not an attestation.
    judgement_attestation_hash:
      "near-ai:feedfacefeedfacefeedfacefeedfacefeedfacefeedfacefeedfacefeedface",
  },
  {
    id: 1,
    buyer: "demo-buyer.testnet",
    product_id: "api-credits-10k",
    amount_usd: "10000000",
    state: "Paid",
    created_at: FIXTURE_EPOCH + 3_600_000_000_000,
    paid_at: FIXTURE_EPOCH + 3_660_000_000_000,
    judgement_attestation_hash: null,
  },
];

export function fixtureOrder(id: number): ChainOrder | null {
  return FIXTURE_ORDERS.find((o) => o.id === id) ?? null;
}

/**
 * Fixture delivery evidence, keyed by order id — invented like
 * everything in this file, rendered only under the fixture banner.
 * The hash is hex-shaped but visibly patterned: a placeholder.
 */
export const FIXTURE_EVIDENCE: Record<
  number,
  { evidenceHash: string; attestationHash: string | null; at: number }
> = {
  0: {
    evidenceHash:
      "cafef00dcafef00dcafef00dcafef00dcafef00dcafef00dcafef00dcafef00d",
    attestationHash:
      "near-ai:feedfacefeedfacefeedfacefeedfacefeedfacefeedfacefeedfacefeedface",
    at: FIXTURE_EPOCH + 180_000_000_000,
  },
};
