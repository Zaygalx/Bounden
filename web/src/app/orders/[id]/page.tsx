import type { Metadata } from "next";
import Link from "next/link";
import HashValue from "@/components/HashValue";
import ModeBanner from "@/components/ModeBanner";
import OrderTimeline from "@/components/OrderTimeline";
import { fetchDeliveryEvidence } from "@/lib/evidence";
import { fetchOrder, fetchProduct } from "@/lib/shop";
import { formatTimestampNs, formatUsd } from "@/lib/format";
import type { OrderState } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return { title: `Order ${id}` };
}

const STATE_EXPLAINED: Record<OrderState, string> = {
  Created: "The order exists but has not been paid. Pay the contract exactly the order amount to move it forward.",
  Paid: "Payment accepted and recorded by the contract. The cashier will fulfil this order on its next pass.",
  Fulfilled: "The cashier has released the sealed item and recorded the delivery evidence hash on-chain.",
  Cancelled: "Cancelled by the buyer before payment. No money moved.",
  Refunded: "The buyer was refunded in full by the contract, inside the refund band.",
  RefundRejected:
    "A refund was requested outside the contract's band (cap or window). No money moved; the order is parked for the owner's review.",
};

function badgeClass(state: OrderState): string {
  if (state === "Fulfilled" || state === "Refunded") return "state-badge done";
  if (state === "RefundRejected") return "state-badge bad";
  return "state-badge";
}

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
  const evidence =
    order !== null && !Number.isNaN(orderId)
      ? await fetchDeliveryEvidence(orderId)
      : null;

  return (
    <>
      <ModeBanner mode={mode} liveError={liveError} />

      <div className="page-head">
        <span className="badge">Track order</span>
        <h1>Order {Number.isNaN(orderId) ? id : orderId}</h1>
        <form className="lookup" action="/orders" method="get">
          <input
            name="id"
            inputMode="numeric"
            placeholder="Another order id"
            aria-label="Order id"
            required
          />
          <button className="btn-ghost" type="submit">
            Look up
          </button>
        </form>
      </div>

      {order === null ? (
        <div className="state-panel">
          <p className="code-line">Not on the ledger</p>
          <h2>No order with this id</h2>
          <p>
            Order ids are sequential from 0
            {mode === "fixture"
              ? "; in fixture mode, orders 0 and 1 exist as samples."
              : "."}{" "}
            <Link href="/">Back to the shop</Link>.
          </p>
        </div>
      ) : (
        <>
          <p>
            <span className={badgeClass(order.state)}>{order.state}</span>
          </p>
          <p className="lede">{STATE_EXPLAINED[order.state]}</p>

          <OrderTimeline
            state={order.state}
            createdAt={order.created_at}
            paidAt={order.paid_at}
          />

          <h2>The record</h2>
          <div className="kv-wrap">
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
                  <td>
                    {formatUsd(order.amount_usd)}{" "}
                    <span className="muted">USDC (Circle, NEAR testnet)</span>
                  </td>
                </tr>
                <tr>
                  <th>Buyer of record</th>
                  <td>
                    <HashValue value={order.buyer} />
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
              </tbody>
            </table>
          </div>

          <h2>Evidence</h2>
          <div className="kv-wrap">
            <table className="kv">
              <tbody>
                <tr>
                  <th>Judgement attestation hash</th>
                  <td>
                    {order.judgement_attestation_hash ? (
                      <>
                        <HashValue value={order.judgement_attestation_hash} />
                        <br />
                        <span className="muted">
                          The hash of the NEAR AI Cloud attestation for the
                          judgement behind this order's fulfilment or refund —
                          verifiable against the model's attestation report.
                        </span>
                      </>
                    ) : (
                      "None recorded — this order was handled without a judgement layer, or none has acted yet."
                    )}
                  </td>
                </tr>
                <tr>
                  <th>Delivery evidence hash</th>
                  <td>
                    {evidence ? (
                      <>
                        <HashValue value={evidence.evidenceHash} />
                        <br />
                        <span className="muted">
                          SHA-256 of the delivery ciphertext, recorded in the
                          contract's fulfilment log at{" "}
                          {formatTimestampNs(evidence.at)}. The buyer can
                          check the code they received against it; the code
                          itself never touches the chain.
                        </span>
                      </>
                    ) : order.state === "Fulfilled" ? (
                      "Not read — the fulfilment log could not be read for this order."
                    ) : (
                      "None — this order has not been fulfilled."
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
