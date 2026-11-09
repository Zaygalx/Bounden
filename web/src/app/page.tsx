import Link from "next/link";
import ModeBanner from "@/components/ModeBanner";
import { fetchProducts } from "@/lib/shop";
import { formatUsd } from "@/lib/format";
import type { ProductKind } from "@/lib/types";

export const dynamic = "force-dynamic";

const KIND_LABELS: Record<ProductKind, string> = {
  LicenceKey: "Licence key",
  ApiCreditCode: "API credit code",
  DownloadableAsset: "Downloadable asset",
};

export default async function CataloguePage() {
  const { data: products, mode, liveError } = await fetchProducts();
  return (
    <>
      <ModeBanner mode={mode} liveError={liveError} />
      <h1>Catalogue</h1>
      <p className="lede">
        Digital goods, priced in USD and settled in testnet USDC. Every item is
        delivered as a sealed code: the chain holds only a hash of it, never
        the code itself. The cashier that fulfils your order holds exactly two
        powers — see the <Link href="/constitution">Constitution</Link>.
      </p>

      <div className="grid">
        {products.map((p) => (
          <article className="card" key={p.id}>
            <span className="kind">{KIND_LABELS[p.kind]}</span>
            <h3>{p.name}</h3>
            <div className="price">{formatUsd(p.price_usd)}</div>
            <div className="stock">
              {p.active
                ? p.inventoryAvailable === null
                  ? "Availability not read"
                  : `${p.inventoryAvailable} sealed unit${p.inventoryAvailable === 1 ? "" : "s"} available`
                : "Not currently for sale"}
            </div>
            <div className="spacer" />
            <Link className="button" href={`/products/${p.id}`}>
              View product
            </Link>
          </article>
        ))}
        {products.length === 0 && (
          <p>No products are configured. Set BOUNDEN_PRODUCT_IDS in live mode.</p>
        )}
      </div>

      <h2>Check an order</h2>
      <p className="lede">Order ids are sequential numbers, starting at 0.</p>
      <form className="lookup" action="/orders" method="get">
        <input name="id" inputMode="numeric" placeholder="Order id, e.g. 0" required />
        <button className="button" type="submit">
          Look up
        </button>
      </form>
    </>
  );
}
