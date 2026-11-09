/**
 * SCAFFOLD — NOT DEPLOYED, NOT REGISTERED, NOT WIRED.
 *
 * Stage 4 adapter sketch (design: docs/SHADE.md). This file shows how
 * the existing Bounden worker's entry points map onto the Shade Agent
 * Framework template's expected shape. It is NOT part of the worker
 * package, is not built or typechecked in CI, and must not be run as
 * the cashier. The shipped cashier is worker/src/index.ts.
 *
 * Shape follows the framework template (NearDeFi/shade-agent-template):
 * a TypeScript/Hono service whose index.ts initialises the Shade
 * client, registers the agent with its agent contract, and defines
 * routes. Bounden's difference: once registration succeeds, control
 * hands off to the EXISTING BoundenWorker poll loop (worker/), which
 * is a daemon, not a request handler. See docs/SHADE.md §1.5 (deltas
 * D1–D7) for what changes and what does not.
 */

// --- Imports are illustrative: @neardefi/shade-agent-js version is
// --- resolved at real build time (docs/SHADE.md §3); hono is the
// --- template's framework. Do not add this file's deps to worker/.
// import { ShadeClient } from "@neardefi/shade-agent-js";
// import { Hono } from "hono";
// import { BoundenWorker } from "../../worker/src/worker.js";
// import { NearChainClient, LeashedChainClient } from "../../worker/src/chain.js";
// import { FileVault } from "../../worker/src/vault.js"; // ← Stage 4 replaces this (delta D4)

throw new Error(
  "shade/ is a scaffold sketch (docs/SHADE.md). It is not runnable. " +
    "The shipped cashier is worker/src/index.ts.",
);

/*
 * The intended runtime sequence, in template order:
 *
 * 1. ShadeClient.create({
 *      networkId: "testnet",
 *      agentContractId: REGISTRY_CONTRACT_ID,   // the Shade registry
 *                                               // contract, NOT the
 *                                               // shop contract
 *      sponsor: { accountId, privateKey },       // from env/vault;
 *                                               // funds the agent
 *      derivationPath: <random secret>,          // local mode only;
 *                                               // ignored in TEE
 *    })
 *
 * 2. Fund check (template pattern):
 *      if (await agent.balance() < 0.2) await agent.fund(0.3);
 *    register_agent itself needs 0.00486 NEAR attached for storage.
 *
 * 3. Registration loop (template pattern): agent.register() until it
 *    succeeds. In TEE mode this submits the Dstack attestation; the
 *    registry verifies it with the shade-attestation crate against
 *    the owner-approved measurements + PPIDs. In local mode the
 *    account must first be whitelisted by the owner
 *    (`shade whitelist`).
 *
 * 4. Re-register timer: registrations expire
 *    (attestation_expiration_time_ms; template default 7 days), so
 *    setInterval(agent.register, 6 days) — template pattern.
 *
 * 5. NEW for Bounden — Shade-mode leash verification (delta D5),
 *    replacing the Stage 2 credentials-file check in
 *    worker/src/index.ts:
 *      - registry.get_agent(this account) is valid and unexpired;
 *      - the shop contract's get_constitution().agent_account_id is
 *        this (implicit, 64-hex) account;
 *      - the shop's pinned agent_code_hash equals the app compose
 *        hash in the registry's approved measurements for this agent;
 *      - the FC key this process holds on the SHOP contract is still
 *        exactly [fulfil_order, issue_refund] (assertLeashEvidence,
 *        reused unchanged from worker/src/leash.ts).
 *    Any mismatch → exit. Never improvise past a failed check.
 */
async function assertShadeLeashEvidence(): Promise<never> {
  // TODO(stage-4): implement per step 5 above. A stub that throws is
  // deliberate: a scaffold must not be able to "pass" verification.
  throw new Error("not implemented in scaffold — see docs/SHADE.md §2.2 (Option A)");
}

/*
 * 6. HTTP surface (template shape; Phala deployments expect a
 *    reachable app). Minimal routes only:
 *      GET /api/health     → { ok: true }
 *      GET /api/agent-info → { accountId, registry registration
 *                              (measurements, ppid, valid_until),
 *                              shop constitution agent fields }
 *    No route may trigger a fulfil or refund. The framework's own
 *    security doc warns that unauthenticated action routes let
 *    anyone drain gas; Bounden's actions stay poll-driven, exactly
 *    as in Stage 2.
 *
 * 7. Handoff: construct the chain client + vault and start the
 *    EXISTING poll loop. Two Stage 4 substitutions, both flagged in
 *    docs/SHADE.md:
 *      - chain client signer: the enclave's ephemeral key (delta D3),
 *        not a vault credentials file;
 *      - vault: ciphertext fetched at cold start, key derived
 *        in-enclave (delta D4) — FileVault's local directory does
 *        not exist inside a CVM in any trustworthy form.
 *    const worker = new BoundenWorker({ chain, vault, attestation,
 *                                       logger, scanLimit });
 *    await worker.runForever(); // existing loop, unchanged
 */

export { assertShadeLeashEvidence };
