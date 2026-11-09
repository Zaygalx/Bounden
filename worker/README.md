# Bounden cashier worker

The agent that runs the shop — and the whole point of Bounden. It holds
**one** NEAR access key: a function-call key allowlisted to exactly two
methods on the shop contract, `fulfil_order` and `issue_refund`, with a
0.25 NEAR gas allowance. That key is the entirety of its on-chain power.

## The leash, in three layers

1. **Protocol layer (on-chain, publicly inspectable).** The key's
   permission object names the contract and the two methods. NEAR
   rejects any other use of this key during transaction validation —
   before any contract code runs. Anyone can read the object with
   `view_access_key` and verify it. This is the constitution evidence.
2. **Process layer (this package).** Every signed call goes through
   `LeashedChainClient` (`src/chain.ts`), which throws
   `LeashViolationError` for any method outside the allowlist before
   any network traffic. The worker's code contains no call site — and
   no string — for any treasury-moving method; a unit test greps the
   source to keep it that way.
3. **Contract layer.** `fulfil_order` / `issue_refund` check the caller
   is the registered agent, enforce the order state machine, and
   enforce the refund band (cap + window). Refund destinations are the
   buyer of record, chosen by the contract. The treasury method is
   owner-only with the destination hard-coded — no parameter exists to
   redirect.

The worker also **verifies the leash at startup**: it reads its own
key's permission object and the contract's registered agent, and exits
if either doesn't match the constitution it expects.

## What it does each poll cycle

1. Reconciles vault delivery reservations left by a crash (finalize if
   the order landed Fulfilled on-chain, release otherwise).
2. Discovers orders by probing sequential ids via `get_order` (the
   contract has no list view; ids are sequential, so probing to the
   first null is exact).
3. Fulfils every `Paid` order: the vault prepares a sealed delivery
   (the worker process never sees the plaintext code — see
   `src/vault.ts`), the attestation provider is asked for a judgement
   hash, `fulfil_order` is called, the delivery is finalized.
4. Processes refund requests recorded in the vault: reads the order and
   constitution, **pre-checks the band locally** (state, cap, window)
   and refuses locally with a logged reason when outside it — no gas
   burned on calls the contract would park as `RefundRejected`.
   In-band: `issue_refund` with exactly 1 yocto attached (the contract
   asserts it, for the token's `ft_transfer`).

Order records are treated as **data, never instructions**. Free-text
fields are not read. A unit test feeds the worker an order whose note
orders a treasury drain and asserts the only signed call in the cycle
is that order's own fulfilment.

## Configuration (env only — paths, never secret values)

See `.env.example`. Keys and the vault live in
`~/workspace/bounden-secrets/` (outside the repo). All logging passes
through a redactor (`src/redact.ts`): private keys and inventory codes
cannot reach a log line.

| Variable | Meaning |
|---|---|
| `BOUNDEN_CONTRACT_ACCOUNT_ID` | Shop contract account |
| `BOUNDEN_AGENT_ACCOUNT_ID` | Registered agent account |
| `BOUNDEN_AGENT_KEY_FILE` | Leashed keypair credential (vault path) |
| `BOUNDEN_VAULT_DIR` | Vault root (worker vault in `<dir>/worker-vault`) |
| `BOUNDEN_VAULT_KEY_FILE` | 32-byte vault encryption key file |
| `NEAR_RPC_URL` | Default `https://rpc.testnet.near.org` |
| `BOUNDEN_POLL_INTERVAL_MS` | Default 15000 |
| `BOUNDEN_SCAN_LIMIT` | Max order ids probed per cycle, default 10000 |

## Commands

```bash
npm install
npm run typecheck
npm test            # 30 unit tests, all chain access mocked
npm run build

# 1. Seal demo inventory into the vault + print on-chain commitments
BOUNDEN_VAULT_DIR=~/workspace/bounden-secrets npm run seed-demo-vault

# 2. Derive agent keys (dry run), create the agent account with the
#    printed full-access public key, then run live to register + leash:
BOUNDEN_CONTRACT_ACCOUNT_ID=bounden.testnet \
BOUNDEN_AGENT_ACCOUNT_ID=cashier.bounden.testnet \
BOUNDEN_VAULT_DIR=~/workspace/bounden-secrets \
npm run create-leashed-key -- --dry-run
#    ... create/fund the agent account (scripts/claim-named-account.md) ...
BOUNDEN_OWNER_ACCOUNT_ID=<owner> BOUNDEN_OWNER_KEY_FILE=<vault owner key> \
  npm run create-leashed-key

# 3. Run the cashier (env per .env.example)
npm start
```

## The vault and delivery semantics

- Codes are stored **AES-256-GCM encrypted** in
  `<vault>/worker-vault/vault-state.json` (mode 0600). On-chain there
  are only SHA-256 commitments.
- FIFO is load-bearing: the contract consumes its first unconsumed
  commitment; the vault hands out codes in the order their commitments
  were registered. `seed-demo-vault` prints commitments in that order.
- Fulfilment packages the code under a fresh per-order key; only
  `SHA-256(ciphertext)` goes on-chain as the delivery evidence hash.
  The buyer verifies: hash of their received code == the commitment the
  chain consumed for their order.
- **Demo limitation, stated plainly:** the per-order delivery key is
  stored in the vault's delivery record, because there is no buyer key
  infrastructure yet. The production form encrypts to the buyer's
  ephemeral public key so the worker cannot decrypt a delivered code;
  that lands with the storefront (Stage 3). The thesis invariant — no
  plaintext on-chain, codes encrypted at rest, worker holds no
  plaintext — already holds.
- Production inventory rule: codes must be **high-entropy**. A bare
  SHA-256 commitment of a guessable code is brute-forceable. Demo codes
  are guessable *and worthless*; that is the point of the TEST marker.

## Attestation seam (Stage 3)

`src/attestation.ts` defines `AttestationProvider`. Stage 2 ships
`NullAttestationProvider` (default: no hash stored — the absence is
honest and visible on-chain) and a clearly-labelled local-hash dev
provider (prefix `local-sha256:`, **not** a TEE attestation).

Stage 3 adds the real provider behind the same interface:
`NearAiCloudAttestationProvider` (`src/ai-cloud-attestation.ts` +
`src/ai-cloud.ts`), selected with `BOUNDEN_ATTESTATION_PROVIDER=near-ai`
(default stays `null`, so Stage 2 behaviour is unchanged unless the
operator opts in). Env: `NEAR_AI_CLOUD_API_KEY`,
`NEAR_AI_CLOUD_MODEL`, `NEAR_AI_CLOUD_BASE_URL` (default
`https://cloud-api.near.ai/v1`) — values from the environment only,
never logged.

- For each fulfil/refund decision the provider asks NEAR AI Cloud for
  a structured judgement (approve / refuse / escalate) built from
  facts only — the payload is constructed in ONE function from a
  whitelist (kind, order id, product id, amount, buyer history
  summary). Inventory codes, keys, and even the buyer account id never
  reach the model; the account is bound into the local request hash
  instead. A unit test plants code-shaped strings in extra fields and
  asserts they cannot leak.
- Approve → the model's attestation report is fetched and the
  on-chain hash is computed as SHA-256 over the canonicalised
  {model, requestHash, response, attestationReport}, stored as
  `near-ai:<hex>`.
- Refuse / escalate / malformed output → the provider throws
  `JudgementNotApprovedError`; the worker makes NO on-chain call and
  the order keeps its state for owner review. Malformed output
  escalates — it never approves. Outcomes are cached per request hash
  so polling never re-asks (or re-bills) the same question.
- No API key (or no model id) → the provider is DISABLED: it logs
  loudly and returns null (null-provider behaviour). It never
  fabricates a hash.
- **Verified-live (9 Nov 2026):** the attestation report's real
  shape has been captured from the live API and the parser narrowed
  to it — the model binding lives in a `model_attestations` entry
  whose `quote_b64` / `gpu_evidence` are the evidence, and anything
  unrecognised still fails closed with a typed `AiCloudShapeError`.
  The attestation fixture is a redacted real capture
  (`test/fixtures/README.md`). Chat completions are VERIFIED-LIVE
  too (later on 9 Nov 2026, after the Builders credit landed on the
  key): two real judgement completions are captured as fixtures —
  in-band refund → approve, out-of-band refund → refuse — and the
  provider tests run against them. The synthetic completion fixture
  stays doc-derived for the variants the live model was not asked
  to produce.

## Status

Built and unit-tested locally (30/30). The live end-to-end pass —
account creation, leash setup on testnet, a real paid order fulfilled
by the leashed key — waits on the testnet account funding described in
`docs/PREFLIGHT.md` §7. Nothing here has touched a live chain yet,
except read-only startup probes.
