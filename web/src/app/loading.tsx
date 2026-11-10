/** Loading skeleton for the dynamic routes (chain reads in flight). */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="skel skel-line" style={{ width: "38%" }} />
      <div className="skel skel-hero" />
      <div className="skel-row">
        <div className="skel skel-card" />
        <div className="skel skel-card" />
      </div>
    </div>
  );
}
