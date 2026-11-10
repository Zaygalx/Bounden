import type { Metadata } from "next";
import Link from "next/link";
import ModeBanner from "@/components/ModeBanner";
import { fetchOrderCount, fetchProducts } from "@/lib/shop";
import { formatAge, formatUsd } from "@/lib/format";
import type { ProductKind } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Bounden",
  description:
    "A digital-goods shop run by an autonomous cashier whose authority is exactly two contract methods. It cannot steal, redirect, or over-refund — and its powers are public.",
};

const KIND_LABELS: Record<ProductKind, string> = {
  LicenceKey: "Licence Key",
  ApiCreditCode: "API Credit",
  DownloadableAsset: "Download",
};

export default async function HomePage() {
  const [{ data: products, mode, liveError, cachedAt }, countResult] = await Promise.all([
    fetchProducts(),
    fetchOrderCount(),
  ]);
  const ordersRecorded = mode !== "fixture" ? countResult.data : null;
  const sealedUnits = products.reduce<number | null>((acc, p) => {
    if (p.inventoryAvailable === null) return acc;
    return (acc ?? 0) + p.inventoryAvailable;
  }, null);

  const bookFigures: React.ReactNode[] = [
    <>
      <span className="fig">{products.length}</span>{" "}
      {products.length === 1 ? "good" : "goods"} for sale
    </>,
    <>
      <span className="fig">{sealedUnits ?? "—"}</span> sealed units in the
      vault
    </>,
  ];
  if (ordersRecorded !== null) {
    bookFigures.push(
      <>
        <span className="fig">{ordersRecorded}</span> orders entered
      </>,
    );
  }
  bookFigures.push(
    <>
      <span className="fig">5 of 5</span> attack cases refused
    </>,
  );

  return (
    <>
      <ModeBanner mode={mode} liveError={liveError} cachedAt={cachedAt} />

      <section className="hero">
        <div className="seal" aria-hidden="true">
          <span className="seal-name">Bounden</span>
          <span className="seal-sub">kept in the open</span>
        </div>
        <h1>
          The cashier cannot steal. Its powers are public, and they end
          where its job ends.
        </h1>
        <p className="hero-sub">
          Bounden is a working digital-goods shop on NEAR testnet, run by an
          autonomous agent. The agent holds exactly one key, and that key can
          call exactly two contract methods — fulfil an order, or refund
          inside a band the contract enforces. Everything else is refused by
          the protocol itself, not by the agent's good behaviour.
        </p>
        <div className="hero-cta">
          <a className="btn" href="#shop">
            Browse the shop
          </a>
          <Link className="btn-ghost" href="/constitution">
            Read the Constitution
          </Link>
        </div>
      </section>

      <div className="book-summary" aria-label="Shop figures">
        <p>
          {mode === "fixture" ? "The sample book: " : "The book so far: "}
          {bookFigures.map((f, i) => (
            <span key={i}>
              {i > 0 && (i === bookFigures.length - 1 ? ", and " : ", ")}
              {f}
            </span>
          ))}
          .
          {mode === "cached" && (
            <>
              {" "}
              Figures last read {cachedAt ? formatAge(cachedAt) : "recently"}.
            </>
          )}
        </p>
      </div>

      <section id="shop" aria-labelledby="shop-heading">
        <div className="section-head">
          <h2 id="shop-heading">The shop</h2>
          <span className="muted small">
            Prices in US dollars, settled in USDC (Circle, NEAR testnet)
          </span>
        </div>
        <p className="lede">
          Every item is delivered as a sealed code: the chain holds only a
          hash of it, never the code itself. You pay the shop contract —
          never the cashier.
        </p>

        <div className="ledger">
          {products.map((p) => (
            <article className="entry" key={p.id}>
              <div>
                <h3>
                  <Link href={`/products/${p.id}`}>{p.name}</Link>
                </h3>
                <div className="entry-meta">
                  <span>{KIND_LABELS[p.kind]}</span>
                  <span
                    className={`stock-dot${!p.active ? " out" : p.inventoryAvailable === null ? " unknown" : p.inventoryAvailable === 0 ? " out" : ""}`}
                    aria-hidden="true"
                  />
                  <span>
                    {!p.active
                      ? "Not for sale"
                      : p.inventoryAvailable === null
                        ? "Availability not read"
                        : p.inventoryAvailable === 0
                          ? "Sold out"
                          : `${p.inventoryAvailable} sealed`}
                  </span>
                </div>
              </div>
              <div className="entry-price">
                <div className="amount">{formatUsd(p.price_usd)}</div>
                <div className="note">
                  testnet USDC
                  <br />
                  to the contract
                </div>
              </div>
              <div className="entry-action">
                <Link className="text-link" href={`/products/${p.id}`}>
                  View product
                </Link>
              </div>
            </article>
          ))}
          {products.length === 0 && (
            <p>No products are configured. Set BOUNDEN_PRODUCT_IDS in live mode.</p>
          )}
        </div>
      </section>

      <section id="track" aria-labelledby="track-heading">
        <h2 id="track-heading">Track an order</h2>
        <p className="lede">
          Order ids are sequential numbers, starting at 0. The order page
          shows the state machine, the delivery evidence hash, and — where a
          NEAR AI Cloud judgement authorised the step — its attestation hash.
          Once an order is fulfilled, its buyer collects the item itself
          from the delivery counter on that page.
        </p>
        <form className="lookup" action="/orders" method="get">
          <label className="skip-link" htmlFor="track-id">
            Order id
          </label>
          <input
            id="track-id"
            name="id"
            inputMode="numeric"
            placeholder="Order id, e.g. 3"
            autoComplete="off"
            spellCheck={false}
            required
          />
          <button className="btn" type="submit">
            Look up
          </button>
        </form>
      </section>
    </>
  );
}
