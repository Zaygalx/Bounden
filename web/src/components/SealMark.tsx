/**
 * The shop's logo: a simplified seal mark — the Bounden "B" pressed
 * inside the double ring of the hero seal, in the same ledger-green
 * stamp idiom. The full circular seal ("Bounden — kept in the open")
 * carries text that cannot survive at logo size, so it stays in the
 * hero; this mark is its small, crisp counterpart for the sidebar
 * brand block and the mobile top bar. Pure markup, no image asset:
 * the ring and letterform stay sharp at any size.
 */
export default function SealMark({ small = false }: { small?: boolean }) {
  return (
    <span className={`seal-mark${small ? " sm" : ""}`} aria-hidden="true">
      <span className="seal-mark-b">B</span>
    </span>
  );
}
