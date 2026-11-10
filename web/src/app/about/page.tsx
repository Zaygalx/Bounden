import type { Metadata } from "next";
import Link from "next/link";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "How inventory stays secret",
  description:
    "Contract state is public, so no usable code ever touches the chain: commitments on-chain, a sealed vault off-chain, delivery re-encrypted to the buyer.",
};

/**
 * "How inventory stays secret on a public chain" — the explanation the
 * plan requires, matching docs/PLAN.md's design exactly, including the
 * current demo limitation, stated rather than smoothed over.
 */
export default function AboutPage() {
  return (
    <>
      <div className="page-head">
        <span className="badge">The sealing design</span>
        <h1>How inventory stays secret on a public chain</h1>
        <p className="lede">
          NEAR contract state is public: anyone can read everything a contract
          stores. So Bounden's first design rule is simple —{" "}
          <strong>no usable code ever touches the chain.</strong> What follows
          is the whole mechanism; there is no other moving part.
        </p>
      </div>

      <section className="prose-section">
        <div>
          <h2>On-chain: commitments only</h2>
          <p>
            Each inventory unit exists on-chain as a <strong>commitment</strong>:
            the SHA-256 hash of the code, its product, and a consumed flag. The
            owner registers commitments before any order exists. An explorer
            shows hashes and order states — a hash tells you a code exists and
            whether it has been spent, and nothing about what the code is.
          </p>
        </div>
      </section>

      <section className="prose-section">
        <div>
          <h2>Off-chain: the sealed vault</h2>
          <p>
            The plaintext codes live in the cashier's <strong>encrypted vault</strong>{" "}
            off-chain (AES-256-GCM at rest). The cashier is the only decryptor —
            and when the cashier runs as a Shade Agent, decryption happens inside
            a hardware enclave (TEE) whose code hash is the one pinned in the
            contract.
          </p>
        </div>
      </section>

      <section className="prose-section">
        <div>
          <h2>On fulfilment: re-encrypted to the buyer</h2>
          <p>
            When an order is paid, the cashier takes the next sealed code,
            re-encrypts it to the <strong>buyer</strong>, and calls{" "}
            <code>fulfil_order</code> with only the <em>hash of the delivery
            ciphertext</em> as evidence. The buyer can verify their delivery:
            the hash of the code they received matches the commitment the chain
            consumed for their order. If a delivered code ever leaks, it is one
            buyer's key that leaked — not a platform breach, because no other
            buyer's code was ever exposed to it.
          </p>
        </div>
      </section>

      <section className="prose-section">
        <div>
          <h2>Downloadable assets: signed, expiring links</h2>
          <p>
            Files are never stored on-chain and never served from a permanent
            public URL. Fulfilment of a downloadable asset releases a{" "}
            <strong>signed download link</strong> from the vault: it expires, it
            works once, and its signature is bound to the order's fulfilment
            record, so a link cannot be replayed for a different order. (Design:
            docs/DOWNLOADS.md in the repository.)
          </p>
        </div>
      </section>

      <h2>Stated plainly: the current demo limitation</h2>
      <p>
        In this build, the per-order delivery key is held in the cashier's
        vault delivery record, because there is no buyer key infrastructure
        yet. The production form encrypts the delivered code to the buyer's
        ephemeral public key, so the cashier itself cannot decrypt a code
        after delivery. The invariant that already holds today: no plaintext
        on-chain, codes encrypted at rest, and the cashier process never
        handles a plaintext code.
      </p>

      <h2>One rule for real inventory</h2>
      <p>
        Commitments are only as strong as the codes behind them: a SHA-256
        hash of a <em>guessable</em> code can be brute-forced. Production
        inventory must be high-entropy (as real licence keys and credit codes
        are). The demo's codes are deliberately guessable <em>and worthless</em>{" "}
        — every one carries a test marker, which is the point of the{" "}
        <Link href="/">demo inventory notice</Link>.
      </p>

      <section className="prose-section">
        <div>
          <h2>Why there is no login here</h2>
          <p>
            Visitors sometimes look for the sign-in button. There isn't one,
            and that is by design. This shop keeps <strong>no accounts and
            no passwords</strong>; it stores nothing about you that you could
            log in to see. Your NEAR wallet is your name here — it places the
            order and it pays, and the contract knows the order by the wallet
            that made it. Your <strong>order number is your receipt</strong>:
            enter it on the <Link href="/#track">track page</Link> at any
            time and the whole record is there — state, delivery evidence,
            and attestation — with no account needed.
          </p>
        </div>
      </section>
    </>
  );
}
