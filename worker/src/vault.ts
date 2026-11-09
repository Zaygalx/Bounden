import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * The sealed-inventory vault — the off-chain half of Bounden's secrecy
 * design (docs/PLAN.md, "How inventory stays secret on a public chain").
 *
 *  - On-chain there are only SHA-256 commitments. Plaintext codes live
 *    HERE, encrypted at rest (AES-256-GCM, per-code IV), in a directory
 *    OUTSIDE the repo (~/workspace/bounden-secrets/worker-vault).
 *  - FIFO discipline: the contract consumes its FIRST unconsumed
 *    commitment per product, so the vault hands out codes in exactly the
 *    order their commitments were registered. The seed script prints
 *    commitments in vault order; the owner registers them in that order.
 *  - Delivery: `prepareDelivery` reserves the head code and packages it
 *    encrypted under a fresh per-order delivery key; only the SHA-256 of
 *    the ciphertext goes on-chain as the delivery evidence hash. The
 *    worker process NEVER sees the plaintext code — decryption and
 *    re-encryption happen inside this class.
 *
 * DEMO vs PRODUCTION, stated plainly: in this local demo version the
 * per-order delivery key is stored in the vault's delivery record,
 * because there is no buyer key infrastructure yet (no storefront until
 * Stage 3). The production upgrade replaces the symmetric delivery key
 * with encryption to the buyer's ephemeral public key, so after delivery
 * nobody — worker included — can decrypt the buyer's copy. The invariant
 * that matters for the thesis holds in both versions: no plaintext code
 * ever touches the chain, and codes at rest are encrypted.
 *
 * PRODUCTION INVENTORY RULE: real codes must be high-entropy. The
 * on-chain commitment is a bare SHA-256 of the code; a low-entropy code
 * (sequential, short, guessable) could be brute-forced from its
 * commitment. Demo codes are deliberately guessable AND worthless.
 */

export function sha256Hex(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

export interface PreparedDelivery {
  orderId: number;
  productId: string;
  /** Commitment of the reserved code — matches an on-chain commitment. */
  commitment: string;
  /** SHA-256 hex of the delivery ciphertext. This goes on-chain. */
  evidenceHash: string;
}

export interface DeliveryRecord extends PreparedDelivery {
  buyer: string;
  /** AES-256-GCM ciphertext of the code, base64. */
  ciphertext: string;
  /** DEMO ONLY: per-order delivery key, base64. See header note. */
  deliveryKey: string;
  createdAt: string;
  finalized: boolean;
}

export type RefundOutcome =
  | { status: "issued"; txHash?: string }
  | { status: "refused"; reason: string };

export interface RefundRequest {
  requestId: string;
  orderId: number;
  reason: string;
  requestedAt: string;
  outcome: (RefundOutcome & { at: string }) | null;
}

export interface VaultStore {
  /** Register codes for a product (encrypted at rest in FileVault). */
  addCodes(productId: string, codes: string[]): Promise<void>;
  /** Commitments in FIFO order — the order to register on-chain. */
  commitments(productId: string): Promise<string[]>;
  availableCount(productId: string): Promise<number>;
  /** Reserve the head code and package the delivery. */
  prepareDelivery(orderId: number, buyer: string, productId: string): Promise<PreparedDelivery>;
  /** Mark a prepared delivery final (call after the on-chain fulfil). */
  finalizeDelivery(orderId: number): Promise<void>;
  /** Release a reservation after a failed on-chain call. */
  releaseDelivery(orderId: number): Promise<void>;
  reservedDeliveries(): Promise<DeliveryRecord[]>;
  getDelivery(orderId: number): Promise<DeliveryRecord | null>;
  addRefundRequest(req: Omit<RefundRequest, "outcome">): Promise<void>;
  pendingRefundRequests(): Promise<RefundRequest[]>;
  resolveRefundRequest(requestId: string, outcome: RefundOutcome): Promise<void>;
}

// ---------------------------------------------------------------------------
// FileVault — AES-256-GCM encrypted state file inside the vault directory.
// ---------------------------------------------------------------------------

interface EncryptedCodeEntry {
  commitment: string;
  iv: string;
  tag: string;
  data: string;
  state: "available" | "reserved" | "delivered";
  orderId: number | null;
}

interface VaultState {
  version: 1;
  inventory: Record<string, EncryptedCodeEntry[]>;
  deliveries: Record<string, DeliveryRecord>;
  refundRequests: RefundRequest[];
}

const emptyState = (): VaultState => ({ version: 1, inventory: {}, deliveries: {}, refundRequests: [] });

export class FileVault implements VaultStore {
  private state: VaultState;
  private readonly file: string;

  private constructor(
    private readonly dir: string,
    private readonly key: Buffer,
  ) {
    this.file = path.join(dir, "vault-state.json");
    this.state = this.load();
  }

  /**
   * Open (or create) a vault. `key` must be 32 bytes. The directory is
   * forced to mode 0700 and the state file to 0600 on every save.
   */
  static open(dir: string, key: Buffer): FileVault {
    if (key.length !== 32) throw new Error("vault key must be exactly 32 bytes");
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    return new FileVault(dir, key);
  }

  /** Read a vault key file: base64 or hex encoding of 32 bytes. */
  static loadKeyFile(keyFile: string): Buffer {
    const raw = fs.readFileSync(keyFile, "utf8").trim();
    const fromB64 = Buffer.from(raw, "base64");
    if (fromB64.length === 32) return fromB64;
    const fromHex = Buffer.from(raw, "hex");
    if (fromHex.length === 32) return fromHex;
    throw new Error(`vault key file ${keyFile} does not contain a 32-byte key (base64 or hex)`);
  }

  private load(): VaultState {
    if (!fs.existsSync(this.file)) return emptyState();
    const parsed = JSON.parse(fs.readFileSync(this.file, "utf8")) as VaultState;
    if (parsed.version !== 1) throw new Error(`unsupported vault state version ${parsed.version}`);
    return parsed;
  }

  private save(): void {
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, this.file);
    fs.chmodSync(this.file, 0o600);
  }

  private encrypt(plaintext: string): { iv: string; tag: string; data: string } {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    return { iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: data.toString("base64") };
  }

  private decrypt(entry: { iv: string; tag: string; data: string }): string {
    const decipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(entry.iv, "base64"));
    decipher.setAuthTag(Buffer.from(entry.tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(entry.data, "base64")), decipher.final()]).toString("utf8");
  }

  async addCodes(productId: string, codes: string[]): Promise<void> {
    const list = (this.state.inventory[productId] ??= []);
    const existing = new Set(list.map((e) => e.commitment));
    for (const code of codes) {
      const commitment = sha256Hex(code);
      if (existing.has(commitment)) {
        throw new Error(`duplicate inventory commitment for product ${productId}: ${commitment}`);
      }
      existing.add(commitment);
      list.push({ commitment, ...this.encrypt(code), state: "available", orderId: null });
    }
    this.save();
  }

  async commitments(productId: string): Promise<string[]> {
    return (this.state.inventory[productId] ?? []).map((e) => e.commitment);
  }

  async availableCount(productId: string): Promise<number> {
    return (this.state.inventory[productId] ?? []).filter((e) => e.state === "available").length;
  }

  async prepareDelivery(orderId: number, buyer: string, productId: string): Promise<PreparedDelivery> {
    const existing = this.state.deliveries[String(orderId)];
    if (existing) {
      return {
        orderId,
        productId: existing.productId,
        commitment: existing.commitment,
        evidenceHash: existing.evidenceHash,
      };
    }
    const list = this.state.inventory[productId] ?? [];
    const entry = list.find((e) => e.state === "available");
    if (!entry) throw new Error(`vault inventory exhausted for product ${productId}`);
    const code = this.decrypt(entry);
    // Package for the buyer: fresh per-order key, AES-256-GCM.
    const deliveryKey = randomBytes(32);
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", deliveryKey, iv);
    const ciphertext = Buffer.concat([cipher.update(code, "utf8"), cipher.final()]);
    const packaged = Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
    const record: DeliveryRecord = {
      orderId,
      productId,
      commitment: entry.commitment,
      evidenceHash: sha256Hex(packaged),
      buyer,
      ciphertext: packaged.toString("base64"),
      deliveryKey: deliveryKey.toString("base64"),
      createdAt: new Date().toISOString(),
      finalized: false,
    };
    entry.state = "reserved";
    entry.orderId = orderId;
    this.state.deliveries[String(orderId)] = record;
    this.save();
    return { orderId, productId, commitment: record.commitment, evidenceHash: record.evidenceHash };
  }

  async finalizeDelivery(orderId: number): Promise<void> {
    const record = this.state.deliveries[String(orderId)];
    if (!record) throw new Error(`no prepared delivery for order ${orderId}`);
    record.finalized = true;
    const entry = (this.state.inventory[record.productId] ?? []).find(
      (e) => e.commitment === record.commitment && e.state === "reserved",
    );
    if (entry) {
      entry.state = "delivered";
      entry.orderId = orderId;
    }
    this.save();
  }

  async releaseDelivery(orderId: number): Promise<void> {
    const record = this.state.deliveries[String(orderId)];
    if (!record || record.finalized) return;
    const entry = (this.state.inventory[record.productId] ?? []).find(
      (e) => e.commitment === record.commitment && e.state === "reserved",
    );
    if (entry) {
      entry.state = "available";
      entry.orderId = null;
    }
    delete this.state.deliveries[String(orderId)];
    this.save();
  }

  async reservedDeliveries(): Promise<DeliveryRecord[]> {
    return Object.values(this.state.deliveries).filter((d) => !d.finalized);
  }

  async getDelivery(orderId: number): Promise<DeliveryRecord | null> {
    return this.state.deliveries[String(orderId)] ?? null;
  }

  async addRefundRequest(req: Omit<RefundRequest, "outcome">): Promise<void> {
    if (this.state.refundRequests.some((r) => r.requestId === req.requestId)) {
      throw new Error(`duplicate refund request id ${req.requestId}`);
    }
    this.state.refundRequests.push({ ...req, outcome: null });
    this.save();
  }

  async pendingRefundRequests(): Promise<RefundRequest[]> {
    return this.state.refundRequests.filter((r) => r.outcome === null).map((r) => ({ ...r }));
  }

  async resolveRefundRequest(requestId: string, outcome: RefundOutcome): Promise<void> {
    const req = this.state.refundRequests.find((r) => r.requestId === requestId);
    if (!req) throw new Error(`unknown refund request ${requestId}`);
    req.outcome = { ...outcome, at: new Date().toISOString() };
    this.save();
  }
}

// ---------------------------------------------------------------------------
// InMemoryVault — tests only. Same semantics, no encryption, no disk.
// ---------------------------------------------------------------------------

export class InMemoryVault implements VaultStore {
  private readonly inventory = new Map<string, Array<{ commitment: string; state: string; orderId: number | null }>>();
  private readonly deliveries = new Map<number, DeliveryRecord>();
  private readonly refunds: RefundRequest[] = [];

  async addCodes(productId: string, codes: string[]): Promise<void> {
    const list = this.inventory.get(productId) ?? [];
    for (const code of codes) {
      const commitment = sha256Hex(code);
      if (list.some((e) => e.commitment === commitment)) {
        throw new Error(`duplicate inventory commitment for product ${productId}: ${commitment}`);
      }
      list.push({ commitment, state: "available", orderId: null });
    }
    this.inventory.set(productId, list);
  }

  async commitments(productId: string): Promise<string[]> {
    return (this.inventory.get(productId) ?? []).map((e) => e.commitment);
  }

  async availableCount(productId: string): Promise<number> {
    return (this.inventory.get(productId) ?? []).filter((e) => e.state === "available").length;
  }

  async prepareDelivery(orderId: number, buyer: string, productId: string): Promise<PreparedDelivery> {
    const existing = this.deliveries.get(orderId);
    if (existing) {
      return { orderId, productId: existing.productId, commitment: existing.commitment, evidenceHash: existing.evidenceHash };
    }
    const entry = (this.inventory.get(productId) ?? []).find((e) => e.state === "available");
    if (!entry) throw new Error(`vault inventory exhausted for product ${productId}`);
    entry.state = "reserved";
    entry.orderId = orderId;
    const record: DeliveryRecord = {
      orderId,
      productId,
      commitment: entry.commitment,
      evidenceHash: sha256Hex(`mock-ciphertext:${entry.commitment}:${orderId}`),
      buyer,
      ciphertext: "mock-ciphertext",
      deliveryKey: "mock-key",
      createdAt: new Date().toISOString(),
      finalized: false,
    };
    this.deliveries.set(orderId, record);
    return { orderId, productId, commitment: entry.commitment, evidenceHash: record.evidenceHash };
  }

  async finalizeDelivery(orderId: number): Promise<void> {
    const record = this.deliveries.get(orderId);
    if (!record) throw new Error(`no prepared delivery for order ${orderId}`);
    record.finalized = true;
    const entry = (this.inventory.get(record.productId) ?? []).find(
      (e) => e.commitment === record.commitment && e.state === "reserved",
    );
    if (entry) entry.state = "delivered";
  }

  async releaseDelivery(orderId: number): Promise<void> {
    const record = this.deliveries.get(orderId);
    if (!record || record.finalized) return;
    const entry = (this.inventory.get(record.productId) ?? []).find(
      (e) => e.commitment === record.commitment && e.state === "reserved",
    );
    if (entry) {
      entry.state = "available";
      entry.orderId = null;
    }
    this.deliveries.delete(orderId);
  }

  async reservedDeliveries(): Promise<DeliveryRecord[]> {
    return [...this.deliveries.values()].filter((d) => !d.finalized);
  }

  async getDelivery(orderId: number): Promise<DeliveryRecord | null> {
    return this.deliveries.get(orderId) ?? null;
  }

  async addRefundRequest(req: Omit<RefundRequest, "outcome">): Promise<void> {
    if (this.refunds.some((r) => r.requestId === req.requestId)) {
      throw new Error(`duplicate refund request id ${req.requestId}`);
    }
    this.refunds.push({ ...req, outcome: null });
  }

  async pendingRefundRequests(): Promise<RefundRequest[]> {
    return this.refunds.filter((r) => r.outcome === null).map((r) => ({ ...r }));
  }

  async resolveRefundRequest(requestId: string, outcome: RefundOutcome): Promise<void> {
    const req = this.refunds.find((r) => r.requestId === requestId);
    if (!req) throw new Error(`unknown refund request ${requestId}`);
    req.outcome = { ...outcome, at: new Date().toISOString() };
  }
}

/**
 * Clearly-fake demo inventory. Every code carries the unmistakable TEST
 * marker; these codes are worthless by construction and are the ONLY
 * plaintext codes anywhere in this project. `licence-pro` matches the
 * Stage 1 deployment battery in scripts/claim-named-account.md exactly.
 */
export const DEMO_INVENTORY: Record<string, string[]> = {
  "licence-pro": ["BOUNDEN-TEST-LICENCE-0001", "BOUNDEN-TEST-LICENCE-0002", "BOUNDEN-TEST-LICENCE-0003"],
  "api-credits-pack": ["BOUNDEN-TEST-CREDIT-0001", "BOUNDEN-TEST-CREDIT-0002"],
};
