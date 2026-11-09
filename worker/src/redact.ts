/**
 * Secret redaction for logs.
 *
 * The worker handles NEAR credentials and sealed inventory codes. NOTHING
 * secret may ever reach a log line: every log call in this package passes
 * through `redactValue` first. Patterns covered:
 *  - NEAR private keys: `ed25519:<base58>` (58+ chars)
 *  - bare base58 blobs of key length
 *  - the demo/prod inventory code shape (redacted defensively — even test
 *    codes should not train us to log codes)
 *  - object fields whose names look secret-bearing (private_key, secret,
 *    deliveryKey, code, …) — redacted wholesale, whatever their value.
 */

const SECRET_FIELD_NAMES = new Set([
  "private_key",
  "privatekey",
  "secret_key",
  "secretkey",
  "secret",
  "deliverykey",
  "delivery_key",
  "vaultkey",
  "vault_key",
  "code",
  "plaintext",
  "seed",
  "mnemonic",
]);

const STRING_PATTERNS: Array<[RegExp, string]> = [
  [/ed25519:[1-9A-HJ-NP-Za-km-z]{32,}/g, "ed25519:[REDACTED]"],
  [/BOUNDEN-TEST-[A-Z0-9-]+/g, "[TEST-CODE-REDACTED]"],
];

export function redactString(input: string): string {
  let out = input;
  for (const [pattern, replacement] of STRING_PATTERNS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

export function redactValue(value: unknown): unknown {
  if (typeof value === "string") return redactString(value);
  if (Array.isArray(value)) return value.map((v) => redactValue(v));
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_FIELD_NAMES.has(k.toLowerCase())) {
        out[k] = "[REDACTED]";
      } else {
        out[k] = redactValue(v);
      }
    }
    return out;
  }
  return value;
}

/** Render an arbitrary context object as a redacted JSON string. */
export function redactToJson(value: unknown): string {
  try {
    return JSON.stringify(redactValue(value));
  } catch {
    return '"[unserialisable context]"';
  }
}
