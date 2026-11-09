import Link from "next/link";
import ModeBanner from "@/components/ModeBanner";
import { fetchOrder, fetchProduct } from "@/lib/shop";
import { formatTimestampNs, formatUsd } from "@/lib/format";
import type { OrderState } from "@/lib/types";

export const dynamic = "force-dynamic";

const STATE_EXPLAINED: Record<OrderState, string> = {
  Created: "The order exists but has not been paid. Pay the contract exactly the order amount to move it forward.",
  Paid: "Payment accepted and recorded by the contract. The cashier will fulfil this order on its next pass.",
  Fulfilled: "The cashier has released the sealed item and recorded the delivery evidence hash on-chain.",
  Cancelled: "Cancelled by the buyer before payment. No money moved.",
  Refunded: "The buyer was refunded in full by the contract, inside the refund band.",
  RefundRejected:
    "A refund was requested outside the contract's band (cap or window). No money moved; the order is parked for the owner's review.",
};

export default async function OrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const orderId = /^\d+$/.test(id) ? Number(id) : NaN;
  const { data: order, mode, liveError } = Number.isNaN(orderId)
    ? { data: null, mode: "fixture" as const, liveError: undefined }
    : await fetchOrder(orderId);
  const product =
    order !== null ? (await fetchProduct(order.product_id)).data : null;

  return (
    <>
      <ModeBanner mode={mode} liveError={liveError} />
      <h1>Order {Number.isNaN(orderId) ? id : orderId}</h1>
      {order === null ? (
        <p>
          No order with this id was found. Order ids are sequential from 0
          {mode === "fixture"
            ? "; in fixture mode, orders 0 and 1 exist as samples."
            : "."}{" "}
          <Link href="/">Back to the catalogue</Link>.
        </p>
      ) : (
        <>
          <p>
            <span
              className={`state-badge${order.state === "Fulfilled" ? " done" : ""}`}
            >
              {order.state}
            </span>
          </p>
          <p className="lede">{STATE_EXPLAINED[order.state]}</p>
          <table className="kv">
            <tbody>
              <tr>
                <th>Product</th>
                <td>
                  {product ? (
                    <Link href={`/products/${product.id}`}>{product.name}</Link>
                  ) : (
                    <code>{order.product_id}</code>
                  )}
                </td>
              </tr>
              <tr>
                <th>Amount</th>
                <td>{formatUsd(order.amount_usd)} (testnet USDC)</td>
              </tr>
              <tr>
                <th>Buyer of record</th>
                <td>
                  <code>{order.buyer}</code>
                </td>
              </tr>
              <tr>
                <th>Created</th>
                <td>{formatTimestampNs(order.created_at)}</td>
              </tr>
              <tr>
                <th>Paid</th>
                <td>{formatTimestampNs(order.paid_at)}</td>
              </tr>
              <tr>
                <th>Judgement attestation hash</th>
                <td>
                  {order.judgement_attestation_hash ? (
                    <>
                      <span className="hash">{order.judgement_attestation_hash}</span>
                      <br />
                      The hash of the NEAR AI Cloud attestation for the
                      judgement behind this order's fulfilment or refund —
                      verifiable against the model's attestation report.
                    </>
                  ) : (
                    "None recorded — this order was handled without a judgement layer, or none has acted yet."
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </>
      )}
    </>
  );
}
