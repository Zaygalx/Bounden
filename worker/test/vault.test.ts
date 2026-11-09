import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { FileVault, InMemoryVault, sha256Hex } from "../src/vault.js";
import { MemoryLogger } from "../src/logger.js";
import { redactString } from "../src/redact.js";

const CODE_A = "BOUNDEN-TEST-LICENCE-0001";
const CODE_B = "BOUNDEN-TEST-LICENCE-0002";

describe("FileVault", () => {
  function openVault() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bounden-vault-"));
    const key = randomBytes(32);
    return { dir, vault: FileVault.open(dir, key) };
  }

  it("stores codes encrypted at rest — the state file contains no plaintext", async () => {
    const { dir, vault } = openVault();
    await vault.addCodes("licence-pro", [CODE_A, CODE_B]);
    const raw = fs.readFileSync(path.join(dir, "vault-state.json"), "utf8");
    expect(raw).not.toContain(CODE_A);
    expect(raw).not.toContain(CODE_B);
    expect(fs.statSync(path.join(dir, "vault-state.json")).mode & 0o777).toBe(0o600);
  });

  it("commitments are SHA-256 of the codes, in registration (FIFO) order", async () => {
    const { vault } = openVault();
    await vault.addCodes("licence-pro", [CODE_A, CODE_B]);
    expect(await vault.commitments("licence-pro")).toEqual([sha256Hex(CODE_A), sha256Hex(CODE_B)]);
  });

  it("prepare → finalize consumes exactly the head code, in order", async () => {
    const { vault } = openVault();
    await vault.addCodes("licence-pro", [CODE_A, CODE_B]);
    expect(await vault.availableCount("licence-pro")).toBe(2);

    const d0 = await vault.prepareDelivery(0, "buyer.testnet", "licence-pro");
    expect(d0.commitment).toBe(sha256Hex(CODE_A));
    expect(d0.evidenceHash).toMatch(/^[0-9a-f]{64}$/);
    expect(await vault.availableCount("licence-pro")).toBe(1);

    await vault.finalizeDelivery(0);
    expect((await vault.getDelivery(0))?.finalized).toBe(true);
    expect(await vault.reservedDeliveries()).toHaveLength(0);

    const d1 = await vault.prepareDelivery(1, "buyer.testnet", "licence-pro");
    expect(d1.commitment).toBe(sha256Hex(CODE_B)); // FIFO: second code second
    await expect(vault.prepareDelivery(2, "buyer.testnet", "licence-pro")).rejects.toThrow(
      /exhausted/,
    );
  });

  it("release returns the reserved code to the available pool", async () => {
    const { vault } = openVault();
    await vault.addCodes("licence-pro", [CODE_A]);
    await vault.prepareDelivery(0, "buyer.testnet", "licence-pro");
    expect(await vault.availableCount("licence-pro")).toBe(0);
    await vault.releaseDelivery(0);
    expect(await vault.availableCount("licence-pro")).toBe(1);
    expect(await vault.getDelivery(0)).toBeNull();
    const again = await vault.prepareDelivery(1, "buyer.testnet", "licence-pro");
    expect(again.commitment).toBe(sha256Hex(CODE_A)); // same code, not burned
  });

  it("rejects duplicate codes for a product", async () => {
    const { vault } = openVault();
    await vault.addCodes("licence-pro", [CODE_A]);
    await expect(vault.addCodes("licence-pro", [CODE_A])).rejects.toThrow(/duplicate/);
  });

  it("persists across reopen and the delivery record supports buyer verification", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bounden-vault-"));
    const key = randomBytes(32);
    const v1 = FileVault.open(dir, key);
    await v1.addCodes("licence-pro", [CODE_A]);
    const d = await v1.prepareDelivery(7, "buyer.testnet", "licence-pro");
    await v1.finalizeDelivery(7);

    const v2 = FileVault.open(dir, key);
    const record = await v2.getDelivery(7);
    expect(record?.evidenceHash).toBe(d.evidenceHash);
    // Buyer-side check: the delivered code hashes to the commitment that
    // the delivery record (and the chain) carry.
    expect(sha256Hex(CODE_A)).toBe(record?.commitment);
  });

  it("refund request lifecycle: add → pending → resolved", async () => {
    const { vault } = openVault();
    await vault.addRefundRequest({
      requestId: "rq-1",
      orderId: 3,
      reason: "test",
      requestedAt: new Date().toISOString(),
    });
    expect(await vault.pendingRefundRequests()).toHaveLength(1);
    await vault.resolveRefundRequest("rq-1", { status: "refused", reason: "above cap" });
    expect(await vault.pendingRefundRequests()).toHaveLength(0);
  });

  it("loads a 32-byte key from base64 or hex files", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bounden-key-"));
    const key = randomBytes(32);
    const b64File = path.join(dir, "k.b64");
    fs.writeFileSync(b64File, key.toString("base64"));
    expect(FileVault.loadKeyFile(b64File).equals(key)).toBe(true);
    const hexFile = path.join(dir, "k.hex");
    fs.writeFileSync(hexFile, key.toString("hex"));
    expect(FileVault.loadKeyFile(hexFile).equals(key)).toBe(true);
  });
});

describe("InMemoryVault", () => {
  it("mirrors the FileVault delivery semantics", async () => {
    const vault = new InMemoryVault();
    await vault.addCodes("licence-pro", [CODE_A]);
    const d = await vault.prepareDelivery(0, "buyer.testnet", "licence-pro");
    expect(d.commitment).toBe(sha256Hex(CODE_A));
    expect(await vault.availableCount("licence-pro")).toBe(0);
    await vault.finalizeDelivery(0);
    expect((await vault.getDelivery(0))?.finalized).toBe(true);
  });
});

describe("log redaction", () => {
  it("strips NEAR private keys and inventory codes from log output", () => {
    const logger = new MemoryLogger();
    const fakeKey = `ed25519:${"3hQvhzFku2co3kGRDzCJ4xTxYFqMqzZRT8KkJQDNvXyz"}`;
    logger.info(`signing with ${fakeKey} for code ${CODE_A}`, {
      private_key: fakeKey,
      note: `deliver ${CODE_B}`,
    });
    const text = logger.text();
    expect(text).not.toContain("3hQvhzFku2co3kGRDzCJ4xTxYFqMqzZRT8KkJQDNvXyz");
    expect(text).not.toContain(CODE_A);
    expect(text).not.toContain(CODE_B);
    expect(text).toContain("[REDACTED]");
    expect(redactString(`key ${fakeKey}`)).toContain("ed25519:[REDACTED]");
  });
});
