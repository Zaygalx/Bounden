/**
 * The buyer half of the delivery counter (browser-safe).
 *
 * The note format and the sealing scheme are a two-party protocol with
 * the cashier worker (worker/src/nep413.ts, worker/src/seal.ts); both
 * sides are written from the same shapes:
 *
 *   note    = "Bounden delivery counter - collect your item"
 *             / "Order: <id>" / "Counter key: <base64 P-256 pub>"
 *             / "Issued: <unix seconds>", signed by the buyer's wallet
 *             as a NEP-413 message for recipient COLLECT_RECIPIENT.
 *   reply   = AES-256-GCM(iv|tag|ciphertext) under a key derived by
 *             ECDH P-256 between the buyer's one-time key and the
 *             counter's one-time key, HKDF-SHA-256 with salt
 *             "bounden-order-<id>" and info "bounden-delivery-counter/v1".
 *
 * The one-time private key is generated per collection attempt and
 * never leaves the tab. WebCrypto does every step — P-256 ECDH is the
 * curve every buyer's browser supports.
 */

export const COLLECT_RECIPIENT = "bounden.vercel.app";

export function buildCollectMessage(note: {
  orderId: number;
  ephemeralPubB64: string;
  issuedUnix: number;
}): string {
  return [
    "Bounden delivery counter - collect your item",
    `Order: ${note.orderId}`,
    `Counter key: ${note.ephemeralPubB64}`,
    `Issued: ${note.issuedUnix}`,
  ].join("\n");
}

export function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export interface CollectedItem {
  orderId: number;
  productId: string;
  code: string;
  commitment: string;
  evidenceHash: string;
}

/** Open the counter's sealed reply with the one-time private key. */
export async function openSealedReply(args: {
  ephemeralPrivateKey: CryptoKey;
  workerPubB64: string;
  sealedB64: string;
  orderId: number;
}): Promise<CollectedItem> {
  const workerPub = await crypto.subtle.importKey(
    "raw",
    b64ToBytes(args.workerPubB64) as BufferSource,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const secret = await crypto.subtle.deriveBits(
    { name: "ECDH", public: workerPub },
    args.ephemeralPrivateKey,
    256,
  );
  const keyMaterial = await crypto.subtle.importKey("raw", secret, "HKDF", false, [
    "deriveKey",
  ]);
  const key = await crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new TextEncoder().encode(`bounden-order-${args.orderId}`),
      info: new TextEncoder().encode("bounden-delivery-counter/v1"),
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );
  const pkg = b64ToBytes(args.sealedB64);
  const iv = pkg.subarray(0, 12);
  // The package layout is iv | tag | ciphertext; WebCrypto wants the
  // tag appended after the ciphertext, so re-lay it out.
  const ctWithTag = new Uint8Array(pkg.length - 12);
  ctWithTag.set(pkg.subarray(28), 0);
  ctWithTag.set(pkg.subarray(12, 28), pkg.length - 28);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    ctWithTag as BufferSource,
  );
  return JSON.parse(new TextDecoder().decode(plain)) as CollectedItem;
}

/** SHA-256 hex in the browser — the buyer checks the code themselves. */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
