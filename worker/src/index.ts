import { loadWorkerConfig, loadCredentialsFile } from "./config.js";
import { NearChainClient, LeashedChainClient } from "./chain.js";
import { FileVault } from "./vault.js";
import { NullAttestationProvider } from "./attestation.js";
import { BoundenWorker } from "./worker.js";
import { assertLeashEvidence } from "./leash.js";
import { consoleLogger as logger } from "./logger.js";

/**
 * Worker entrypoint. Startup sequence is deliberately paranoid:
 *
 *  1. Load config from env (paths only — no secret values in env).
 *  2. Build the chain client from the LEASHED credential file.
 *  3. Verify the leash on-chain BEFORE doing any work: the loaded key
 *     must be a function-call key bound to this contract with exactly
 *     the two-method allowlist, and the contract's registered agent
 *     must be this account. Either mismatch → exit, do not improvise.
 *  4. Poll loop until SIGINT/SIGTERM.
 */
async function main(): Promise<void> {
  const config = loadWorkerConfig();
  const creds = loadCredentialsFile(config.agentKeyFile);
  if (creds.account_id && creds.account_id !== config.agentAccountId) {
    throw new Error(
      `agent key file account_id (${creds.account_id}) does not match BOUNDEN_AGENT_ACCOUNT_ID (${config.agentAccountId})`,
    );
  }

  const raw = new NearChainClient({
    rpcUrl: config.rpcUrl,
    contractId: config.contractAccountId,
    signerAccountId: config.agentAccountId,
    signerKeyFile: config.agentKeyFile,
  });
  const chain = new LeashedChainClient(raw);

  const keyView = await chain.viewAccessKey(config.agentAccountId, creds.public_key);
  const evidence = assertLeashEvidence(keyView, config.contractAccountId);
  logger.info("leash verified on-chain", {
    agent: config.agentAccountId,
    contract: config.contractAccountId,
    receiver: evidence.receiver_id,
    methods: evidence.method_names,
    allowance: evidence.allowance,
  });

  const constitution = await chain.getConstitution();
  if (constitution.agent_account_id !== config.agentAccountId) {
    throw new Error(
      `contract's registered agent is ${constitution.agent_account_id ?? "(none)"}, not ${config.agentAccountId} — run create-leashed-key first`,
    );
  }
  logger.info("constitution read", {
    owner: constitution.owner_id,
    paymentToken: constitution.payment_token,
    refundCapUsd: constitution.refund_cap_usd,
    refundWindowNs: constitution.refund_window_ns,
  });

  const vault = FileVault.open(config.vaultDir, FileVault.loadKeyFile(config.vaultKeyFile));
  const attestation = new NullAttestationProvider();
  logger.info("attestation provider", { provider: attestation.name });

  const worker = new BoundenWorker({
    chain,
    vault,
    attestation,
    logger,
    scanLimit: config.scanLimit,
  });

  let stopping = false;
  const stop = (signal: string): void => {
    logger.info("shutdown requested", { signal });
    stopping = true;
  };
  process.on("SIGINT", () => stop("SIGINT"));
  process.on("SIGTERM", () => stop("SIGTERM"));

  logger.info("cashier worker running", { pollIntervalMs: config.pollIntervalMs });
  while (!stopping) {
    try {
      const report = await worker.pollOnce();
      if (report.fulfilledOrderIds.length || report.refundsIssuedOrderIds.length || report.errors.length) {
        logger.info("cycle complete", { ...report });
      }
    } catch (err) {
      logger.error("poll cycle failed; will retry", {
        message: err instanceof Error ? err.message : String(err),
      });
    }
    if (!stopping) {
      await new Promise((resolve) => setTimeout(resolve, config.pollIntervalMs));
    }
  }
  logger.info("cashier worker stopped");
}

main().catch((err: unknown) => {
  logger.error("fatal startup error", { message: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
