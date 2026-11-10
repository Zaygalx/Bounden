// Restock driver — the established FileVault.addCodes flow against the
// LIVE worker vault (same procedure as the 10 Nov +3 restock).
// Run ONLY while the bounden-worker service is stopped.
import { FileVault, sha256Hex } from "/home/hatch/workspace/bounden/worker/dist/src/vault.js";

const VAULT_DIR = "/home/hatch/workspace/bounden-secrets/v3/worker-vault";
const KEY_FILE = "/home/hatch/workspace/bounden-secrets/v3/worker-vault.key";
const PRODUCT = "api-credit-basic";
const NEW_CODES = ["BOUNDEN-TEST-CREDIT-0007", "BOUNDEN-TEST-CREDIT-0008"];

const vault = FileVault.open(VAULT_DIR, FileVault.loadKeyFile(KEY_FILE));
const before = await vault.commitments(PRODUCT);
console.log(`commitments before: ${before.length}`);
for (const c of NEW_CODES) {
  if (before.includes(sha256Hex(c))) throw new Error(`${c} already in vault — refusing to double-stock`);
}
await vault.addCodes(PRODUCT, NEW_CODES);
const after = await vault.commitments(PRODUCT);
console.log(`commitments after: ${after.length}`);
console.log("tail (FIFO):", JSON.stringify(after.slice(-2)));
const expect = NEW_CODES.map((c) => sha256Hex(c));
if (JSON.stringify(after.slice(-2)) !== JSON.stringify(expect)) {
  throw new Error("FIFO tail mismatch: " + JSON.stringify(after.slice(-2)) + " != " + JSON.stringify(expect));
}
console.log("OK: vault tail matches sha256(0007), sha256(0008) in order");
