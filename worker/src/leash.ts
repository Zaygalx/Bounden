import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { Account, JsonRpcProvider, KeyPair, KeyPairSigner, actions } from "near-api-js";
import type { KeyPairString } from "near-api-js";
import { AGENT_METHOD_ALLOWLIST } from "./chain.js";
import type { AgentMethod } from "./chain.js";
import { loadCredentialsFile } from "./config.js";
import type { AccessKeyViewLike } from "./types.js";

/**
 * THE LEASH, as a procedure — run once at deploy time by
 * scripts/create-leashed-key.ts, in this exact order:
 *
 *  (a) Derive TWO fresh keypairs into the vault (never the repo):
 *      a full-access keypair for the agent account (setup/rotation only)
 *      and a separate LEASH keypair. The worker only ever loads the
 *      leash keypair; the full-access secret stays sealed for rotation.
 *  (b) The OWNER registers the agent on the contract (`set_agent` with
 *      the agent account id + the worker code hash). Until this lands,
 *      the contract rejects the agent's calls regardless of keys.
 *  (c) The agent account adds the leash public key as a FUNCTION-CALL
 *      access key: receiver = the shop contract, method allowlist =
 *      exactly [fulfil_order, issue_refund], allowance = 0.25 NEAR for
 *      gas. From this moment, NEAR itself refuses any other use of the
 *      worker's key — the refusal happens in protocol validation,
 *      before any contract code runs.
 *  (d) The key's permission object is read back on-chain
 *      (view_access_key) and asserted to be exactly the leash. The
 *      printed permission object is the constitution evidence: anyone
 *      can repeat the same view call and check our work.
 *
 * Rotation = owner calls set_agent with a new account (or the agent
 * account deletes this key and adds a new one). Revocation = owner
 * re-registers a different agent; the old account's calls stop working
 * at the contract's assert_agent check immediately.
 */

export const DEFAULT_LEASH_ALLOWANCE_YOCTO = "250000000000000000000000"; // 0.25 NEAR

export interface LeashEvidence {
  receiver_id: string;
  method_names: string[];
  allowance: string | null;
}

/**
 * Assert that an access-key view is EXACTLY the Bounden leash:
 * FunctionCall permission, receiver = the shop contract, method set =
 * the allowlist (order-insensitive). Throws with a precise reason
 * otherwise. Used after setup AND at worker startup: if the key on disk
 * is not the leash on-chain, the worker refuses to run.
 */
export function assertLeashEvidence(
  view: AccessKeyViewLike | null,
  contractId: string,
): LeashEvidence {
  if (!view) throw new Error("access key not found on-chain");
  if (view.permission === "FullAccess") {
    throw new Error("access key is FULL ACCESS — this is not the leash; refusing");
  }
  const fc = view.permission.FunctionCall;
  if (fc.receiver_id !== contractId) {
    throw new Error(`leash receiver mismatch: key is bound to ${fc.receiver_id}, expected ${contractId}`);
  }
  const got = [...fc.method_names].sort();
  const want = [...AGENT_METHOD_ALLOWLIST].sort();
  if (got.length !== want.length || got.some((m, i) => m !== want[i])) {
    throw new Error(`leash method allowlist mismatch: got [${got.join(", ")}], expected [${want.join(", ")}]`);
  }
  return { receiver_id: fc.receiver_id, method_names: got, allowance: fc.allowance };
}

/**
 * The pinned agent code hash: SHA-256 over the worker's TypeScript
 * sources (file names + contents, sorted). Any change to the worker
 * source changes the hash, so a modified worker is visibly a different
 * agent from the one the owner registered. (The production form of this
 * is the Shade Agent code hash from TEE attestation — Stage 4; the
 * contract field and the registration flow are identical.)
 */
export function computeWorkerCodeHash(srcDir: string): string {
  const files = fs
    .readdirSync(srcDir)
    .filter((f) => f.endsWith(".ts"))
    .sort();
  const hash = createHash("sha256");
  for (const f of files) {
    hash.update(f);
    hash.update("\n");
    hash.update(fs.readFileSync(path.join(srcDir, f)));
    hash.update("\n");
  }
  return hash.digest("hex");
}

export interface KeypairMaterial {
  publicKey: string;
  secretKey: string;
}

export function generateKeypair(): KeypairMaterial {
  const kp = KeyPair.fromRandom("ed25519");
  return { publicKey: kp.getPublicKey().toString(), secretKey: kp.toString() };
}

/**
 * Write a NEAR credentials file with mode 0600. Refuses to overwrite:
 * silently replacing a key file is how agents lose accounts.
 */
export function writeCredentialsFile(
  filePath: string,
  creds: { account_id: string; public_key: string; private_key: string },
): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(filePath, JSON.stringify(creds, null, 2) + "\n", { mode: 0o600, flag: "wx" });
  fs.chmodSync(filePath, 0o600);
}

// ---------------------------------------------------------------------------
// Setup driver: the chain-touching steps, behind an interface so the
// procedure is unit-testable with a fake.
// ---------------------------------------------------------------------------

export interface LeashSetupDriver {
  registerAgent(
    contractId: string,
    agentAccountId: string,
    codeHash: string,
  ): Promise<{ txHash?: string }>;
  addLeashKey(
    agentAccountId: string,
    leashPublicKey: string,
    contractId: string,
    methods: readonly AgentMethod[],
    allowanceYocto: string,
  ): Promise<{ txHash?: string }>;
  viewAccessKey(accountId: string, publicKey: string): Promise<AccessKeyViewLike | null>;
}

/** Live driver (near-api-js). Owner key signs (b); the agent account's
 *  fresh full-access key signs (c); (d) is an unsigned view. */
export class NearLeashSetupDriver implements LeashSetupDriver {
  private readonly provider: JsonRpcProvider;
  private readonly owner: Account;
  private readonly agentKeyFile: string;

  constructor(opts: {
    rpcUrl: string;
    ownerAccountId: string;
    ownerKeyFile: string;
    /** The agent account's full-access credential file (step a output). */
    agentKeyFile: string;
  }) {
    this.provider = new JsonRpcProvider({ url: opts.rpcUrl });
    const ownerCreds = loadCredentialsFile(opts.ownerKeyFile);
    this.owner = new Account(
      opts.ownerAccountId,
      this.provider,
      KeyPairSigner.fromSecretKey(ownerCreds.private_key as KeyPairString),
    );
    this.agentKeyFile = opts.agentKeyFile;
  }

  async registerAgent(
    contractId: string,
    agentAccountId: string,
    codeHash: string,
  ): Promise<{ txHash?: string }> {
    const args = new TextEncoder().encode(
      JSON.stringify({ agent_account_id: agentAccountId, agent_code_hash: codeHash }),
    );
    const outcome = await this.owner.signAndSendTransaction({
      receiverId: contractId,
      actions: [actions.functionCall("set_agent", args, 30_000_000_000_000n, 0n)],
      waitUntil: "FINAL",
    });
    const hash = (outcome as { transaction?: { hash?: string } }).transaction?.hash;
    return hash ? { txHash: hash } : {};
  }

  async addLeashKey(
    agentAccountId: string,
    leashPublicKey: string,
    contractId: string,
    methods: readonly AgentMethod[],
    allowanceYocto: string,
  ): Promise<{ txHash?: string }> {
    const agentCreds = loadCredentialsFile(this.agentKeyFile);
    const agent = new Account(
      agentAccountId,
      this.provider,
      KeyPairSigner.fromSecretKey(agentCreds.private_key as KeyPairString),
    );
    const outcome = await agent.addFunctionCallAccessKey({
      publicKey: leashPublicKey,
      contractId,
      methodNames: [...methods],
      allowance: BigInt(allowanceYocto),
    });
    const hash = (outcome as { transaction?: { hash?: string } }).transaction?.hash;
    return hash ? { txHash: hash } : {};
  }

  async viewAccessKey(accountId: string, publicKey: string): Promise<AccessKeyViewLike | null> {
    try {
      const view = await this.provider.viewAccessKey({ accountId, publicKey });
      return view as unknown as AccessKeyViewLike;
    } catch {
      return null;
    }
  }
}

// ---------------------------------------------------------------------------
// The procedure itself.
// ---------------------------------------------------------------------------

export interface CreateLeashedKeyOptions {
  contractId: string;
  agentAccountId: string;
  /** Directory INSIDE the vault where key files are written. */
  vaultKeyDir: string;
  /** Worker src dir for the code hash, unless codeHash is supplied. */
  workerSrcDir: string;
  codeHash?: string;
  allowanceYocto?: string;
  /** Dry run: derive keys + compute hash, print the plan, touch no chain. */
  dryRun: boolean;
}

export interface CreateLeashedKeyResult {
  agentAccountId: string;
  contractId: string;
  codeHash: string;
  fullAccessKeyFile: string;
  leashKeyFile: string;
  leashPublicKey: string;
  registerTxHash?: string;
  addKeyTxHash?: string;
  evidence: LeashEvidence | null; // null in dry-run (nothing on-chain yet)
}

export async function createLeashedKey(
  opts: CreateLeashedKeyOptions,
  driver: LeashSetupDriver | null,
): Promise<CreateLeashedKeyResult> {
  const fullKeyFile = path.join(opts.vaultKeyDir, "agent-full-ed25519.json");
  const leashKeyFile = path.join(opts.vaultKeyDir, "agent-leashed-ed25519.json");
  const fullExists = fs.existsSync(fullKeyFile);
  const leashExists = fs.existsSync(leashKeyFile);
  if (fullExists !== leashExists) {
    throw new Error(
      "exactly one of the agent key files exists — inconsistent vault state; resolve manually, never by overwriting a key",
    );
  }

  // (a) derive keypairs into the vault — or load them if a previous
  // (dry) run already derived them. The intended flow is: dry run
  // derives keys → the agent account is created with the full-access
  // public key → live run loads the same keys and finishes the setup.
  // Existing keys are NEVER overwritten.
  let leash: KeypairMaterial;
  if (fullExists) {
    const leashCreds = loadCredentialsFile(leashKeyFile);
    leash = { publicKey: leashCreds.public_key, secretKey: leashCreds.private_key };
  } else {
    const full = generateKeypair();
    leash = generateKeypair();
    writeCredentialsFile(fullKeyFile, {
      account_id: opts.agentAccountId,
      public_key: full.publicKey,
      private_key: full.secretKey,
    });
    writeCredentialsFile(leashKeyFile, {
      account_id: opts.agentAccountId,
      public_key: leash.publicKey,
      private_key: leash.secretKey,
    });
  }

  const codeHash = opts.codeHash ?? computeWorkerCodeHash(opts.workerSrcDir);
  const allowance = opts.allowanceYocto ?? DEFAULT_LEASH_ALLOWANCE_YOCTO;

  if (opts.dryRun) {
    return {
      agentAccountId: opts.agentAccountId,
      contractId: opts.contractId,
      codeHash,
      fullAccessKeyFile: fullKeyFile,
      leashKeyFile,
      leashPublicKey: leash.publicKey,
      evidence: null,
    };
  }
  if (!driver) throw new Error("a LeashSetupDriver is required when not in dry-run mode");

  // (b) owner registers the agent + pinned code hash
  const reg = await driver.registerAgent(opts.contractId, opts.agentAccountId, codeHash);
  // (c) agent account adds the function-call leash key
  const add = await driver.addLeashKey(
    opts.agentAccountId,
    leash.publicKey,
    opts.contractId,
    AGENT_METHOD_ALLOWLIST,
    allowance,
  );
  // (d) read the permission object back and assert it is exactly the leash
  const view = await driver.viewAccessKey(opts.agentAccountId, leash.publicKey);
  const evidence = assertLeashEvidence(view, opts.contractId);

  return {
    agentAccountId: opts.agentAccountId,
    contractId: opts.contractId,
    codeHash,
    fullAccessKeyFile: fullKeyFile,
    leashKeyFile,
    leashPublicKey: leash.publicKey,
    ...(reg.txHash ? { registerTxHash: reg.txHash } : {}),
    ...(add.txHash ? { addKeyTxHash: add.txHash } : {}),
    evidence,
  };
}
