# Bounden

**The agent is bound. The money is not.**

Bounden is a digital-goods shop run by an autonomous agent that is
*structurally incapable of theft*. The cashier's entire on-chain
authority is two contract methods — `fulfil_order` and `issue_refund` —
exercised through an allowlisted function-call access key. It cannot
move the treasury, change prices beyond the contract's band, pay anyone
who is not a customer of record, or refund outside the policy the owner
wrote into the contract. Not "won't". **Can't** — and anyone can verify
that, because every power the agent holds is a public on-chain object.

## Why this exists

Every agent-run business demo gives the agent a wallet and asks you to
trust its prompts. Bounden inverts that: the *agent itself* is the
constrained party. The shop's constitution — catalogue, price band,
refund band, treasury rules — lives in a NEAR smart contract. The
agent's judgements (via NEAR AI Cloud TEE inference) are recorded
on-chain with their attestation hashes. Its inventory is sealed:
on-chain you will find only hashes, never a usable code.

## Status at a glance

**DONE and verified locally** (commands below — run them and see):

- Stage 1 shop contract: full constitution implemented, **23 unit
  tests passing**, release wasm builds (~332 KB), including the
  1-yocto outbound-transfer fix with a negative-control regression
  test (`NOTES.md`).
- Stage 2 cashier worker: **51 unit tests passing** (30 worker/leash/
  vault + 21 NEAR AI Cloud judgement layer), strict typecheck, the
  three-layer leash, AES-256-GCM sealed-inventory vault.
- Attack suite v1: five named cases, mock mode runs today and prints
  the expected refusal for each.
- Storefront: builds and runs in fixture mode (labelled as such in
  the UI) — catalogue, checkout explainer, order status, the public
  Constitution page.

**DONE LIVE on testnet** (Stage 2 live pass, Mon 9 Nov 2026 — full
log in `NOTES.md`, attack results in `attacks/README.md`):

- Contract deployed + initialised on **`bounden8.testnet`** (deploy
  tx `DR3DFNHDi6Gt3hKfFowmv2hde4zfhrEe5d65dwvtZnTd`; wasm code hash
  `3fgkfyQED4KbVkU13d1HdXxNmngXk2GGvA9ApvVq85Ur`). Constitution
  read back on-chain: owner = the owner implicit account,
  `payment_token` = `usdc.testnet`, price band 1000 bps, refund cap
  50_000_000 ($50), refund window 3_600_000_000_000 ns (1 hour).
- Product `licence-pro` live at $25.00 with 3 sealed inventory
  commitments (SHA-256 hashes only) registered on-chain.
- The cashier's leash is on-chain: agent `bounden7.testnet`
  registered with pinned worker code hash
  `5ed7fe92550867937ce8aef6e838594b8ea2ed2ec205a9d4fe28387786c23c2a`;
  its function-call key permits exactly `fulfil_order` +
  `issue_refund` on the contract with a 0.25 NEAR allowance
  (register tx `7cfJ1Dm4ZtowcRc2mXejJDqmqA4jLjxCmoef3Gmqdjeq`,
  add-key tx `Az6B7yuyuEuzDre71ojcbbVukgGJbVCsB3CDVmDD93Cw`).
  (Substitution, documented in `NOTES.md`: the agent is a fresh
  named account Muse controls, not `cashier.bounden.testnet` —
  creating a subaccount of the user's `bounden.testnet` needs the
  user's own key, which Muse does not hold. The constitution cares
  about the permission object, not the account's name.)
- Attack suite run live: the price band refused an owner-signed
  +20% reprice on-chain and accepted in-band moves; leash-key
  attempts at a token transfer, a treasury withdrawal, and an
  inventory write never landed (protocol key validation).

**PENDING** (nothing below is claimed until it is verifiable
on-chain):

- A real order fulfilled end-to-end and the refund approve/refuse
  paths — blocked on testnet USDC: Circle's faucet covers NEAR
  Testnet but is a human, reCAPTCHA-gated web flow, and no
  programmatic route was found (full probe log in `NOTES.md`).
  One human faucet claim to the buyer account unblocks the rest.
- NEAR AI Cloud attestation verified against the live API —
  DONE 9 Nov 2026 for the attestation report (redacted real capture
  in `worker/test/fixtures/`, parser narrowed to the observed live
  shape). Still open: one live chat completion — inference on the
  account is gated on credits (402 until a spending limit or the
  $10 Builders credit is set up in the dashboard).
- The demo film (<60s, `docs/FILM.md`), the X demo post, and the
  submission itself (`docs/SUBMISSION.md`).
- Stage 4 (Shade Agent / TEE): spiked and designed, **not shipped** —
  see the Stage 4 status section below.

## Verify it yourself (do X, see Y)

Prerequisites: Rust (stable, with the `wasm32-unknown-unknown`
target) and Node ≥ 22. On machines with a small `/tmp`, first run
`export TMPDIR=$HOME/.tmp` (near-sdk's native build scripts fill a
512 MB tmpfs — see `NOTES.md`).

1. **Contract tests.** From the repo root:
   `cargo test`
   → *See:* 23 passed, 0 failed — including the price band binding
   the owner, exact-amount payment enforcement, refund band
   behaviour, and the 1-yocto transfer-deposit guard.
   Release build: `cargo build --target wasm32-unknown-unknown --release`.
2. **Worker tests.** `cd worker && npm install && npm test`
   → *See:* 51 passed — the runtime allowlist guard refusing
   non-allowlisted methods before any network traffic, a source-grep
   test proving no treasury-moving call exists in the worker,
   fulfil-exactly-once, refund band pre-checks, vault sealing, and
   the judgement layer's fail-closed parsing.
   Typecheck: `npm run typecheck`.
3. **Storefront in fixture mode.** `cd web && npm install && npm run build && npm start`,
   then open http://localhost:3000
   → *See:* the catalogue, a product page, the checkout explainer
   (payment is a buyer wallet action — the cashier never touches
   it), `/orders/0`, and `/constitution` rendering the constitution
   and the agent key's permission object — all under a visible
   FIXTURE MODE banner, because no contract is configured.
4. **Attack suite in mock mode.** `cd attacks && npm install && npm run build && npm start`
   → *See:* five named cases (treasury drain via prompt injection,
   out-of-band refund, payout redirect, inventory dump, price-band
   violation), each printing the layer that must refuse it and the
   expected rejection. Mock output is rehearsal, labelled as such;
   it is not evidence.
5. **What needs the live testnet deployment** (and where the steps
   live): deploying + initialising the contract, creating the
   leashed key on-chain, seeding the demo vault, registering the
   inventory commitments, one real paid order fulfilled by the
   leashed key, the live attack run, and the film. The exact
   sequence is `scripts/claim-named-account.md` (Paths A–C) plus the
   Stage 2/3 live-pass checklists in `NOTES.md`; the funding blocker
   and its evidence are in `docs/PREFLIGHT.md` §7.

## What it sells

Global digital goods, priced in USD, settled in a stablecoin:

- Software licence keys
- API credit codes
- Downloadable assets

Bounden is a **template**: an open constitution + storefront that any
agent-run digital-goods business can adopt.

## Architecture (summary)

| Layer | What it does |
|---|---|
| Shop contract (NEAR, Rust) | The constitution: catalogue, order state machine, price/refund bands, owner-only treasury, agent registry |
| Cashier (agent worker) | Holds one allowlisted function-call key; fulfils orders and in-band refunds; the only decryptor of sealed inventory |
| NEAR AI Cloud | Order/refund judgements inside a TEE; attestation hash logged on-chain per decision |
| Storefront | Catalogue, checkout, order status, and a public Constitution page listing the agent's powers |

Full plan: [docs/PLAN.md](docs/PLAN.md) · Pre-flight evidence:
[docs/PREFLIGHT.md](docs/PREFLIGHT.md) · Downloads design:
[docs/DOWNLOADS.md](docs/DOWNLOADS.md) · Stage 4 (Shade) spike:
[docs/SHADE.md](docs/SHADE.md) · Demo film script:
[docs/FILM.md](docs/FILM.md) · Submission pack:
[docs/SUBMISSION.md](docs/SUBMISSION.md) · Build notes:
[NOTES.md](NOTES.md)

## Status

**Stage 1 contract implemented and verified locally** (23 unit tests
passing; release wasm builds at ~332 KB). Not yet deployed — deployment
waits for the `bounden.testnet` account claim (see docs/PREFLIGHT.md).

**Stage 2 worker pre-built and verified locally** (`worker/`, 30 unit
tests passing, all chain access mocked): the leashed cashier with its
runtime allowlist guard, the `create-leashed-key` setup procedure,
the AES-256-GCM sealed-inventory vault, local refund-band pre-checks,
and the Stage 3 attestation seam. **Attack suite v1** (`attacks/`)
ships the five named cases with mock mode runnable now. The live
end-to-end pass — real testnet deployment, leash setup on-chain, a
paid order fulfilled by the leashed key — is pending the same account
funding as Stage 1 deployment. Nothing in Stage 2 has touched a live
chain yet beyond read-only probes; the worker daemon refuses to start
against a contract where its leash is not verifiably in place.

**Stage 3 pre-built locally** (judgement layer + storefront, against
fixtures — nothing live yet). The worker's attestation seam now has a
real NEAR AI Cloud provider (`worker/src/ai-cloud.ts`,
`worker/src/ai-cloud-attestation.ts`, selected with
`BOUNDEN_ATTESTATION_PROVIDER=near-ai`): TEE judgements
(approve/refuse/escalate) for fulfil/refund decisions, with a
deterministic attestation hash — SHA-256 over the canonicalised
{model, request hash, model response, attestation report} — stored
on-chain as `near-ai:<hex>`. It fails closed: malformed model output
escalates and never approves, a non-approval blocks the on-chain call,
and with no API key the provider refuses loudly rather than
fabricating a hash. 22 new unit tests (52 worker tests total, all
passing, all network access faked). **Attestation shape VERIFIED-LIVE
9 Nov 2026:** the live report binds the model inside a
`model_attestations` array (not the flat shape the docs suggested);
the fixture is now a redacted real capture and the parser was
narrowed to the observed shape, still failing closed on anything
unrecognised (`worker/test/fixtures/README.md`). The chat-completion
fixture remains doc-derived: live inference is gated on account
credits (402 on 9 Nov 2026), so one real completion capture is still
owed once credits are set up. The **storefront** (`web/`, Next.js)
builds and demos today in fixture mode: catalogue, product pages, a
checkout explainer (payment is a wallet action — the cashier never
touches it), order status, the public Constitution page rendering the
constitution and the agent key's permission object, and "How
inventory stays secret on a public chain". With a contract
configured it reads live state over NEAR RPC view calls; a failed
live read falls back to fixture data and says so. Downloadable-asset
delivery (signed, expiring, one-time links bound to the fulfilment
record) is designed in `docs/DOWNLOADS.md` — design only, no server
implemented yet.

Honest limits right now:

- Testnet only. Mainnet is out of scope for this build; a dust-value
  mainnet settlement may be added later strictly as stretch evidence.
- Checkout settles on NEAR in the testnet stablecoin (`usdc.testnet`).
  NEAR Intents is mainnet-only, so it appears as a `dry: true` price
  proof, never as the settlement rail.
- Demo inventory is **clearly fake** (test-marked codes) — see the plan.
- The Shade Agent (TEE) worker is a later, time-boxed stage; the
  security thesis rests on the key allowlist + contract, not on the TEE.
- **Stage 4 has been spiked, not built** (`docs/SHADE.md`): the design
  is ready and the verdict is RISKY — the framework's standalone
  tooling stopped being maintained in April 2026, and its deploy path
  needs a Docker-capable host this build does not have. Nothing in
  Stage 4 has been deployed or registered; the adapter sketch in
  `shade/` is marked scaffold and is not wired to anything. The
  Stage 4 status section below carries the pre-written fallback
  wording from `docs/SHADE.md` §2.7 — verbatim, not improvised.

## Stage 4 status

<!-- STAGE4-STATUS:BEGIN — source: docs/SHADE.md §2.7, verbatim. Swap procedure: docs/SUBMISSION.md, "Stage 4 status". -->
> 
<!-- STAGE4-STATUS:END -->

## Licence

MIT
