import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Not found",
};

/** Designed 404 — this URL is not in the ledger. */
export default function NotFound() {
  return (
    <div className="state-panel">
      <p className="code-line">404 — not in the ledger</p>
      <h1>This page does not exist</h1>
      <p className="lede">
        The shop keeps a short ledger: a catalogue, a constitution, and the
        orders. This address is none of them.
      </p>
      <p style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <Link className="btn" href="/">
          Back to the shop
        </Link>
        <Link className="btn-ghost" href="/constitution">
          Read the Constitution
        </Link>
      </p>
    </div>
  );
}
