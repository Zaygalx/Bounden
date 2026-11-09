import { randomBytes } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { FileVault, DEMO_INVENTORY, sha256Hex } from "../src/vault.js";

/**
 * seed-demo-vault — bootstrap the worker vault with the clearly-fake
 * demo inventory, and print the SHA-256 commitments the owner must
 * register on-chain (add_inventory_commitments) IN THE PRINTED ORDER
 * (the contract consumes commitments FIFO; the vault hands out codes in
 * the same order — see src/vault.ts).
 *
 * Env:
 *   BOUNDEN_VAULT_DIR       vault root (worker vault lands in <dir>/worker-vault)
 *   BOUNDEN_VAULT_KEY_FILE  vault encryption key file; created (0600,
 *                           base64) if missing.
 *
 * Idempotent-ish: re-running with a seeded vault fails on duplicate
 * commitments rather than double-stocking. That is deliberate.
 */
async function main(): Promise<void> {
  const vaultRoot = process.env.BOUNDEN_VAULT_DIR;
  if (!vaultRoot) throw new Error("missing required environment variable BOUNDEN_VAULT_DIR");
  const vaultDir = path.join(vaultRoot, "worker-vault");
  const keyFile =
    process.env.BOUNDEN_VAULT_KEY_FILE || path.join(vaultRoot, "worker-vault.key");

  if (!fs.existsSync(keyFile)) {
    fs.mkdirSync(path.dirname(keyFile), { recursive: true, mode: 0o700 });
    fs.writeFileSync(keyFile, randomBytes(32).toString("base64") + "\n", {
      mode: 0o600,
      flag: "wx",
    });
    console.log(`generated vault key file (0600): ${keyFile}`);
  }

  const vault = FileVault.open(vaultDir, FileVault.loadKeyFile(keyFile));
  for (const [productId, codes] of Object.entries(DEMO_INVENTORY)) {
    await vault.addCodes(productId, codes);
    const commitments = await vault.commitments(productId);
    console.log(`\nproduct ${productId}: ${codes.length} demo codes sealed in the vault`);
    console.log("register these commitments on-chain, in this exact order:");
    console.log(JSON.stringify(commitments));
    for (const c of codes) {
      // Hashes only. The demo codes themselves are public constants in
      // DEMO_INVENTORY (src/vault.ts); this script never prints plaintext.
      console.log(`  ${sha256Hex(c)}`);
    }
  }
  console.log(`\nvault state: ${path.join(vaultDir, "vault-state.json")} (codes encrypted at rest)`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
