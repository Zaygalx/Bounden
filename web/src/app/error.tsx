"use client";

import Link from "next/link";

/** Designed error state for unexpected render failures. */
export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="state-panel">
      <p className="code-line">Something failed</p>
      <h1>This page could not be read</h1>
      <p className="lede">
        The shop reads its state from the NEAR testnet contract. A read
        failed in a way the page could not absorb — no state has been
        invented to fill the gap.
      </p>
      <p style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <button className="btn" type="button" onClick={reset}>
          Try again
        </button>
        <Link className="btn-ghost" href="/">
          Back to the shop
        </Link>
      </p>
    </div>
  );
}
