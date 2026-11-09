import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AGENT_METHOD_ALLOWLIST,
  LeashedChainClient,
  LeashViolationError,
  MockChainClient,
} from "../src/chain.js";
import type { AgentMethod } from "../src/chain.js";
import {
  assertLeashEvidence,
  computeWorkerCodeHash,
  createLeashedKey,
} from "../src/leash.js";
import type { LeashSetupDriver } from "../src/leash.js";
import type { AccessKeyViewLike } from "../src/types.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const CONTRACT = "bounden.testnet";

describe("the allowlist", () => {
  it("is exactly the two constitution methods", () => {
    expect([...AGENT_METHOD_ALLOWLIST]).toEqual(["fulfil_order", "issue_refund"]);
  });

  it("passes allowlisted methods through to the chain", async () => {
    const mock = new MockChainClient();
    mock.addOrder({
      id: 0,
      buyer: "buyer.testnet",
      product_id: "licence-pro",
      amount_usd: "25000000",
      state: "Paid",
      created_at: 1,
      paid_at: 1,
      judgement_attestation_hash: null,
    });
    const leashed = new LeashedChainClient(mock);
    await leashed.callAgentMethod("fulfil_order", { order_id: 0, delivery_evidence_hash: "ab" });
    expect(mock.callLog).toHaveLength(1);
    expect(leashed.blockedAttempts).toEqual([]);
  });

  it("blocks every non-allowlisted method before the chain sees it", async () => {
    const mock = new MockChainClient();
    const leashed = new LeashedChainClient(mock);
    const forbidden = [
      "withdraw_treasury",
      "ft_transfer",
      "set_agent",
      "update_product",
      "add_inventory_commitments",
      "create_order",
    ];
    for (const method of forbidden) {
      await expect(
        leashed.callAgentMethod(method as AgentMethod, { order_id: 0 }),
      ).rejects.toBeInstanceOf(LeashViolationError);
    }
    expect(mock.callLog).toHaveLength(0); // nothing reached the chain layer
    expect(leashed.blockedAttempts).toEqual(forbidden);
  });

  it("construction: no treasury-moving call exists anywhere in worker source", () => {
    // The strongest guarantee is absence: if the string never appears in
    // src/ or scripts/, no code path can name the method. (Docs and this
    // test file are excluded — they describe the attack, they don't run.)
    const roots = [path.join(here, "..", "src"), path.join(here, "..", "scripts")];
    let corpus = "";
    for (const root of roots) {
      for (const f of fs.readdirSync(root)) {
        if (f.endsWith(".ts")) corpus += fs.readFileSync(path.join(root, f), "utf8");
      }
    }
    expect(corpus.length).toBeGreaterThan(1000);
    expect(corpus).not.toMatch(/withdraw/i);
  });
});

describe("assertLeashEvidence", () => {
  const goodView: AccessKeyViewLike = {
    nonce: 3,
    permission: {
      FunctionCall: {
        allowance: "250000000000000000000000",
        receiver_id: CONTRACT,
        method_names: ["issue_refund", "fulfil_order"], // order must not matter
      },
    },
  };

  it("accepts exactly the leash", () => {
    const ev = assertLeashEvidence(goodView, CONTRACT);
    expect(ev.receiver_id).toBe(CONTRACT);
    expect(ev.method_names).toEqual(["fulfil_order", "issue_refund"]);
  });

  it("rejects a full-access key", () => {
    expect(() => assertLeashEvidence({ nonce: 0, permission: "FullAccess" }, CONTRACT)).toThrow(
      /FULL ACCESS/,
    );
  });

  it("rejects a key bound to another contract", () => {
    const view: AccessKeyViewLike = {
      nonce: 0,
      permission: {
        FunctionCall: { allowance: null, receiver_id: "other.testnet", method_names: ["fulfil_order", "issue_refund"] },
      },
    };
    expect(() => assertLeashEvidence(view, CONTRACT)).toThrow(/receiver mismatch/);
  });

  it("rejects an allowlist with an extra method smuggled in", () => {
    const view: AccessKeyViewLike = {
      nonce: 0,
      permission: {
        FunctionCall: {
          allowance: null,
          receiver_id: CONTRACT,
          method_names: ["fulfil_order", "issue_refund", "ft_transfer"],
        },
      },
    };
    expect(() => assertLeashEvidence(view, CONTRACT)).toThrow(/allowlist mismatch/);
  });

  it("rejects a missing key", () => {
    expect(() => assertLeashEvidence(null, CONTRACT)).toThrow(/not found/);
  });
});

class FakeDriver implements LeashSetupDriver {
  readonly calls: string[] = [];
  view: AccessKeyViewLike | null = null;
  async registerAgent(contractId: string, agentAccountId: string, codeHash: string) {
    this.calls.push(`registerAgent:${contractId}:${agentAccountId}:${codeHash.slice(0, 8)}`);
    return { txHash: "fake-register-tx" };
  }
  async addLeashKey(
    agentAccountId: string,
    leashPublicKey: string,
    contractId: string,
    methods: readonly AgentMethod[],
    allowanceYocto: string,
  ): Promise<{ txHash?: string }> {
    this.calls.push(
      `addLeashKey:${agentAccountId}:${leashPublicKey.slice(0, 16)}:${contractId}:${methods.join("+")}:${allowanceYocto}`,
    );
    this.view = {
      nonce: 1,
      permission: {
        FunctionCall: {
          allowance: allowanceYocto,
          receiver_id: contractId,
          method_names: [...methods],
        },
      },
    };
    return { txHash: "fake-addkey-tx" };
  }
  async viewAccessKey(): Promise<AccessKeyViewLike | null> {
    return this.view;
  }
}

describe("createLeashedKey procedure", () => {
  const srcDir = path.join(here, "..", "src");
  function tmpVault(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), "bounden-leash-"));
  }

  it("dry run derives keys into the vault, computes the code hash, touches no chain", async () => {
    const dir = tmpVault();
    const result = await createLeashedKey(
      { contractId: CONTRACT, agentAccountId: "cashier.bounden.testnet", vaultKeyDir: dir, workerSrcDir: srcDir, dryRun: true },
      null,
    );
    expect(result.evidence).toBeNull();
    expect(result.codeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.codeHash).toBe(computeWorkerCodeHash(srcDir));
    for (const f of [result.fullAccessKeyFile, result.leashKeyFile]) {
      expect(fs.existsSync(f)).toBe(true);
      expect(fs.statSync(f).mode & 0o777).toBe(0o600);
      const creds = JSON.parse(fs.readFileSync(f, "utf8")) as { account_id: string; public_key: string };
      expect(creds.account_id).toBe("cashier.bounden.testnet");
      expect(creds.public_key).toMatch(/^ed25519:/);
    }
    // The two keypairs are distinct: the worker's leash key is NOT the
    // account's full-access key.
    const full = JSON.parse(fs.readFileSync(result.fullAccessKeyFile, "utf8")) as { public_key: string };
    expect(full.public_key).not.toBe(result.leashPublicKey);
  });

  it("full run registers, adds the leash key, and returns verified evidence", async () => {
    const dir = tmpVault();
    const driver = new FakeDriver();
    const result = await createLeashedKey(
      { contractId: CONTRACT, agentAccountId: "cashier.bounden.testnet", vaultKeyDir: dir, workerSrcDir: srcDir, dryRun: false },
      driver,
    );
    expect(driver.calls[0]).toMatch(/^registerAgent:bounden\.testnet:cashier\.bounden\.testnet:/);
    expect(driver.calls[1]).toContain("fulfil_order+issue_refund");
    expect(driver.calls[1]).toContain("250000000000000000000000");
    expect(result.registerTxHash).toBe("fake-register-tx");
    expect(result.evidence?.receiver_id).toBe(CONTRACT);
    expect(result.evidence?.method_names).toEqual(["fulfil_order", "issue_refund"]);

    // A second run loads the SAME keys (the dry-run → claim → live flow)
    // instead of rotating them silently.
    const driver2 = new FakeDriver();
    const again = await createLeashedKey(
      { contractId: CONTRACT, agentAccountId: "cashier.bounden.testnet", vaultKeyDir: dir, workerSrcDir: srcDir, dryRun: false },
      driver2,
    );
    expect(again.leashPublicKey).toBe(result.leashPublicKey);
  });

  it("fails loudly when the on-chain key turns out to be full access", async () => {
    const dir = tmpVault();
    const driver = new FakeDriver();
    driver.addLeashKey = async (): Promise<{ txHash?: string }> => {
      driver.view = { nonce: 0, permission: "FullAccess" };
      return {};
    };
    await expect(
      createLeashedKey(
        { contractId: CONTRACT, agentAccountId: "cashier.bounden.testnet", vaultKeyDir: dir, workerSrcDir: srcDir, dryRun: false },
        driver,
      ),
    ).rejects.toThrow(/FULL ACCESS/);
  });

  it("refuses a half-written key state instead of overwriting", async () => {
    const dir = tmpVault();
    fs.writeFileSync(path.join(dir, "agent-full-ed25519.json"), "{}");
    await expect(
      createLeashedKey(
        { contractId: CONTRACT, agentAccountId: "cashier.bounden.testnet", vaultKeyDir: dir, workerSrcDir: srcDir, dryRun: true },
        null,
      ),
    ).rejects.toThrow(/inconsistent/);
  });
});
