import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import CopyButton from "@/components/CopyButton";
import ModeBanner from "@/components/ModeBanner";
import { contractId, fetchProduct } from "@/lib/shop";
import { formatUsd } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const { data: product } = await fetchProduct(id);
  return {
    title: product ? `How to buy: ${product.name}` : "How to buy",
  };
}

/**
 * Checkout is an EXPLAINER at this stage: buying is a wallet action
 * (create_order, then pay the contract via the token's
 * ft_transfer_call), and the storefront does not hold keys or sign
 * anything. The page shows the exact calls a wallet makes, with the
 * buyer's own order id and the exact amount — the contract rejects any
 * payment that is not exact, from anyone but the buyer of record.
 */
export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { data: product, mode, liveError } = await fetchProduct(id);
  if (product === null) notFound();
  const contract = contractId() ?? "bounden.testnet";

  const transferCall = {
    contract: "3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af",
    method: "ft_transfer_call",
    args: {
      receiver_id: contract,
      amount: product.price_usd,
      msg: "<your order id, e.g. 0>",
    },
    attached_gas: "30 Tgas",
    attached_deposit: "1 yoctoNEAR",
  };
  const transferJson = JSON.stringify(transferCall, null, 2);

  return (
    <>
      <ModeBanner mode={mode} liveError={liveError} />

      <div className="page-head">
        <span className="badge">Checkout — explainer</span>
        <h1>How to buy: {product.name}</h1>
        <p className="lede">
          Price: <strong>{formatUsd(product.price_usd)}</strong>, settled in
          USDC (Circle, NEAR testnet). You pay the shop <em>contract</em> —
          never the cashier. This storefront holds no keys and signs nothing;
          buying is a wallet action, and these are the exact calls your
          wallet makes.
        </p>
      </div>

      <ol className="stepper">
        <li>
          <span className="step-num">1</span>
          <h3>Create your order</h3>
          <p>
            From your NEAR wallet, call <code>create_order</code> on the shop
            contract (<code>{contract}</code>) with{" "}
            <code>product_id: &quot;{product.id}&quot;</code>. The contract
            records the order with the price copied at creation — later price
            changes can never rewrite your order. You get a numeric order id.
          </p>
        </li>
        <li>
          <span className="step-num">2</span>
          <h3>Pay the contract, exactly</h3>
          <p>
            Call <code>ft_transfer_call</code> on the settlement token with
            your order id as the message (the exact call is below). The
            contract accepts the payment only if it comes from you, the buyer
            of record, and the amount equals the order amount{" "}
            <em>exactly</em>. Underpay or overpay and the token refunds you
            in full — the order stays unpaid.
          </p>
        </li>
        <li>
          <span className="step-num">3</span>
          <h3>The cashier fulfils</h3>
          <p>
            Once the order is Paid, the cashier releases your sealed item and
            records the delivery hash and its judgement attestation hash
            on-chain. Track it on the{" "}
            <Link href="/orders/0">order status page</Link> (replace 0 with
            your order id).
          </p>
        </li>
      </ol>

      <h2>The exact payment call</h2>
      <div className="code-card">
        <div className="code-head">
          <span className="code-title">ft_transfer_call — on the settlement token</span>
          <CopyButton text={transferJson} />
        </div>
        <pre>{transferJson}</pre>
      </div>
      <p className="muted">
        The <code>msg</code> is simply your order id as a decimal string —
        nothing else is parsed from it. The token contract above is Circle's
        NEAR testnet USDC — the only token the shop contract accepts.
      </p>

      <h2>What cannot happen</h2>
      <ul className="ruled">
        <li>
          The cashier cannot receive, hold, or redirect your payment —
          payments exist only between you and the contract.
        </li>
        <li>
          Nobody can pay your order for you, or pay a different amount and
          have it accepted.
        </li>
        <li>
          A refund, if one is due, can only go to you, the buyer of record,
          and only inside the contract's refund band — see the{" "}
          <Link href="/constitution">Constitution</Link>.
        </li>
      </ul>

      <h2>A note on cross-chain payment</h2>
      <p>
        NEAR Intents can quote a cross-chain price for this order (a{" "}
        <code>dry: true</code> quote from the 1Click API). Intents runs on
        mainnet only, so here it is a price proof, never the settlement rail
        — settlement is the testnet contract payment above, and we say so
        rather than pretend otherwise.
      </p>
    </>
  );
}
