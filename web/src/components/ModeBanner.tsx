/**
 * Data-source banner. Rendered on every page that reads shop data, so
 * fixture data can never be mistaken for live chain state.
 */
export default function ModeBanner({
  mode,
  liveError,
  note,
}: {
  mode: "live" | "fixture";
  liveError?: string;
  note?: string;
}) {
  if (mode === "live" && !note) return null;
  return (
    <div className="mode-banner" role="note">
      {mode === "live" ? (
        <p>{note}</p>
      ) : liveError ? (
        <>
          <p>
            <strong>Live read failed — showing fixture data.</strong> The shop
            is configured for a live contract, but the read did not succeed, so
            this page shows clearly labelled sample data instead. Nothing below
            is chain state.
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
