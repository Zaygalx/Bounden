import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createLeashedKey,
  NearLeashSetupDriver,
  DEFAULT_LEASH_ALLOWANCE_YOCTO,
} from "../src/leash.js";

/**
 * create-leashed-key — the deploy-time leash procedure (see src/leash.ts
 * for the step-by-step). Derives the agent keypairs into the vault,
 * registers the agent on the contract (owner-signed), adds the
 * function-call leash key (agent-signed), and prints the on-chain
 * permission object as constitution evidence.
 *
 * Env:
 *   BOUNDEN_CONTRACT_ACCOUNT_ID   shop contract account
 *   BOUNDEN_AGENT_ACCOUNT_ID      agent account to register
 *   BOUNDEN_VAULT_DIR             vault root (keys land in <dir>/agent-keys)
 *   BOUNDEN_OWNER_ACCOUNT_ID      owner account id (signer of set_agent)
 *   BOUNDEN_OWNER_KEY_FILE        owner credential file (vault)
 *   NEAR_RPC_URL                  default https://rpc.testnet.near.org
 *   BOUNDEN_AGENT_CODE_HASH       optional override for the pinned hash
 *   BOUNDEN_LEASH_ALLOWANCE_YOCTO optional, default 0.25 NEAR
 * Flags:
 *   --dry-run   derive keys + compute the code hash + print the plan.
 *               Touches NO chain. Key files ARE written (they are the
 *               point of the dry run: the agent account must be created
 *               with the full-access public key before funding).
 *
 * The agent account itself must exist and hold the full-access key
 * before a live run: create it with the printed public key via the
 * documented claim path (scripts/claim-named-account.md), then re-run
 * without --dry-run.
 */
async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const env = process.env;
  const need = (name: string): string => {
    const v = env[name];
    if (!v) throw new Error(`missing required environment variable ${name}`);
    return v;
  };

  const contractId = need("BOUNDEN_CONTRACT_ACCOUNT_ID");
  const agentAccountId = need("BOUNDEN_AGENT_ACCOUNT_ID");
  const vaultDir = need("BOUNDEN_VAULT_DIR");
  const keyDir = path.join(vaultDir, "agent-keys");
  // dist/scripts/<this file> → ../../src is the TypeScript source tree
  // whose hash is pinned on-chain (NOT dist — judges read the source).
  const srcDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "src");

  let driver: NearLeashSetupDriver | null = null;
  if (!dryRun) {
    const ownerKeyFile = need("BOUNDEN_OWNER_KEY_FILE");
    const ownerAccountId = need("BOUNDEN_OWNER_ACCOUNT_ID");
    const fullKeyFile = path.join(keyDir, "agent-full-ed25519.json");
    if (!fs.existsSync(fullKeyFile)) {
      throw new Error(
        "live run needs the agent full-access key from a prior --dry-run (or the account claim step) — run with --dry-run first",
      );
    }
    driver = new NearLeashSetupDriver({
      rpcUrl: env.NEAR_RPC_URL?.trim() || "https://rpc.testnet.near.org",
      ownerAccountId,
      ownerKeyFile,
      agentKeyFile: fullKeyFile,
    });
  }

  const result = await createLeashedKey(
    {
      contractId,
      agentAccountId,
      vaultKeyDir: keyDir,
      workerSrcDir: srcDir,
      dryRun,
      ...(env.BOUNDEN_AGENT_CODE_HASH ? { codeHash: env.BOUNDEN_AGENT_CODE_HASH } : {}),
      ...(env.BOUNDEN_LEASH_ALLOWANCE_YOCTO
        ? { allowanceYocto: env.BOUNDEN_LEASH_ALLOWANCE_YOCTO }
        : { allowanceYocto: DEFAULT_LEASH_ALLOWANCE_YOCTO }),
    },
    driver,
  );

  // Public material only — private keys never printed.
  console.log(JSON.stringify({ dryRun, ...result }, null, 2));
  if (dryRun) {
    console.log(
      [
        "",
        "DRY RUN — no chain calls were made. Next steps:",
        `1. Create the agent account ${agentAccountId} with the full-access`,
        "   public key from the printed key file (see scripts/claim-named-account.md),",
        "   and fund it (the leash allowance + gas).",
        "2. Re-run without --dry-run to register the agent and add the leash key.",
      ].join("\n"),
    );
  } else {
    console.log("\nLeash is live. The permission object above is the constitution evidence —");
    console.log("anyone can re-check it with a view_access_key call.");
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
