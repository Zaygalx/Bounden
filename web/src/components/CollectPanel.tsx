"use client";

import { Buffer } from "buffer";
import { useEffect, useRef, useState } from "react";
import CopyButton from "./CopyButton";
import { useWallet } from "./WalletProvider";
import {
  buildCollectMessage,
  bytesToB64,
  openSealedReply,
  sha256Hex,
  COLLECT_RECIPIENT,
  type CollectedItem,
} from "@/lib/collect";
import type { OrderState } from "@/lib/types";

/**
 * The delivery counter, on the order page.
 *
 * Shown only for a Fulfilled order. The item itself is released only
 * to the buyer of record, and only against proof: the buyer's wallet
 * signs a short note (NEP-413) binding this order to a one-time key
 * generated in this tab; the note is queued at the rendezvous
 * (/api/collect); the cashier worker — the only component that can
 * open the vault — verifies the signature against the buyer of record
 * and answers with the code sealed to the one-time key. This page
 * never receives the code, or anything that could decrypt it, before
 * that proof passes; what it receives after is ciphertext only this
 * tab can open.
 *
 * Plain failure language throughout: a refusal from the counter is
 * shown with the cashier's own reason, and every wait is bounded.
 */

type Phase =
  | { kind: "idle" }
  | { kind: "signing" }
  | { kind: "waiting" }
  | { kind: "done"; item: CollectedItem; codeHash: string; hashMatches: boolean }
  | { kind: "refused"; reason: string }
  | { kind: "problem"; message: string };

const POLL_MS = 4_000;
const REPOST_EVERY = 5; // polls between re-posting the note (~20 s)
const WAIT_LIMIT_MS = 210_000;

export default function CollectPanel({
  orderId,
  buyer,
  state,
}: {
  orderId: number;
  buyer: string;
  state: OrderState;
}) {
  const { accountId, getSelector } = useWallet();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const runRef = useRef(0);

  useEffect(() => {
    const run = runRef.current;
    return () => {
      runRef.current = run + 1; // invalidate any in-flight collection
    };
  }, []);

  if (state !== "Fulfilled") return null;

  const isBuyer = accountId !== null && accountId === buyer;
  const busy = phase.kind === "signing" || phase.kind === "waiting";

  async function collect() {
    const run = ++runRef.current;
    const alive = () => runRef.current === run;
    setPhase({ kind: "signing" });
    try {
      // A one-time keypair for this collection only. The private half
      // never leaves this tab; the public half rides inside the note
      // the wallet signs, so the reply can be sealed to it.
      const keyPair = await crypto.subtle.generateKey(
        { name: "ECDH", namedCurve: "P-256" },
        true,
        ["deriveBits"],
      );
      const pubRaw = new Uint8Array(
        await crypto.subtle.exportKey("raw", keyPair.publicKey),
      );
      const nonce = crypto.getRandomValues(new Uint8Array(32));
      const message = buildCollectMessage({
        orderId,
        ephemeralPubB64: bytesToB64(pubRaw),
        issuedUnix: Math.floor(Date.now() / 1000),
      });

      const selector = await getSelector();
      if (!selector) throw new Error("The wallet is not available in this browser.");
      const wallet = await selector.wallet();
      if (typeof wallet.signMessage !== "function") {
        throw new Error(
          "This wallet cannot sign the collection note. Connect with a wallet that supports message signing (for example Meteor or MyNearWallet) to collect.",
        );
      }
      const signed = await wallet.signMessage({
        message,
        recipient: COLLECT_RECIPIENT,
        nonce: Buffer.from(nonce),
      });
      if (!alive()) return;
      if (!signed) {
        setPhase({
          kind: "problem",
          message: "The wallet did not sign the note, so nothing was queued. Nothing was released.",
        });
        return;
      }
      if (signed.accountId !== buyer) {
        setPhase({
          kind: "problem",
          message: `The note was signed by ${signed.accountId}, not by the buyer of record (${buyer}). Connect the buyer's wallet and try again.`,
        });
        return;
      }

      const requestBody = {
        orderId,
        accountId: signed.accountId,
        message,
        signatureB64: signed.signature,
        publicKey: signed.publicKey,
        nonceB64: bytesToB64(nonce),
        recipient: COLLECT_RECIPIENT,
      };
      const post = async (): Promise<string> => {
        const res = await fetch("/api/collect/request", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(requestBody),
        });
        const data = (await res.json().catch(() => ({}))) as {
          requestId?: string;
          error?: string;
        };
        if (!res.ok || !data.requestId) {
          throw new Error(data.error ?? "The counter did not take the note. Try again.");
        }
        return data.requestId;
      };

      const requestId = await post();
      if (!alive()) return;
      setPhase({ kind: "waiting" });

      const deadline = Date.now() + WAIT_LIMIT_MS;
      let polls = 0;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, POLL_MS));
        if (!alive()) return;
        polls += 1;
        if (polls % REPOST_EVERY === 0) {
          // The rendezvous is a post box, not a vault: re-filing the
          // same note keeps it in front of the cashier whichever
          // server the shop is being served from this minute.
          await post().catch(() => undefined);
        }
        const res = await fetch(
          `/api/collect/status?requestId=${encodeURIComponent(requestId)}`,
          { cache: "no-store" },
        );
        const data = (await res.json().catch(() => ({}))) as {
          status?: string;
          sealedB64?: string;
          workerPubB64?: string;
          reason?: string;
        };
        if (!alive()) return;
        if (data.status === "ready" && data.sealedB64 && data.workerPubB64) {
          const item = await openSealedReply({
            ephemeralPrivateKey: keyPair.privateKey,
            workerPubB64: data.workerPubB64,
            sealedB64: data.sealedB64,
            orderId,
          });
          const codeHash = await sha256Hex(item.code);
          if (!alive()) return;
          setPhase({
            kind: "done",
            item,
            codeHash,
            hashMatches: codeHash === item.commitment,
          });
          return;
        }
        if (data.status === "rejected") {
          setPhase({
            kind: "refused",
            reason: data.reason ?? "The cashier refused the collection.",
          });
          return;
        }
      }
      setPhase({
        kind: "problem",
        message:
          "The cashier did not answer in time. The order stays fulfilled and the item stays sealed — try the counter again in a little while.",
      });
    } catch (err) {
      if (!alive()) return;
      setPhase({
        kind: "problem",
        message:
          err instanceof Error
            ? err.message
            : "Something went wrong at the counter. Nothing was released.",
      });
    }
  }

  return (
    <section className="collect-panel" aria-labelledby="collect-heading">
      <h2 id="collect-heading">The delivery counter</h2>

      {accountId === null && (
        <p className="lede">
          This order is fulfilled, and its item is waiting at the counter.
          Only its buyer can collect it: connect the wallet that bought
          this order — <strong>{buyer}</strong> — and the cashier will hand
          the sealed code over against that wallet&apos;s signature. The
          code never appears on this page without that proof, and nobody
          else can collect it.
        </p>
      )}

      {accountId !== null && !isBuyer && (
        <p className="lede">
          This order was bought by <strong>{buyer}</strong>. The connected
          wallet is {accountId}, so the counter will not serve it. Connect
          the buyer&apos;s wallet to collect the item.
        </p>
      )}

      {isBuyer && phase.kind !== "done" && (
        <>
          <p className="lede">
            You bought this order, and the cashier has its item sealed for
            you. Collecting asks your wallet to sign one short note — no
            transaction, no fee. The signature proves to the cashier that
            the buyer is asking; the code is then sealed to this tab alone
            and opened here, in your browser.
          </p>
          {phase.kind === "idle" && (
            <button type="button" className="btn" onClick={() => void collect()}>
              Collect your item
            </button>
          )}
          {phase.kind === "signing" && (
            <p className="collect-status">Waiting for your wallet to sign the note…</p>
          )}
          {phase.kind === "waiting" && (
            <p className="collect-status">
              Your note is with the cashier. It checks the signature against
              the buyer of record and seals the item to this tab — a few
              seconds, usually under a minute. Keep this page open.
            </p>
          )}
          {phase.kind === "refused" && (
            <>
              <p>
                <strong>The cashier refused this collection.</strong>
              </p>
              <p>{phase.reason}</p>
              <button type="button" className="btn-ghost" onClick={() => void collect()}>
                Try the counter again
              </button>
            </>
          )}
          {phase.kind === "problem" && (
            <>
              <p>{phase.message}</p>
              <button type="button" className="btn-ghost" onClick={() => void collect()}>
                Try the counter again
              </button>
            </>
          )}
          {busy && (
            <p className="muted">
              Nothing is charged and nothing moves on-chain while you wait.
            </p>
          )}
        </>
      )}

      {isBuyer && phase.kind === "done" && (
        <>
          <p className="lede">
            Here is your item — the very code the seller sealed into the
            shop before this order existed. It was released against your
            signature and opened in this tab only.
          </p>
          <div className="collect-code">
            <span className="the-code">{phase.item.code}</span>
            <CopyButton text={phase.item.code} />
          </div>
          <p className="collect-check">
            SHA-256 of this code: {phase.codeHash}
            <br />
            {phase.hashMatches
              ? "It matches the commitment this order consumed on-chain — this is the code the contract had on record for your order."
              : "It does NOT match the commitment this order consumed. Do not rely on it; the mismatch is on the record."}
          </p>
          <p>
            The delivery itself stands on-chain under the delivery evidence
            hash in the record above. Keep the code somewhere safe: it is
            the whole of the item, and the shop cannot unseal another copy
            for anyone who cannot sign as {buyer}.
          </p>
        </>
      )}
    </section>
  );
}
