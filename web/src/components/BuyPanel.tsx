"use client";

import { internalActionToNaj } from "@near-wallet-selector/core";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatNear, formatUsd } from "@/lib/format";
import {
  buildPurchaseTransactions,
  classifyTokenPanic,
  TOKEN_CONTRACT_ID,
} from "@/lib/purchase";
import { useWallet } from "./WalletProvider";

/**
 * Buy with your wallet — the connected path. The visitor's wallet
 * signs ONE batch of the two calls the manual flow makes by hand
 * (create_order, then the exact ft_transfer_call payment — payload
 * from lib/purchase.ts, the figures the live orders proved). This
 * page holds no keys and signs nothing; it builds the payload and
 * the wallet does the rest. On success the buyer is sent to their
 * order's tracking page.
 *
 * Before any of that, a pre-flight reads the buyer's standing: an
 * account the token contract has never seen (no storage
 * registration), one whose USDC cannot cover the price, or one
 * whose NEAR cannot cover the batch's network fees would otherwise
 * fail mid-purchase — the payment panicking on-chain after the
 * order was already created, or the batch dying for gas. The
 * pre-flight stops the purchase before anything is numbered or
 * signed and says, in plain words, what is missing and where the
 * missing testnet funds come from.
 */

const RPC_ENDPOINTS = [
  "https://rpc.testnet.near.org",
  "https://rpc.testnet.fastnear.com",
];

/** Probe get_order sequentially for the first id the chain has not
 *  issued — the same probe the server layout runs, done here in the
 *  browser because the batch must name the new order's id. */
async function probeNextOrderId(contractId: string): Promise<number> {
  for (let id = 0; id < 64; id++) {
    const argsBase64 = btoa(JSON.stringify({ order_id: id }));
    let served = false;
    for (const url of RPC_ENDPOINTS) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: "bounden-buy",
            method: "query",
            params: {
              request_type: "call_function",
              finality: "final",
              account_id: contractId,
              method_name: "get_order",
              args_base64: argsBase64,
            },
          }),
        });
        if (!res.ok) continue;
        const json = (await res.json()) as {
          result?: { result?: number[] };
          error?: unknown;
        };
        if (json.error || !json.result || !Array.isArray(json.result.result)) {
          continue;
        }
        served = true;
        const text = new TextDecoder().decode(
          new Uint8Array(json.result.result),
        );
        if (JSON.parse(text) === null) return id;
        break;
      } catch {
        // Try the next endpoint.
      }
    }
    if (!served) {
      throw new Error(
        "The chain could not be read to number your order. Nothing was signed — try again in a moment.",
      );
    }
  }
  throw new Error("The order book probe ran off its page. Nothing was signed.");
}

/** One read-only call against a contract, walking the same RPC
 *  rotation the order probe uses. Resolves with the decoded JSON
 *  value (null is a real answer on NEAR); rejects when no endpoint
 *  served the call. */
async function callView(
  contractId: string,
  methodName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const argsBase64 = btoa(JSON.stringify(args));
  for (const url of RPC_ENDPOINTS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "bounden-buy",
          method: "query",
          params: {
            request_type: "call_function",
            finality: "final",
            account_id: contractId,
            method_name: methodName,
            args_base64: argsBase64,
          },
        }),
      });
      if (!res.ok) continue;
      const json = (await res.json()) as {
        result?: { result?: number[] };
        error?: unknown;
      };
      if (json.error || !json.result || !Array.isArray(json.result.result)) {
        continue;
      }
      const text = new TextDecoder().decode(
        new Uint8Array(json.result.result),
      );
      return JSON.parse(text) as unknown;
    } catch {
      // Try the next endpoint.
    }
  }
  throw new Error("no endpoint served the call");
}

/** One read-only account view (the NEAR balance), walking the same
 *  RPC rotation. Resolves with the account object; rejects when no
 *  endpoint served the call. */
async function callAccountView(
  accountId: string,
): Promise<{ amount?: string }> {
  for (const url of RPC_ENDPOINTS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "bounden-buy",
          method: "query",
          params: {
            request_type: "view_account",
            finality: "final",
            account_id: accountId,
          },
        }),
      });
      if (!res.ok) continue;
      const json = (await res.json()) as {
        result?: { amount?: string };
        error?: unknown;
      };
      if (json.error || !json.result) continue;
      return json.result;
    } catch {
      // Try the next endpoint.
    }
  }
  throw new Error("no endpoint served the call");
}

/** The headroom the batch's network fees must fit inside: the two
 *  calls attach 105 Tgas and a single yocto of deposit, and their
 *  true burn is a small fraction of this — 0.01 NEAR covers them
 *  with room to spare. */
const MIN_NEAR_HEADROOM_YOCTO = 10n ** 22n; // 0.01 NEAR

type Preflight = { kind: "ok" } | { kind: "stop"; message: string };

/**
 * The pre-flight: is this buyer known to the payment token, can
 * their USDC cover the price, and can their NEAR cover the network
 * fees? Runs before the order is numbered and before anything is
 * signed — a stop here creates nothing.
 */
async function preflightPurchase(
  accountId: string,
  priceBaseUnits: string,
): Promise<Preflight> {
  let storage: unknown;
  let balanceRaw: unknown;
  try {
    storage = await callView(TOKEN_CONTRACT_ID, "storage_balance_of", {
      account_id: accountId,
    });
    if (storage !== null && storage !== undefined) {
      balanceRaw = await callView(TOKEN_CONTRACT_ID, "ft_balance_of", {
        account_id: accountId,
      });
    }
  } catch {
    return {
      kind: "stop",
      message:
        "The chain could not be read to check your USDC, so the purchase stopped before anything was signed. Nothing was created — try again in a moment.",
    };
  }
  if (storage === null || storage === undefined) {
    return {
      kind: "stop",
      message:
        "Your wallet is connected, but this account is not yet registered with the USDC contract, so a payment from it would be refused. Registration arrives with your first testnet USDC: claim some at faucet.circle.com (choose NEAR testnet and USDC) — the delivery registers the account as it lands, and it can take a minute to settle. Nothing was signed and no order was created.",
    };
  }
  let balance = 0n;
  try {
    balance = BigInt(String(balanceRaw));
  } catch {
    balance = 0n;
  }
  let price: bigint | null = null;
  try {
    price = BigInt(priceBaseUnits);
  } catch {
    price = null;
  }
  if (price !== null && balance < price) {
    return {
      kind: "stop",
      message: `Your wallet is connected, but it holds ${formatUsd(balance.toString())} in USDC — short of the ${formatUsd(priceBaseUnits)} this costs. Top up with testnet USDC at faucet.circle.com (choose NEAR testnet and USDC); a delivery can take a minute to settle. Nothing was signed and no order was created.`,
    };
  }
  let nearYocto: bigint;
  try {
    const account = await callAccountView(accountId);
    nearYocto = BigInt(String(account.amount ?? "0"));
  } catch {
    return {
      kind: "stop",
      message:
        "The chain could not be read to check your NEAR balance, so the purchase stopped before anything was signed. Nothing was created — try again in a moment.",
    };
  }
  if (nearYocto < MIN_NEAR_HEADROOM_YOCTO) {
    return {
      kind: "stop",
      message: `Your wallet is connected, but it holds ${formatNear(nearYocto.toString())} — not enough NEAR for the network fees on the two calls. About 0.01 NEAR covers them with room to spare. Testnet NEAR is free: a wallet created at testnet.mynearwallet.com arrives funded, and most testnet wallets offer a faucet drip for more. Nothing was signed and no order was created.`,
    };
  }
  return { kind: "ok" };
}

type Phase =
  | { kind: "idle" }
  | { kind: "working"; label: string }
  | { kind: "error"; message: string };

export default function BuyPanel({
  productId,
  priceUsd,
  contractId,
  available,
  active,
}: {
  productId: string;
  priceUsd: string;
  contractId: string | null;
  available: number | null;
  active: boolean;
}) {
  const { accountId, connect, getSelector } = useWallet();
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  if (!contractId) return null;

  const purchasable = active && available !== 0;

  const buy = async () => {
    try {
      if (!accountId) {
        setPhase({
          kind: "error",
          message:
            "The wallet is not connected yet. Nothing was signed — connect it above and try again.",
        });
        return;
      }
      setPhase({ kind: "working", label: "Checking your USDC first…" });
      const preflight = await preflightPurchase(accountId, priceUsd);
      if (preflight.kind === "stop") {
        setPhase({ kind: "error", message: preflight.message });
        return;
      }
      setPhase({ kind: "working", label: "Numbering your order…" });
      const orderId = await probeNextOrderId(contractId);
      const selector = await getSelector();
      if (!selector) {
        throw new Error("The wallet is not ready yet. Nothing was signed.");
      }
      const wallet = await selector.wallet();
      const transactions = buildPurchaseTransactions({
        shopContractId: contractId,
        productId,
        priceUsd,
        orderId,
      });
      setPhase({
        kind: "working",
        label: "Your wallet is asking for its signature…",
      });
      // The selector's signAndSendTransactions expects near-api-js
      // Action objects, not the plain internal shape purchase.ts
      // builds in — wallet modules convert from the NAJ form (Meteor
      // runs each action through najActionToInternal, which throws
      // "Unsupported NAJ action" on a plain object). Convert with the
      // selector's own helper: the resulting NAJ actions carry the
      // identical method, args, gas and deposit purchase.ts built.
      await wallet.signAndSendTransactions({
        transactions: transactions.map((tx) => ({
          receiverId: tx.receiverId,
          actions: tx.actions.map((action) => internalActionToNaj(action)),
        })),
      });
      router.push(`/orders/${orderId}`);
      router.refresh();
    } catch (err) {
      // Backstop for the race the pre-flight cannot see (a balance
      // that moved between the check and the signature): if the
      // token contract's own panic is in the failure, answer with
      // the same plain guidance instead of the raw chain error.
      const panic = classifyTokenPanic(
        err instanceof Error ? err.message : "",
      );
      if (panic === "unregistered") {
        setPhase({
          kind: "error",
          message:
            "The purchase did not complete: the payment was refused because this account is not registered with the USDC contract. Claim testnet USDC at faucet.circle.com (choose NEAR testnet and USDC) — the delivery registers the account as it lands. If an order was numbered for this attempt it stands in the book unpaid, and no USDC moved.",
        });
      } else if (panic === "insufficient") {
        setPhase({
          kind: "error",
          message:
            "The purchase did not complete: the payment was refused because the USDC balance does not cover the price. Top up at faucet.circle.com (choose NEAR testnet and USDC) and buy again. If an order was numbered for this attempt it stands in the book unpaid, and no USDC moved.",
        });
      } else {
        setPhase({
          kind: "error",
          message:
            err instanceof Error
              ? `The purchase did not complete: ${err.message}`
              : "The purchase did not complete. Nothing further was signed.",
        });
      }
    }
  };

  return (
    <section className="buy-panel" aria-label="Buy with your wallet">
      <h2>Buy with your wallet</h2>
      <p>
        Price <strong>{formatUsd(priceUsd)}</strong>, paid from your wallet
        to the shop contract — never to this page, which holds no keys and
        signs nothing. One wallet confirmation signs both calls:{" "}
        <code>create_order</code> on the shop, then the exact{" "}
        <code>ft_transfer_call</code> payment to it. Then we take you to
        your order&rsquo;s page, where the cashier&rsquo;s fulfilment is
        recorded.
      </p>
      {!purchasable ? (
        <p className="buy-note">
          {active
            ? "This product is sold out — every sealed unit is spoken for."
            : "This product is not currently for sale."}
        </p>
      ) : accountId ? (
        <>
          <p className="buy-note">
            Connected as <span className="buy-account">{accountId}</span>
          </p>
          <button
            type="button"
            className="btn"
            disabled={phase.kind === "working"}
            onClick={() => void buy()}
          >
            {phase.kind === "working" ? phase.label : `Buy — ${formatUsd(priceUsd)}`}
          </button>
        </>
      ) : (
        <button type="button" className="btn" onClick={connect}>
          Connect wallet to buy
        </button>
      )}
      {phase.kind === "error" && (
        <p className="buy-error" role="alert">
          {phase.message}
        </p>
      )}
    </section>
  );
}
