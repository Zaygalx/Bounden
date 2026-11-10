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
 *
 * Degradation when a live read fails (Stage 5 v3 — the public RPC
 * rate-limits, and a transient 429 must never greet a visitor with
 * sample numbers while the chain is fine):
 *   1. a fresh cache hit (BOUNDEN_CACHE_TTL_MS, default 30 s) is
 *      served as live — repeat visits do not hammer the RPC;
 *   2. failing that, the LAST-KNOWN live value for the same read is
 *      served as mode "cached", labelled with the time it was read;
 *   3. only when no live value has ever been read does the layer fall
 *      back to fixture data, with `liveError` set.
 * Fixture data is never presented as chain state, and cached data is
 * never presented as freshly read.
 */

export type ShopMode = "live" | "cached" | "fixture";

export interface DataResult<T> {
  data: T;
  mode: ShopMode;
  /** Set when live mode was configured but the read failed. */
  liveError?: string;
  /** When mode is "cached": epoch ms when the data was read live. */
  cachedAt?: number;
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

/* ------------------------------------------------------------------ */
/* Read-through cache + last-known-live store (per server process).    */
/* ------------------------------------------------------------------ */

const CACHE_TTL_MS = (() => {
  const raw = Number(process.env.BOUNDEN_CACHE_TTL_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : 30_000;
})();

interface CacheEntry {
  data: unknown;
  at: number;
}

const cache = new Map<string, CacheEntry>();

async function live<T>(
  key: string,
  fn: (contract: string) => Promise<T>,
  fallback: T,
): Promise<DataResult<T>> {
  const contract = contractId();
  if (contract === null) return { data: fallback, mode: "fixture" };

  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return { data: hit.data as T, mode: "live" };
  }
  try {
    const data = await fn(contract);
    cache.set(key, { data, at: Date.now() });
    return { data, mode: "live" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (hit) {
      return { data: hit.data as T, mode: "cached", cachedAt: hit.at, liveError: message };
    }
    return { data: fallback, mode: "fixture", liveError: message };
  }
}

export async function fetchProducts(): Promise<DataResult<ShopProduct[]>> {
  return live("products", async (contract) => {
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
  return live(`product:${id}`, async (contract) => {
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
    `order:${id}`,
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
  const result = await live("constitution", async (contract) => {
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
  if (result.mode !== "fixture" && result.data.agentKey === null) {
    return {
      ...result,
      note:
        "The agent key's permission object is not shown because BOUNDEN_AGENT_PUBLIC_KEY " +
        "is not configured. Set it to the cashier's leashed public key to display the on-chain leash.",
    };
  }
  return result;
}
