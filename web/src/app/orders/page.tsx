import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Track an order",
  description:
    "Look up a Bounden order by its number: its state, its record, its evidence — and, once fulfilled, its delivery counter.",
};

/**
 * The tracker landing — where "Track Order" in the navigation leads.
 *
 * Until the buyer-experience pass this address was a bare redirect
 * handler: /orders?id=<n> bounced to the order page, and /orders with
 * no (or a bad) id bounced to the shop front, so a buyer tapping
 * "Track Order" landed on the shop and reasonably concluded the tap
 * had gone wrong. Now the tracker is a page in its own right: the
 * lookup form lives here, a well-formed id still forwards straight to
 * the order, and a malformed one is answered here, in words.
 */
export default async function TrackOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string | string[] }>;
}) {
  const params = await searchParams;
  const raw = Array.isArray(params.id) ? params.id[0] : params.id;
  const id = (raw ?? "").trim();
  if (/^\d+$/.test(id)) {
    redirect(`/orders/${id}`);
  }
  const malformed = raw !== undefined && id !== "" && !/^\d+$/.test(id);

  return (
    <>
      <div className="page-head">
        <span className="badge">Track order</span>
        <h1>Track an order</h1>
      </div>

      <p className="lede">
        Every purchase in this shop is an order in the book, numbered in
        the order it was made, starting at 0. Enter the number and the
        book opens at that page: the order&apos;s state, what was paid,
        and the evidence hashes the cashier left behind.
      </p>
      <p>
        If the order is fulfilled, its page is also where the buyer
        collects the item itself — at the delivery counter on that page,
        against the buying wallet&apos;s signature.
      </p>

      {malformed && (
        <p>
          <strong>“{id}” is not an order number.</strong> Order numbers
          are digits only — look for the number on the page you landed on
          after paying, and try again.
        </p>
      )}

      <form className="lookup" action="/orders" method="get">
        <label className="skip-link" htmlFor="track-page-id">
          Order id
        </label>
        <input
          id="track-page-id"
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
    </>
  );
}
