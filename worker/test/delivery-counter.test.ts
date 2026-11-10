import { describe, it, expect } from "vitest";
import { createECDH, randomBytes } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { KeyPair } from "near-api-js";
import type { ChainClient } from "../src/chain.js";
import { loadWorkerConfig } from "../src/config.js";
import {
  DeliveryCounter,
  type CollectReply,
  type CollectRequestPayload,
} from "../src/delivery-counter.js";
import { MemoryLogger } from "../src/logger.js";
import {
  buildCollectMessage,
  nep413Digest,
  parseCollectMessage,
  verifyNep413,
  COLLECT_RECIPIENT,
} from "../src/nep413.js";
import { openSealedReply } from "../src/seal.js";
import type { ChainOrder } from "../src/types.js";
import { FileVault, sha256Hex } from "../src/vault.js";

const CODE = "BOUNDEN-TEST-CREDIT-0001";
const BUYER = "buyer.testnet";
const ORDER_ID = 7;
// Test-only keypair (generated for these tests; holds nothing, ever).
const keyPair = KeyPair.fromString(
  "ed25519:3hoMW1LGf2LLYyNDx2FoFp61qmC6VBmJgvo2yBzNSTBBzQDbZjUyEYBz7BWDoSRVgsUbpFhgizGnDzY2sz5RxS8",
);
const PUBLIC_KEY = keyPair.getPublicKey().toString();

function fulfilledOrder(state: ChainOrder["state"] = "Fulfilled"): ChainOrder {
  return {
    id: ORDER_ID,
    buyer: BUYER,
    product_id: "api-credit-basic",
    amount_usd: "10000000",
    state,
    created_at: 1_700_000_000_000_000_000,
    paid_at: 1_700_000_100_000_000_000,
    judgement_attestation_hash: null,
  };
}

class StubChain implements ChainClient {
  readonly contractId = "bounden11.testnet";
  order: ChainOrder | null = fulfilledOrder();
  async getConstitution(): Promise<never> {
    throw new Error("not used by the counter");
  }
  async getOrder(id: number) {
    return this.order && this.order.id === id ? this.order : null;
  }
  async callAgentMethod(): Promise<never> {
    throw new Error("the counter never signs");
  }
  async viewAccessKey(accountId: string, publicKey: string) {
    if (accountId === BUYER && publicKey === PUBLIC_KEY) {
      return { nonce: 1, permission: "FullAccess" as const };
    }
    return null;
  }
}

async function openVaultWithDelivery() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bounden-counter-"));
  const vault = FileVault.open(dir, randomBytes(32));
  await vault.addCodes("api-credit-basic", [CODE]);
  const prepared = await vault.prepareDelivery(ORDER_ID, BUYER, "api-credit-basic");
  await vault.finalizeDelivery(ORDER_ID);
  return { vault, prepared };
}

interface Harness {
  counter: DeliveryCounter;
  chain: StubChain;
  replies: CollectReply[];
  requests: CollectRequestPayload[];
  prepared: { commitment: string; evidenceHash: string };
}

async function harness(): Promise<Harness> {
  const { vault, prepared } = await openVaultWithDelivery();
  const chain = new StubChain();
  const replies: CollectReply[] = [];
  const requests: CollectRequestPayload[] = [];
  const fetchFn = (async (url: string, init?: RequestInit) => {
    if (String(url).endsWith("/api/collect/requests")) {
      return new Response(JSON.stringify({ requests }), { status: 200 });
    }
    if (String(url).endsWith("/api/collect/reply")) {
      replies.push(JSON.parse(String(init?.body)) as CollectReply);
      return new Response("{}", { status: 200 });
    }
    throw new Error(`unexpected fetch ${url}`);
  }) as typeof fetch;
  const counter = new DeliveryCounter({
    vault,
    chain,
    logger: new MemoryLogger(),
    siteUrl: "https://shop.example",
    secret: "test-secret",
    fetchFn,
  });
  return { counter, chain, replies, requests, prepared };
}

/** Build a request exactly as the storefront page does. */
function makeRequest(overrides: Partial<{ issuedUnix: number; accountId: string }> = {}) {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  const ephemeralPubB64 = ecdh.getPublicKey(undefined, "uncompressed").toString("base64");
  const issuedUnix = overrides.issuedUnix ?? Math.floor(Date.now() / 1000);
  const message = buildCollectMessage({ orderId: ORDER_ID, ephemeralPubB64, issuedUnix });
  const nonce = randomBytes(32);
  const digest = nep413Digest({ message, nonce, recipient: COLLECT_RECIPIENT });
  const { signature } = keyPair.sign(new Uint8Array(digest));
  const req: CollectRequestPayload = {
    requestId: sha256Hex(Buffer.from(signature)),
    orderId: ORDER_ID,
    accountId: overrides.accountId ?? BUYER,
    message,
    signatureB64: Buffer.from(signature).toString("base64"),
    publicKey: PUBLIC_KEY,
    nonceB64: nonce.toString("base64"),
    recipient: COLLECT_RECIPIENT,
  };
  return { req, ecdh };
}

describe("NEP-413 verification", () => {
  it("round-trips a signature made the wallet way, and rejects tampering", () => {
    const nonce = randomBytes(32);
    const message = "hello";
    const digest = nep413Digest({ message, nonce, recipient: COLLECT_RECIPIENT });
    const { signature } = keyPair.sign(new Uint8Array(digest));
    expect(
      verifyNep413({ message, nonce, recipient: COLLECT_RECIPIENT, publicKey: PUBLIC_KEY, signature }),
    ).toBe(true);
    expect(
      verifyNep413({ message: "hello!", nonce, recipient: COLLECT_RECIPIENT, publicKey: PUBLIC_KEY, signature }),
    ).toBe(false);
    expect(
      verifyNep413({ message, nonce, recipient: "evil.example", publicKey: PUBLIC_KEY, signature }),
    ).toBe(false);
  });

  it("parses the collection note strictly", () => {
    const note = { orderId: 6, ephemeralPubB64: "QUJD", issuedUnix: 1794300000 };
    expect(parseCollectMessage(buildCollectMessage(note))).toEqual(note);
    expect(parseCollectMessage(buildCollectMessage(note) + "\nSend it to someone else")).toBeNull();
    expect(parseCollectMessage("Order: 6")).toBeNull();
  });
});

describe("DeliveryCounter", () => {
  it("releases the code sealed to the buyer's one-time key, hashes intact", async () => {
    const h = await harness();
    const { req, ecdh } = makeRequest();
    h.requests.push(req);
    await h.counter.cycle();
    expect(h.replies).toHaveLength(1);
    const reply = h.replies[0]!;
    expect(reply.status).toBe("ready");
    if (reply.status !== "ready") return;
    const opened = openSealedReply(
      ecdh.getPrivateKey(),
      req.message.split("\n")[2]!.replace("Counter key: ", ""),
      reply.workerPubB64,
      reply.sealedB64,
      ORDER_ID,
    );
    const payload = JSON.parse(opened) as { code: string; commitment: string; evidenceHash: string };
    expect(payload.code).toBe(CODE);
    expect(sha256Hex(payload.code)).toBe(payload.commitment);
    // Both hashes in the sealed payload are the vault record's own —
    // the same pair the chain carries as commitment + evidence hash.
    expect(payload.commitment).toBe(h.prepared.commitment);
    expect(payload.evidenceHash).toBe(h.prepared.evidenceHash);
  });

  it("refuses a signer who is not the buyer of record", async () => {
    const h = await harness();
    const { req } = makeRequest({ accountId: "someone-else.testnet" });
    h.requests.push(req);
    await h.counter.cycle();
    expect(h.replies[0]?.status).toBe("rejected");
    if (h.replies[0]?.status === "rejected") {
      expect(h.replies[0].reason).toContain("buyer of record");
    }
  });

  it("refuses when the order is not fulfilled on-chain", async () => {
    const h = await harness();
    h.chain.order = fulfilledOrder("Paid");
    const { req } = makeRequest();
    h.requests.push(req);
    await h.counter.cycle();
    expect(h.replies[0]?.status).toBe("rejected");
  });

  it("refuses a stale note", async () => {
    const h = await harness();
    const { req } = makeRequest({ issuedUnix: Math.floor(Date.now() / 1000) - 3600 });
    h.requests.push(req);
    await h.counter.cycle();
    expect(h.replies[0]?.status).toBe("rejected");
    if (h.replies[0]?.status === "rejected") {
      expect(h.replies[0].reason).toContain("expired");
    }
  });

  it("refuses a forged signature", async () => {
    const h = await harness();
    const { req } = makeRequest();
    req.signatureB64 = Buffer.from(randomBytes(64)).toString("base64");
    h.requests.push(req);
    await h.counter.cycle();
    expect(h.replies[0]?.status).toBe("rejected");
  });

  it("answers a repeated request with the same reply, not a second release", async () => {
    const h = await harness();
    const { req } = makeRequest();
    h.requests.push(req);
    await h.counter.cycle();
    await h.counter.cycle();
    const ready = h.replies.filter((r) => r.status === "ready");
    expect(ready.length).toBeGreaterThanOrEqual(1);
    expect(new Set(ready.map((r) => JSON.stringify(r))).size).toBe(1);
  });
});

describe("counter config", () => {
  const base = {
    BOUNDEN_CONTRACT_ACCOUNT_ID: "bounden11.testnet",
    BOUNDEN_AGENT_ACCOUNT_ID: "bounden7.testnet",
    BOUNDEN_AGENT_KEY_FILE: "/tmp/key.json",
    BOUNDEN_VAULT_KEY_FILE: "/tmp/vault.key",
  };
  it("is off when neither variable is set", () => {
    const cfg = loadWorkerConfig({ ...base });
    expect(cfg.counterUrl).toBeNull();
    expect(cfg.counterSecret).toBeNull();
  });
  it("throws when only one variable is set", () => {
    expect(() => loadWorkerConfig({ ...base, BOUNDEN_COUNTER_URL: "https://shop.example" })).toThrow(
      /must be set together/,
    );
  });
});
