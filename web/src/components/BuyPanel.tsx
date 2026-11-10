"use client";

import type { Transaction } from "@near-wallet-selector/core";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatUsd } from "@/lib/format";
import { buildPurchaseTransactions } from "@/lib/purchase";
import { useWallet } from "./WalletProvider";

/**
 * Buy with your wallet — the connected path. The visitor's wallet
 * signs ONE batch of the two calls the manual flow makes by hand
 * (create_order, then the exact ft_transfer_call payment — payload
 * from lib/purchase.ts, the figures the live orders proved). This
 * page holds no keys and signs nothing; it builds the payload and
 * the wallet does the rest. On success the buyer is sent to their
 * order's tracking page.
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
      await wallet.signAndSendTransactions({
        transactions: transactions as unknown as Transaction[],
      });
      router.push(`/orders/${orderId}`);
      router.refresh();
    } catch (err) {
      setPhase({
        kind: "error",
        message:
          err instanceof Error
            ? `The purchase did not complete: ${err.message}`
            : "The purchase did not complete. Nothing further was signed.",
      });
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
