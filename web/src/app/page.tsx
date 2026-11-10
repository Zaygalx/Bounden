import type { Metadata } from "next";
import Link from "next/link";
import ModeBanner from "@/components/ModeBanner";
import { fetchOrder, fetchProducts } from "@/lib/shop";
import { formatAge, formatUsd } from "@/lib/format";
import type { ProductKind } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Bounden — the agent is bound. The money is not.",
  description:
    "A digital-goods shop run by an autonomous cashier whose authority is exactly two contract methods. It cannot steal, redirect, or over-refund — and its powers are public.",
};

const KIND_LABELS: Record<ProductKind, string> = {
  LicenceKey: "Licence Key",
  ApiCreditCode: "API Credit",
  DownloadableAsset: "Download",
};

/** Count orders by probing sequential ids until the chain says stop.
 *  Live (or last-known live) data only — fixture counts would dress
 *  samples up as state. */
async function countOrders(): Promise<number | null> {
  try {
    let n = 0;
    while (n < 64) {
      const r = await fetchOrder(n);
      if (r.mode === "fixture" || r.data === null) break;
      n++;
    }
    return n;
  } catch {
    return null;
  }
}

export default async function HomePage() {
  const { data: products, mode, liveError, cachedAt } = await fetchProducts();
  const ordersRecorded = mode !== "fixture" ? await countOrders() : null;
  const sealedUnits = products.reduce<number | null>((acc, p) => {
    if (p.inventoryAvailable === null) return acc;
    return (acc ?? 0) + p.inventoryAvailable;
  }, null);

  const stats: { num: React.ReactNode; label: string; sub?: string }[] = [
    {
      num: products.length,
      label: "Products live",
      sub:
        mode === "live"
          ? "read from the contract"
          : mode === "cached"
            ? `last read ${cachedAt ? formatAge(cachedAt) : "recently"}`
            : "fixture catalogue",
    },
    {
      num: sealedUnits ?? "—",
      label: "Sealed units available",
      sub: "hashes on-chain, codes off-chain",
    },
  ];
  if (ordersRecorded !== null) {
    stats.push({
      num: ordersRecorded,
      label: "Orders recorded",
      sub: "on the shop contract",
    });
  }
  stats.push({
    num: (
      <>
        5<span className="accent">/5</span>
      </>
    ),
    label: "Attack cases refused",
    sub: "live and reproducible — see the Constitution",
  });

  return (
    <>
      <ModeBanner mode={mode} liveError={liveError} cachedAt={cachedAt} />

      <section className="hero">
        <p className="hero-eyebrow">An agent-run shop on NEAR testnet</p>
        <h1>
          The cashier <em>cannot steal</em>. Its powers are public, and they
          end where its job ends.
        </h1>
        <p className="hero-sub">
          Bounden is a working digital-goods shop run by an autonomous agent.
          The agent holds exactly one key, and that key can call exactly two
          contract methods — fulfil an order, or refund inside a band the
          contract enforces. Everything else is refused by the protocol
          itself, not by the agent's good behaviour.
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

      <section className="stats-strip" aria-label="Shop figures">
        {stats.map((s) => (
          <div className="stat" key={s.label}>
            <div className="stat-num">{s.num}</div>
            <div className="stat-label">{s.label}</div>
            {s.sub ? <div className="stat-sub">{s.sub}</div> : null}
          </div>
        ))}
      </section>

      <section id="shop" aria-labelledby="shop-heading">
        <div className="section-head">
          <h2 id="shop-heading">The shop</h2>
          <span className="muted small">
            Priced in USD · settled in USDC (Circle, NEAR testnet)
          </span>
        </div>
        <p className="lede">
          Every item is delivered as a sealed code: the chain holds only a
          hash of it, never the code itself. You pay the shop contract —
          never the cashier.
        </p>

        <div className="grid">
          {products.map((p) => (
            <article className="product-card" key={p.id}>
              <div className="card-top">
                <span className="badge">{KIND_LABELS[p.kind]}</span>
                <span className="stock">
                  <span
                    className={`stock-dot${!p.active ? " out" : p.inventoryAvailable === null ? " unknown" : p.inventoryAvailable === 0 ? " out" : ""}`}
                    aria-hidden="true"
                  />
                  {!p.active
                    ? "Not for sale"
                    : p.inventoryAvailable === null
                      ? "Availability not read"
                      : p.inventoryAvailable === 0
                        ? "Sold out"
                        : `${p.inventoryAvailable} sealed`}
                </span>
              </div>
              <h3>{p.name}</h3>
              <div className="spacer" />
              <div className="price-row">
                <span className="price">{formatUsd(p.price_usd)}</span>
                <span className="price-note">
                  testnet USDC
                  <br />
                  to the contract
                </span>
              </div>
              <Link className="btn btn-block" href={`/products/${p.id}`}>
                View product
              </Link>
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
