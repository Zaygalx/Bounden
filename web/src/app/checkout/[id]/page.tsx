import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import BuyPanel from "@/components/BuyPanel";
import CopyButton from "@/components/CopyButton";
import ModeBanner from "@/components/ModeBanner";
import { contractId, fetchProduct } from "@/lib/shop";
import { TOKEN_CONTRACT_ID } from "@/lib/purchase";
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
 * Checkout is a wallet action with an EXPLAINER kept beside it:
 * buying is create_order, then pay the contract via the token's
 * ft_transfer_call, and the storefront does not hold keys or sign
 * anything. A connected visitor can sign both calls from this page
 * (BuyPanel — the payload is lib/purchase.ts, the figures the live
 * orders proved); the explainer below still shows the exact calls
 * for anyone who would rather make them by hand — same payload,
 * same contract, no difference in what the chain sees.
 */
export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { data: product, mode, liveError, cachedAt } = await fetchProduct(id);
  if (product === null) notFound();
  const contract = contractId() ?? "bounden.testnet";

  const transferCall = {
    contract: TOKEN_CONTRACT_ID,
    method: "ft_transfer_call",
    args: {
      receiver_id: contract,
      amount: product.price_usd,
      msg: "<your order id, e.g. 0>",
    },
    // 100 Tgas is the figure the live payments for orders 2 and 3
    // landed with; 30 Tgas failed on-chain ("More gas is required").
    attached_gas: "100 Tgas",
    attached_deposit: "1 yoctoNEAR",
  };
  const transferJson = JSON.stringify(transferCall, null, 2);

  return (
    <>
      <ModeBanner mode={mode} liveError={liveError} cachedAt={cachedAt} />

      <div className="page-head">
        <span className="badge">Checkout, explained</span>
        <h1>How to buy: {product.name}</h1>
        <p className="lede">
          Price: <strong>{formatUsd(product.price_usd)}</strong>, settled in
          USDC (Circle, NEAR testnet). You pay the shop <em>contract</em> —
          never the cashier. This storefront holds no keys and signs nothing;
          buying is a wallet action, and these are the exact calls your
          wallet makes.
        </p>
        <p>
          <strong>No account, no login</strong> — the transfer from your
          wallet is the whole checkout.
        </p>
      </div>

      <BuyPanel
        productId={product.id}
        priceUsd={product.price_usd}
        contractId={contractId()}
        available={product.inventoryAvailable}
        active={product.active}
      />

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

      <h2>Testing this shop as a judge</h2>
      <p>
        The whole purchase can be run live from this page. You need three
        things, all testnet, all free: a NEAR testnet wallet (for
        example{" "}
        <a href="https://testnet.mynearwallet.com" target="_blank" rel="noreferrer">
          MyNearWallet
        </a>
        ), a little testnet NEAR in it for network fees, and testnet USDC
        from{" "}
        <a href="https://faucet.circle.com" target="_blank" rel="noreferrer">
          Circle&rsquo;s public faucet
        </a>{" "}
        (choose NEAR testnet). Then: <strong>Connect wallet</strong> in
        the sidebar, <strong>Buy</strong> above, sign the one batch your
        wallet shows you, and follow the order on its tracking page.
      </p>
      <p>
        One honest note about the cashier: it is a program on a leash, not
        a person on a shift. While it is on duty it passes every few
        seconds, and it is on duty through the judging period — a paid
        order is normally fulfilled within the minute. If you ever pay
        while it rests, your order waits at <em>Paid</em> on its tracking
        page: visible, exact, and first in line when the cashier returns.
        Nothing about a waiting order is hidden or lost.
      </p>

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
