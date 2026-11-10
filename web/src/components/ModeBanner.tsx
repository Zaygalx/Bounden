import { formatAge } from "@/lib/format";
import type { ShopMode } from "@/lib/shop";

/**
 * Data-source banner. Rendered on every page that reads shop data, so
 * the source of the numbers is never ambiguous:
 *  - live:    no banner (data read from the contract just now, or
 *             within the short server cache window);
 *  - cached:  the chain read failed, so the page shows the last data
 *             actually read live, labelled with its age;
 *  - fixture: sample data — either no contract is configured, or the
 *             read failed before any live value existed.
 */
export default function ModeBanner({
  mode,
  liveError,
  cachedAt,
  note,
}: {
  mode: ShopMode;
  liveError?: string;
  cachedAt?: number;
  note?: string;
}) {
  if (mode === "live" && !note) return null;
  return (
    <div className="mode-banner" role="note">
      {mode === "cached" ? (
        <>
          <p>
            <strong>Showing the last live read{cachedAt ? `, from ${formatAge(cachedAt)}` : ""}.</strong>{" "}
            The chain read just failed, so this page shows the most recent
            data actually read from the contract — not sample data. It will
            refresh itself on the next successful read.
          </p>
          {liveError ? <p className="mode-error">{liveError}</p> : null}
        </>
      ) : mode === "live" ? (
        <p>{note}</p>
      ) : liveError ? (
        <>
          <p>
            <strong>Live read failed — showing fixture data.</strong> The shop
            is configured for a live contract, but the read did not succeed,
            so this page shows clearly labelled sample data instead. Nothing
            below is chain state.
          </p>
          <p className="mode-error">{liveError}</p>
        </>
      ) : (
        <p>
          <strong>Fixture mode.</strong> No shop contract is configured, so this
          page renders sample data. It is not live chain state. Configure{" "}
          <code>BOUNDEN_CONTRACT_ACCOUNT_ID</code> to read the real contract.
        </p>
      )}
      {note && mode !== "live" ? <p>{note}</p> : null}
    </div>
  );
}
