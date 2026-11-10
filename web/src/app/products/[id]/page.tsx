import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ModeBanner from "@/components/ModeBanner";
import ProductTabs from "@/components/ProductTabs";
import { fetchProduct } from "@/lib/shop";
import { formatUsd } from "@/lib/format";
import type { ProductKind } from "@/lib/types";

export const dynamic = "force-dynamic";

const KIND_LABELS: Record<ProductKind, string> = {
  LicenceKey: "Licence Key",
  ApiCreditCode: "API Credit",
  DownloadableAsset: "Download",
};

const KIND_DELIVERY: Record<ProductKind, string> = {
  LicenceKey:
    "On payment, the cashier releases one sealed licence key. Only the hash of the delivery is recorded on-chain; the key itself reaches only you.",
  ApiCreditCode:
    "On payment, the cashier releases one sealed credit code. Only the hash of the delivery is recorded on-chain; the code itself reaches only you.",
  DownloadableAsset:
    "On payment, the cashier releases a signed download link that expires and works once. The link is bound to your order's fulfilment record; the file itself never touches the chain.",
};

const KIND_RECEIVE: Record<ProductKind, string> = {
  LicenceKey:
    "One licence key, drawn from the sealed inventory in registration order, re-encrypted to you at delivery. The key carries an unmistakable test marker — this is demo inventory with no real-world value.",
  ApiCreditCode:
    "One API credit code, drawn from the sealed inventory in registration order, re-encrypted to you at delivery. The code carries an unmistakable test marker — this is demo inventory with no real-world value.",
  DownloadableAsset:
    "A signed download link for the asset: one use, short-lived, and bound to your order's fulfilment record so it cannot be replayed for a different order. Demo inventory — the file is a test artefact.",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const { data: product } = await fetchProduct(id);
  return {
    title: product ? product.name : "Product",
    description: product
      ? `${product.name} — ${formatUsd(product.price_usd)}, settled in USDC (Circle, NEAR testnet), delivered as a sealed code by a leashed cashier agent.`
      : undefined,
  };
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { data: product, mode, liveError, cachedAt } = await fetchProduct(id);
  if (product === null) notFound();

  return (
    <>
      <ModeBanner mode={mode} liveError={liveError} cachedAt={cachedAt} />

      <div className="page-head">
        <span className="badge">{KIND_LABELS[product.kind]}</span>
        <h1>{product.name}</h1>
        <p className="lede">
          Product <code>{product.id}</code> on the shop contract. The chain
          holds a hash of each unit of this product — never a usable code.
        </p>
      </div>

      <section className="price-panel" aria-label="Price and availability">
        <div className="pp-price">{formatUsd(product.price_usd)}</div>
        <div className="pp-rows">
          <div className="pp-row">
            <span className="k">Settlement</span>
            <span className="v">USDC (Circle, NEAR testnet), paid to the shop contract</span>
          </div>
          <div className="pp-row">
            <span className="k">Status</span>
            <span className="v">{product.active ? "For sale" : "Not currently for sale"}</span>
          </div>
          <div className="pp-row">
            <span className="k">Sealed units available</span>
            <span className="v">
              {product.inventoryAvailable === null
                ? "Not read"
                : product.inventoryAvailable === 0
                  ? "Sold out"
                  : product.inventoryAvailable}
            </span>
          </div>
        </div>
        <div className="pp-cta">
          <Link className="btn" href={`/checkout/${product.id}`}>
            How to buy
          </Link>
          <Link className="btn-ghost" href="/about">
            How the code stays secret
          </Link>
        </div>
      </section>

      <ProductTabs
        panels={[
          {
            id: "overview",
            label: "Overview",
            content: (
              <>
                <p>{KIND_DELIVERY[product.kind]}</p>
                <p>
                  What the chain records for this product is deliberately
                  boring: its id, its price, and one SHA-256 commitment per
                  sealed unit, each marked available or consumed. An explorer
                  can prove a unit existed and was spent — and learns nothing
                  about what the code was.
                </p>
                <p>
                  The cashier that fulfils your order holds a key allowlisted
                  to two methods on this contract. Its complete list of
                  powers is published on the{" "}
                  <Link href="/constitution">Constitution</Link> page, read
                  from the chain.
                </p>
              </>
            ),
          },
          {
            id: "receive",
            label: "What you receive",
            content: (
              <>
                <p>{KIND_RECEIVE[product.kind]}</p>
                <p>
                  You can verify your delivery yourself: the hash of the code
                  you received matches the commitment the chain consumed for
                  your order, and the delivery evidence hash is recorded in
                  the contract's fulfilment log, on your order's tracking
                  page.
                </p>
              </>
            ),
          },
          {
            id: "delivery",
            label: "Delivery & refunds",
            content: (
              <>
                <ol className="stepper mini">
                  <li>
                    <span className="step-num">1</span>
                    <h3>Create your order</h3>
                    <p>
                      From your wallet, call <code>create_order</code> on the
                      contract. The price is copied into the order at
                      creation.
                    </p>
                  </li>
                  <li>
                    <span className="step-num">2</span>
                    <h3>Pay the contract, exactly</h3>
                    <p>
                      The exact amount, from you, the buyer of record — any
                      other payment is refunded by the token in full.
                    </p>
                  </li>
                  <li>
                    <span className="step-num">3</span>
                    <h3>The cashier fulfils</h3>
                    <p>
                      The sealed item is released and the delivery evidence
                      hash is recorded on-chain.
                    </p>
                  </li>
                </ol>
                <p>
                  Refunds follow a band the contract enforces, not the
                  cashier's discretion: at most $50.00 per order, and only
                  within 1 hour of payment. Outside the band, no money moves
                  and the order is parked for the owner's review. The full
                  rules are on the <Link href="/constitution">Constitution</Link>.
                </p>
                <p>
                  <Link className="btn" href={`/checkout/${product.id}`}>
                    See the exact buying steps
                  </Link>
                </p>
              </>
            ),
          },
        ]}
      />
    </>
  );
}
