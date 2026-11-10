import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

/**
 * Worker configuration — environment variables ONLY. No config file, and
 * no secret value is ever accepted on the command line or logged.
 *
 * Required for the live worker:
 *   BOUNDEN_CONTRACT_ACCOUNT_ID  shop contract account (e.g. bounden.testnet)
 *   BOUNDEN_AGENT_ACCOUNT_ID     the registered agent account id
 *   BOUNDEN_AGENT_KEY_FILE       path to the LEASHED keypair credential
 *                                (NEAR credentials JSON) inside the vault
 *   BOUNDEN_VAULT_DIR            vault directory (default:
 *                                ~/workspace/bounden-secrets/worker-vault)
 *   BOUNDEN_VAULT_KEY_FILE       path to the 32-byte vault encryption key
 * Optional:
 *   NEAR_RPC_URL                 default https://rpc.testnet.near.org
 *   BOUNDEN_POLL_INTERVAL_MS     default 15000
 *   BOUNDEN_SCAN_LIMIT           max order ids probed per cycle, default 10000
 *   BOUNDEN_COUNTER_URL          storefront base URL — enables the
 *                                delivery counter (src/delivery-counter.ts)
 *   BOUNDEN_COUNTER_SECRET       shared secret for the storefront
 *                                rendezvous' worker endpoints. Both
 *                                counter variables must be set together,
 *                                or the counter stays off.
 */
export interface WorkerConfig {
  contractAccountId: string;
  agentAccountId: string;
  agentKeyFile: string;
  vaultDir: string;
  vaultKeyFile: string;
  rpcUrl: string;
  pollIntervalMs: number;
  scanLimit: number;
  counterUrl: string | null;
  counterSecret: string | null;
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const v = env[name];
  if (!v || v.trim() === "") {
    throw new Error(`missing required environment variable ${name}`);
  }
  return v.trim();
}

function optionalInt(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const v = env[name];
  if (!v) return fallback;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`environment variable ${name} must be a positive number, got "${v}"`);
  }
  return Math.floor(n);
}

export function loadWorkerConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  const vaultDir =
    env.BOUNDEN_VAULT_DIR?.trim() ||
    path.join(os.homedir(), "workspace", "bounden-secrets", "worker-vault");
  return {
    contractAccountId: required(env, "BOUNDEN_CONTRACT_ACCOUNT_ID"),
    agentAccountId: required(env, "BOUNDEN_AGENT_ACCOUNT_ID"),
    agentKeyFile: required(env, "BOUNDEN_AGENT_KEY_FILE"),
    vaultDir,
    vaultKeyFile: required(env, "BOUNDEN_VAULT_KEY_FILE"),
    rpcUrl: env.NEAR_RPC_URL?.trim() || "https://rpc.testnet.near.org",
    pollIntervalMs: optionalInt(env, "BOUNDEN_POLL_INTERVAL_MS", 15_000),
    scanLimit: optionalInt(env, "BOUNDEN_SCAN_LIMIT", 10_000),
    ...loadCounterConfig(env),
  };
}

function loadCounterConfig(env: NodeJS.ProcessEnv): { counterUrl: string | null; counterSecret: string | null } {
  const url = env.BOUNDEN_COUNTER_URL?.trim() || null;
  const secret = env.BOUNDEN_COUNTER_SECRET?.trim() || null;
  if ((url === null) !== (secret === null)) {
    throw new Error(
      "BOUNDEN_COUNTER_URL and BOUNDEN_COUNTER_SECRET must be set together (delivery counter), or both left unset",
    );
  }
  return { counterUrl: url, counterSecret: secret };
}

/** Shape of a NEAR credentials file (as written by near-cli / our setup). */
export interface NearCredentialsFile {
  account_id: string;
  public_key: string;
  private_key: string;
}

/**
 * Load a NEAR credentials JSON file. The private key is returned to the
 * caller (the signer construction) and must never be logged — call sites
 * pass the whole object only into signer constructors.
 */
export function loadCredentialsFile(filePath: string): NearCredentialsFile {
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw) as Partial<NearCredentialsFile>;
  if (!parsed.public_key || !parsed.private_key) {
    throw new Error(`credentials file ${filePath} lacks public_key/private_key`);
  }
  return {
    account_id: parsed.account_id ?? "",
    public_key: parsed.public_key,
    private_key: parsed.private_key,
  };
}
