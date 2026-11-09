import { viewAccessKey, viewCall } from "./near";
import {
  FIXTURE_AGENT_KEY,
  FIXTURE_CONSTITUTION,
  FIXTURE_PRODUCTS,
  fixtureOrder,
} from "./fixtures";
import type {
  AgentKeyInfo,
  ChainConstitution,
  ChainOrder,
  ChainProduct,
  ShopProduct,
} from "./types";

/**
 * Storefront data layer.
 *
 * Mode selection is by configuration, not by failure:
 *  - LIVE MODE: BOUNDEN_CONTRACT_ACCOUNT_ID is set. Pages read the
 *    contract over NEAR RPC view calls, server-side.
 *  - FIXTURE MODE: no contract configured. Pages render the labelled
 *    sample data in fixtures.ts — so the shop builds, demos, and can
 *    be judged locally before the contract exists on testnet.
 * If a live read FAILS, the layer falls back to fixture data and says
 * so (`liveError`) — fixture data is never presented as chain state.
 */

export type ShopMode = "live" | "fixture";

export interface DataResult<T> {
  data: T;
  mode: ShopMode;
  /** Set when live mode was configured but the read failed. */
  liveError?: string;
  /** Human-readable configuration note for the page banner. */
  note?: string;
}

export function contractId(): string | null {
  const v = process.env.BOUNDEN_CONTRACT_ACCOUNT_ID?.trim();
  return v ? v : null;
}

function productIds(): string[] {
  const raw = process.env.BOUNDEN_PRODUCT_IDS?.trim();
  if (!raw) return FIXTURE_PRODUCTS.map((p) => p.id);
  return raw.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
}

async function live<T>(fn: (contract: string) => Promise<T>, fallback: T): Promise<DataResult<T>> {
  const contract = contractId();
  if (contract === null) return { data: fallback, mode: "fixture" };
  try {
    return { data: await fn(contract), mode: "live" };
  } catch (err) {
    return {
      data: fallback,
      mode: "fixture",
      liveError: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function fetchProducts(): Promise<DataResult<ShopProduct[]>> {
  return live(async (contract) => {
    const out: ShopProduct[] = [];
    for (const id of productIds()) {
      const p = await viewCall<ChainProduct | null>(contract, "get_product", {
        product_id: id,
      });
      if (p === null) continue;
      const available = await viewCall<number>(contract, "inventory_available", {
        product_id: id,
      }).catch(() => null);
      out.push({ ...p, inventoryAvailable: available });
    }
    return out;
  }, FIXTURE_PRODUCTS);
}

export async function fetchProduct(id: string): Promise<DataResult<ShopProduct | null>> {
  const fixture = FIXTURE_PRODUCTS.find((p) => p.id === id) ?? null;
  return live(async (contract) => {
    const p = await viewCall<ChainProduct | null>(contract, "get_product", {
      product_id: id,
    });
    if (p === null) return null;
    const available = await viewCall<number>(contract, "inventory_available", {
      product_id: id,
    }).catch(() => null);
    return { ...p, inventoryAvailable: available };
  }, fixture);
}

export async function fetchOrder(id: number): Promise<DataResult<ChainOrder | null>> {
  return live(
    (contract) => viewCall<ChainOrder | null>(contract, "get_order", { order_id: id }),
    fixtureOrder(id),
  );
}

export interface ConstitutionData {
  constitution: ChainConstitution;
  agentKey: AgentKeyInfo | null;
}

export async function fetchConstitution(): Promise<DataResult<ConstitutionData>> {
  const fixture: ConstitutionData = {
    constitution: FIXTURE_CONSTITUTION,
    agentKey: FIXTURE_AGENT_KEY,
  };
  const result = await live(async (contract) => {
    const constitution = await viewCall<ChainConstitution>(contract, "get_constitution", {});
    let agentKey: AgentKeyInfo | null = null;
    const publicKey = process.env.BOUNDEN_AGENT_PUBLIC_KEY?.trim();
    if (constitution.agent_account_id && publicKey) {
      const key = await viewAccessKey(constitution.agent_account_id, publicKey);
      agentKey = {
        accountId: constitution.agent_account_id,
        publicKey,
        nonce: key.nonce,
        permission: key.permission,
      };
    }
    return { constitution, agentKey };
  }, fixture);
  if (result.mode === "live" && result.data.agentKey === null) {
    return {
      ...result,
      note:
        "The agent key's permission object is not shown because BOUNDEN_AGENT_PUBLIC_KEY " +
        "is not configured. Set it to the cashier's leashed public key to display the on-chain leash.",
    };
  }
  return result;
}
