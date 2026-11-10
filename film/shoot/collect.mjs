// Bounden film — the collection, run for real against the shop's
// delivery counter. Builds the note exactly as the storefront does
// (web/src/lib/collect.ts), signs it NEP-413 with the buyer's own key,
// files it at the counter, waits for the cashier's answer, and opens
// the sealed reply with the one-time key — the same protocol, the
// same verification, the same seal as a browser collection. Used for
// the Act 1 pickup take because neither wallet web surface can be
// driven inside the capture browser (Meteor's web wallet is blocked
// by its CDN from this sandbox; MyNearWallet has switched off app
// approvals). That is stated in the shoot log and the as-shot note.
//
// usage: node collect.mjs <orderId> [apiBase]
import { createRequire } from "node:module";
import fs from "node:fs";
import crypto from "node:crypto";
const require = createRequire("/home/hatch/workspace/bounden/worker/package.json");
const { KeyPair } = require("near-api-js");

const ORDER_ID = Number(process.argv[2]);
const API = process.argv[3] || "https://bounden.vercel.app";
const SECRETS = "/home/hatch/workspace/bounden-secrets";
const RECIPIENT = "bounden.vercel.app";

const say = (line) => console.log(line);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- the note, byte-identical to web/src/lib/collect.ts ------------
const eph = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
const jwk = eph.publicKey.export({ format: "jwk" });
const pubRaw = Buffer.concat([
  Buffer.from([0x04]),
  Buffer.from(jwk.x, "base64url"),
  Buffer.from(jwk.y, "base64url"),
]);
const message = [
  "Bounden delivery counter - collect your item",
  `Order: ${ORDER_ID}`,
  `Counter key: ${pubRaw.toString("base64")}`,
  `Issued: ${Math.floor(Date.now() / 1000)}`,
].join("\n");
const nonce = crypto.randomBytes(32);

// --- NEP-413 signature by the buyer of record -----------------------
function u32le(n) { const b = Buffer.alloc(4); b.writeUInt32LE(n, 0); return b; }
function borshString(s) { const bytes = Buffer.from(s, "utf8"); return Buffer.concat([u32le(bytes.length), bytes]); }
const payload = Buffer.concat([
  u32le(2147484061), // 2^31 + 413
  borshString(message),
  nonce,
  borshString(RECIPIENT),
  Buffer.from([0]), // no callbackUrl
]);
const digest = crypto.createHash("sha256").update(payload).digest();
const creds = JSON.parse(fs.readFileSync(`${SECRETS}/owner-ed25519.json`, "utf8"));
const kp = KeyPair.fromString(creds.private_key);
const accountId = creds.public_key
  ? Buffer.from(kp.getPublicKey().data).toString("hex")
  : null;
const sig = kp.sign(digest); // near-api-js: sign the sha256 digest
const signature = Buffer.from(sig.signature ?? sig);

say(`collecting order ${ORDER_ID} at the delivery counter`);
say(`buyer of record: ${accountId}`);
say("note signed (NEP-413) with the buyer's key; filing it at the counter…");

const post = async () => {
  const res = await fetch(`${API}/api/collect/request`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      orderId: ORDER_ID,
      accountId,
      message,
      signatureB64: signature.toString("base64"),
      publicKey: kp.getPublicKey().toString(),
      nonceB64: nonce.toString("base64"),
      recipient: RECIPIENT,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.requestId) throw new Error(data.error || `filing failed: HTTP ${res.status}`);
  return data.requestId;
};

let requestId = null;
for (let attempt = 1; attempt <= 4 && !requestId; attempt++) {
  try { requestId = await post(); }
  catch (e) { if (attempt === 4) throw e; say(`filing attempt ${attempt} did not land (${e.message}); retrying…`); await sleep(5000); }
}
say(`note filed — request ${requestId.slice(0, 16)}…; waiting for the cashier…`);

const deadline = Date.now() + 240000;
let reply = null;
while (Date.now() < deadline) {
  await sleep(4000);
  const res = await fetch(`${API}/api/collect/status?requestId=${encodeURIComponent(requestId)}`, { cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (data.status === "ready" && data.sealedB64 && data.workerPubB64) { reply = data; break; }
  if (data.status === "rejected") throw new Error(`counter refused: ${data.reason || "no reason given"}`);
}
if (!reply) throw new Error("the cashier did not answer in time");

// --- open the sealed reply (mirror of collect.ts openSealedReply) --
const workerJwk = (() => {
  const raw = Buffer.from(reply.workerPubB64, "base64");
  return { kty: "EC", crv: "P-256", x: raw.subarray(1, 33).toString("base64url"), y: raw.subarray(33, 65).toString("base64url") };
})();
const workerPub = crypto.createPublicKey({ key: workerJwk, format: "jwk" });
const secret = crypto.diffieHellman({ privateKey: eph.privateKey, publicKey: workerPub });
const key = Buffer.from(crypto.hkdfSync("sha256", secret, Buffer.from(`bounden-order-${ORDER_ID}`), Buffer.from("bounden-delivery-counter/v1"), 32));
const pkg = Buffer.from(reply.sealedB64, "base64");
const iv = pkg.subarray(0, 12);
const ctWithTag = Buffer.concat([pkg.subarray(28), pkg.subarray(12, 28)]);
const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
decipher.setAuthTag(ctWithTag.subarray(ctWithTag.length - 16));
const plain = Buffer.concat([decipher.update(ctWithTag.subarray(0, ctWithTag.length - 16)), decipher.final()]);
const item = JSON.parse(plain.toString("utf8"));

const codeHash = crypto.createHash("sha256").update(item.code).digest("hex");
say("");
say(`the cashier answered — the item for order ${item.orderId} (${item.productId}):`);
say(`  CODE: ${item.code}`);
say(`  SHA-256 of the code: ${codeHash}`);
say(`  matches the commitment this order consumed on-chain: ${codeHash === item.commitment}`);
say(`  delivery evidence hash: ${item.evidenceHash}`);
fs.writeFileSync(
  "/home/hatch/workspace/bounden/film/shoot/out/collect-result.json",
  JSON.stringify({ orderId: ORDER_ID, accountId, requestId, item, codeHash, hashMatches: codeHash === item.commitment }, null, 1),
);
