import { createHash } from "node:crypto";
import { PublicKey } from "near-api-js";

/**
 * NEP-413 (off-chain signMessage) verification, byte-for-byte the
 * construction the wallet-selector core itself uses to verify:
 *
 *   payload = borsh { tag: u32 = 2^31 + 413, message: string,
 *                     nonce: [u8; 32], recipient: string,
 *                     callbackUrl: option<string> }
 *   digest  = sha256(payload)
 *   valid   = ed25519_verify(publicKey, digest, signature)
 *
 * The tag is INSIDE the borsh struct (first field), per the selector
 * core's payloadSchema. Hand-rolled borsh: the schema is fixed and tiny,
 * and a general borsh dependency is not worth its weight here.
 */

export const NEP413_TAG = 2147484061; // 2^31 + 413

export interface Nep413Payload {
  message: string;
  /** Exactly 32 bytes. */
  nonce: Uint8Array;
  recipient: string;
  callbackUrl?: string;
}

function u32le(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n, 0);
  return b;
}

function borshString(s: string): Buffer {
  const bytes = Buffer.from(s, "utf8");
  return Buffer.concat([u32le(bytes.length), bytes]);
}

export function serializeNep413(p: Nep413Payload): Buffer {
  if (p.nonce.length !== 32) {
    throw new Error(`NEP-413 nonce must be 32 bytes, got ${p.nonce.length}`);
  }
  const parts: Buffer[] = [
    u32le(NEP413_TAG),
    borshString(p.message),
    Buffer.from(p.nonce),
    borshString(p.recipient),
  ];
  if (p.callbackUrl === undefined) {
    parts.push(Buffer.from([0]));
  } else {
    parts.push(Buffer.from([1]), borshString(p.callbackUrl));
  }
  return Buffer.concat(parts);
}

export function nep413Digest(p: Nep413Payload): Buffer {
  return createHash("sha256").update(serializeNep413(p)).digest();
}

/** True only when the signature is a valid NEP-413 signature by this key. */
export function verifyNep413(args: Nep413Payload & { publicKey: string; signature: Uint8Array }): boolean {
  try {
    const pk = PublicKey.from(args.publicKey);
    return pk.verify(new Uint8Array(nep413Digest(args)), args.signature);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// The collection note — the exact text a buyer signs at the delivery
// counter. The storefront builds this string; the worker parses it back
// strictly. ASCII only, so no wallet can mangle it in display. The note
// binds three things to the signature: the order, a one-time ephemeral
// P-256 public key (the reply is sealed to it), and an issue time the
// worker checks for freshness. A replayed note is useless to anyone who
// does not hold the matching ephemeral private key, which never leaves
// the buyer's browser.
// ---------------------------------------------------------------------------

export const COLLECT_RECIPIENT = "bounden.vercel.app";

export interface CollectNote {
  orderId: number;
  /** Base64 of the 65-byte uncompressed P-256 ephemeral public key. */
  ephemeralPubB64: string;
  /** Unix seconds. */
  issuedUnix: number;
}

export function buildCollectMessage(note: CollectNote): string {
  return [
    "Bounden delivery counter - collect your item",
    `Order: ${note.orderId}`,
    `Counter key: ${note.ephemeralPubB64}`,
    `Issued: ${note.issuedUnix}`,
  ].join("\n");
}

const COLLECT_RE =
  /^Bounden delivery counter - collect your item\nOrder: (\d+)\nCounter key: ([A-Za-z0-9+/]+={0,2})\nIssued: (\d+)$/;

export function parseCollectMessage(message: string): CollectNote | null {
  const m = COLLECT_RE.exec(message);
  if (!m) return null;
  const orderId = Number(m[1]);
  const issuedUnix = Number(m[3]);
  if (!Number.isSafeInteger(orderId) || orderId < 0) return null;
  if (!Number.isSafeInteger(issuedUnix) || issuedUnix <= 0) return null;
  return { orderId, ephemeralPubB64: m[2]!, issuedUnix };
}
