import type { ChainClient } from "./chain.js";
import type { Logger } from "./logger.js";
import { parseCollectMessage, verifyNep413, COLLECT_RECIPIENT } from "./nep413.js";
import { openVaultCiphertext, sealToEphemeral } from "./seal.js";
import { sha256Hex, type VaultStore } from "./vault.js";

/**
 * THE DELIVERY COUNTER — how a buyer actually collects what they bought.
 *
 * The gap this closes: fulfilment sealed the buyer's code into the
 * vault's delivery record and put only hashes on-chain, but until now
 * nothing ever handed the code to the buyer.
 *
 * The channel, designed around two facts: the vault lives on this
 * machine, which accepts NO inbound connections (outbound HTTPS only),
 * and the storefront (Vercel) is stateless. So the storefront runs a
 * small rendezvous (web/src/lib/rendezvous.ts) that holds two things
 * briefly, in memory: signed collection requests from buyers, and the
 * counter's sealed replies. Every participant re-announces — the
 * buyer's page re-posts its request while it waits, this counter
 * re-posts its replies for ten minutes — so the rendezvous heals
 * whichever serverless instance a request happens to land on.
 *
 * A collection request is a NEP-413 wallet signature over a short note
 * (see nep413.ts) binding the order, the buyer account, and a one-time
 * ephemeral P-256 key generated in the buyer's browser. This counter —
 * the only component that can open the vault — releases an item only
 * when ALL of these hold:
 *
 *   1. a finalized delivery record exists for the order in the vault;
 *   2. the order is Fulfilled on-chain, and its buyer of record is the
 *      account that signed;
 *   3. the signing key is registered on that account (RPC access-key
 *      view) and the NEP-413 signature verifies against it;
 *   4. the note is fresh (ten minutes) and names this order.
 *
 * The release itself is sealed to the ephemeral key: the code never
 * travels in plaintext, never touches the chain, and is never written
 * to a log. A replayed request can only ever produce a reply sealed to
 * a key whose private half the replayer does not hold.
 *
 * The rendezvous secret authenticates THIS worker to the storefront's
 * worker endpoints. It unlocks nothing by itself: requests still need
 * the buyer's own wallet signature.
 */

export interface CollectRequestPayload {
  requestId: string;
  orderId: number;
  accountId: string;
  message: string;
  /** Base64 ed25519 signature over the NEP-413 digest. */
  signatureB64: string;
  /** "ed25519:<base58>" — the key that signed. */
  publicKey: string;
  /** Base64, 32 bytes — the nonce the wallet signed with. */
  nonceB64: string;
  recipient: string;
}

export type CollectReply =
  | { requestId: string; status: "ready"; sealedB64: string; workerPubB64: string }
  | { requestId: string; status: "rejected"; reason: string };

export interface DeliveryCounterDeps {
  vault: VaultStore;
  chain: ChainClient;
  logger: Logger;
  /** Storefront base URL, e.g. https://bounden.vercel.app */
  siteUrl: string;
  /** Shared secret for the rendezvous' worker endpoints. */
  secret: string;
  fetchFn?: typeof fetch;
  now?: () => number;
}

const NOTE_TTL_SECONDS = 600;
const REPLY_REPOST_MS = 10 * 60 * 1000;
const HTTP_TIMEOUT_MS = 10_000;

const REASON = {
  noDelivery:
    "No collected item is waiting on that order. If you have just bought it, give the cashier a minute and try again.",
  notFulfilled: "That order is not marked fulfilled on the chain yet, so there is nothing to collect.",
  buyerMismatch: "The wallet that signed is not the buyer of record for this order.",
  badNote: "The signed note did not match this order. Start the collection again.",
  staleNote: "The signed note has expired. Start the collection again.",
  keyNotOnAccount: "The key that signed the note is not registered on the buyer account.",
  badSignature: "The signature on the note did not check out. Start the collection again.",
  integrity: "The sealed item failed its integrity check, so nothing was released. The order stays fulfilled on-chain.",
} as const;

export class DeliveryCounter {
  private readonly fetchFn: typeof fetch;
  private readonly now: () => number;
  private readonly replies = new Map<string, { reply: CollectReply; at: number }>();

  constructor(private readonly deps: DeliveryCounterDeps) {
    this.fetchFn = deps.fetchFn ?? fetch;
    this.now = deps.now ?? (() => Date.now());
  }

  /** One counter pass: re-announce live replies, then serve the queue. */
  async cycle(): Promise<void> {
    const { logger } = this.deps;
    const nowMs = this.now();
    for (const [id, entry] of this.replies) {
      if (nowMs - entry.at > REPLY_REPOST_MS) {
        this.replies.delete(id);
      } else {
        await this.postReply(entry.reply).catch((err: unknown) =>
          logger.warn("delivery counter: reply repost failed", {
            requestId: id,
            message: err instanceof Error ? err.message : String(err),
          }),
        );
      }
    }
    const requests = await this.fetchRequests();
    for (const req of requests) {
      if (this.replies.has(req.requestId)) continue;
      const reply = await this.process(req);
      this.replies.set(req.requestId, { reply, at: this.now() });
      await this.postReply(reply).catch((err: unknown) =>
        logger.warn("delivery counter: reply post failed; will repost next cycle", {
          requestId: req.requestId,
          message: err instanceof Error ? err.message : String(err),
        }),
      );
      logger.info("delivery counter: request answered", {
        requestId: req.requestId,
        orderId: req.orderId,
        outcome: reply.status,
      });
    }
  }

  private async process(req: CollectRequestPayload): Promise<CollectReply> {
    const reject = (reason: string): CollectReply => ({ requestId: req.requestId, status: "rejected", reason });
    const { vault, chain } = this.deps;
    try {
      // 1. A finalized delivery must be waiting in the vault.
      const record = await vault.getDelivery(req.orderId);
      if (!record || !record.finalized) return reject(REASON.noDelivery);

      // 2. The chain must agree: fulfilled, and bought by the signer.
      const order = await chain.getOrder(req.orderId);
      if (!order) return reject(REASON.noDelivery);
      if (order.state !== "Fulfilled") return reject(REASON.notFulfilled);
      if (order.buyer !== req.accountId || record.buyer !== req.accountId) {
        return reject(REASON.buyerMismatch);
      }

      // 4 (note first — cheap). The signed note must name this order,
      // carry the ephemeral key, and be fresh.
      const note = parseCollectMessage(req.message);
      if (!note || note.orderId !== req.orderId) return reject(REASON.badNote);
      const nowSec = Math.floor(this.now() / 1000);
      if (Math.abs(nowSec - note.issuedUnix) > NOTE_TTL_SECONDS) return reject(REASON.staleNote);

      // 3. The signing key must belong to the account, and the
      // signature must verify as NEP-413 for our recipient.
      const keyView = await chain.viewAccessKey(req.accountId, req.publicKey);
      if (!keyView) return reject(REASON.keyNotOnAccount);
      const nonce = Buffer.from(req.nonceB64, "base64");
      const signature = Buffer.from(req.signatureB64, "base64");
      const ok = verifyNep413({
        message: req.message,
        nonce,
        recipient: req.recipient,
        publicKey: req.publicKey,
        signature,
      });
      if (!ok || req.recipient !== COLLECT_RECIPIENT) return reject(REASON.badSignature);

      // Release: open the vault package in memory only, prove the code
      // against its on-chain commitment, then seal it to the buyer's
      // one-time key. The plaintext is never logged or sent anywhere.
      const code = openVaultCiphertext(record.ciphertext, record.deliveryKey);
      if (sha256Hex(code) !== record.commitment) return reject(REASON.integrity);
      const payload = JSON.stringify({
        orderId: record.orderId,
        productId: record.productId,
        code,
        commitment: record.commitment,
        evidenceHash: record.evidenceHash,
      });
      const sealed = sealToEphemeral(note.ephemeralPubB64, payload, record.orderId);
      return {
        requestId: req.requestId,
        status: "ready",
        sealedB64: sealed.sealedB64,
        workerPubB64: sealed.workerPubB64,
      };
    } catch (err) {
      this.deps.logger.error("delivery counter: request failed while processing", {
        requestId: req.requestId,
        orderId: req.orderId,
        message: err instanceof Error ? err.message : String(err),
      });
      return reject(REASON.integrity);
    }
  }

  private workerHeaders(): Record<string, string> {
    return {
      "content-type": "application/json",
      authorization: `Bearer ${this.deps.secret}`,
    };
  }

  private async fetchRequests(): Promise<CollectRequestPayload[]> {
    const res = await this.fetchFn(`${this.deps.siteUrl}/api/collect/requests`, {
      headers: this.workerHeaders(),
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`rendezvous requests read failed: HTTP ${res.status}`);
    const body = (await res.json()) as { requests?: CollectRequestPayload[] };
    return Array.isArray(body.requests) ? body.requests : [];
  }

  private async postReply(reply: CollectReply): Promise<void> {
    const res = await this.fetchFn(`${this.deps.siteUrl}/api/collect/reply`, {
      method: "POST",
      headers: this.workerHeaders(),
      body: JSON.stringify(reply),
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`rendezvous reply post failed: HTTP ${res.status}`);
  }
}
