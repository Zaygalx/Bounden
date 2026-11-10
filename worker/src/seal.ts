import { createCipheriv, createDecipheriv, createECDH, hkdfSync, randomBytes } from "node:crypto";

/**
 * Sealing for the delivery counter.
 *
 * Two operations:
 *
 *  - `openVaultCiphertext` unwraps a vault delivery package. The vault
 *    format (worker/src/vault.ts) is base64(iv[12] | tag[16] |
 *    ciphertext) under the record's per-order delivery key. Only the
 *    worker ever does this; the plaintext code exists in process memory
 *    for the moment it takes to re-seal it for the buyer.
 *
 *  - `sealToEphemeral` encrypts a payload to the buyer's one-time
 *    P-256 keypair (generated in the browser at collection time):
 *    ECDH(prime256v1) -> HKDF-SHA-256 (salt binds the order, info is
 *    the counter's version string) -> AES-256-GCM. The sealed output
 *    uses the same iv|tag|ciphertext packaging. Anyone may carry the
 *    sealed reply; only the browser holding the ephemeral private key
 *    can open it. P-256 (not X25519) because WebCrypto supports ECDH
 *    P-256 in every browser the shop's buyers plausibly use.
 */

export function openVaultCiphertext(ciphertextB64: string, deliveryKeyB64: string): string {
  const pkg = Buffer.from(ciphertextB64, "base64");
  const key = Buffer.from(deliveryKeyB64, "base64");
  if (key.length !== 32) throw new Error("delivery key must be 32 bytes");
  if (pkg.length < 29) throw new Error("delivery package too short");
  const decipher = createDecipheriv("aes-256-gcm", key, pkg.subarray(0, 12));
  decipher.setAuthTag(pkg.subarray(12, 28));
  return Buffer.concat([decipher.update(pkg.subarray(28)), decipher.final()]).toString("utf8");
}

const SEAL_INFO = "bounden-delivery-counter/v1";

function sealKey(sharedSecret: Buffer, orderId: number): Buffer {
  return Buffer.from(
    hkdfSync("sha256", sharedSecret, Buffer.from(`bounden-order-${orderId}`, "utf8"), Buffer.from(SEAL_INFO, "utf8"), 32),
  );
}

export interface SealedReply {
  /** Base64, 65-byte uncompressed P-256 point: the counter's one-time key. */
  workerPubB64: string;
  /** Base64 of iv[12] | tag[16] | ciphertext. */
  sealedB64: string;
}

export function sealToEphemeral(buyerPubB64: string, plaintext: string, orderId: number): SealedReply {
  const buyerPub = Buffer.from(buyerPubB64, "base64");
  if (buyerPub.length !== 65 || buyerPub[0] !== 0x04) {
    throw new Error("counter key must be a 65-byte uncompressed P-256 public key");
  }
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  const secret = ecdh.computeSecret(buyerPub);
  const key = sealKey(secret, orderId);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const sealed = Buffer.concat([iv, cipher.getAuthTag(), ct]);
  return {
    workerPubB64: ecdh.getPublicKey(undefined, "uncompressed").toString("base64"),
    sealedB64: sealed.toString("base64"),
  };
}

/**
 * The mirror of `sealToEphemeral`, for tests: opens a sealed reply with
 * the buyer's ephemeral private key (raw P-256 private scalar, as a
 * browser would hold it via WebCrypto).
 */
export function openSealedReply(
  buyerPriv: Buffer,
  buyerPubB64: string,
  workerPubB64: string,
  sealedB64: string,
  orderId: number,
): string {
  const ecdh = createECDH("prime256v1");
  ecdh.setPrivateKey(buyerPriv);
  if (ecdh.getPublicKey(undefined, "uncompressed").toString("base64") !== buyerPubB64) {
    throw new Error("private key does not match the counter key");
  }
  const secret = ecdh.computeSecret(Buffer.from(workerPubB64, "base64"));
  const key = sealKey(secret, orderId);
  const pkg = Buffer.from(sealedB64, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, pkg.subarray(0, 12));
  decipher.setAuthTag(pkg.subarray(12, 28));
  return Buffer.concat([decipher.update(pkg.subarray(28)), decipher.final()]).toString("utf8");
}
