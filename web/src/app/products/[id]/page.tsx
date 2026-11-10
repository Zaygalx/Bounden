import Link from "next/link";
import { notFound } from "next/navigation";
import ModeBanner from "@/components/ModeBanner";
import { fetchProduct } from "@/lib/shop";
import { formatUsd } from "@/lib/format";
import type { ProductKind } from "@/lib/types";

export const dynamic = "force-dynamic";

const KIND_LABELS: Record<ProductKind, string> = {
  LicenceKey: "Licence key",
  ApiCreditCode: "API credit code",
  DownloadableAsset: "Downloadable asset",
};

const KIND_DELIVERY: Record<ProductKind, string> = {
  LicenceKey:
    "On payment, the cashier releases one sealed licence key. Only the hash of the delivery is recorded on-chain; the key itself reaches only you.",
  ApiCreditCode:
    "On payment, the cashier releases one sealed credit code. Only the hash of the delivery is recorded on-chain; the code itself reaches only you.",
  DownloadableAsset:
    "On payment, the cashier releases a signed download link that expires and works once. The link is bound to your order's fulfilment record; the file itself never touches the chain.",
};

export default async function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { data: product, mode, liveError } = await fetchProduct(id);
  if (product === null) notFound();
  return (
    <>
      <ModeBanner mode={mode} liveError={liveError} />
      <span className="kind">{KIND_LABELS[product.kind]}</span>
      <h1>{product.name}</h1>
      <p className="price">{formatUsd(product.price_usd)}</p>
      <table className="kv">
        <tbody>
          <tr>
            <th>Product id</th>
            <td>
              <code>{product.id}</code>
            </td>
          </tr>
          <tr>
            <th>Status</th>
            <td>{product.active ? "For sale" : "Not currently for sale"}</td>
          </tr>
          <tr>
            <th>Sealed units available</th>
            <td>
              {product.inventoryAvailable === null
                ? "Not read"
                : product.inventoryAvailable}
            </td>
          </tr>
          <tr>
            <th>Settlement</th>
            <td>USDC (Circle, NEAR testnet), paid to the shop contract</td>
          </tr>
        </tbody>
      </table>

      <h2>How delivery works</h2>
      <p>{KIND_DELIVERY[product.kind]}</p>
      <p>
        <Link className="button" href={`/checkout/${product.id}`}>
          How to buy
        </Link>{" "}
        <Link className="button secondary" href="/about">
          How the code stays secret
        </Link>
      </p>
    </>
  );
}
