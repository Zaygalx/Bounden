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
  tests passing**, release wasm builds (~340 KB), including the
  1-yocto outbound-transfer fix with a negative-control regression
  test (`NOTES.md`).
- Stage 2 cashier worker: **57 unit tests passing** (worker/leash/
  vault plus the NEAR AI Cloud judgement layer, including
  VERIFIED-LIVE fixtures captured from the real API), strict
  typecheck, the three-layer leash, AES-256-GCM sealed-inventory
  vault.
- Attack suite v1: five named cases, mock mode runs today and prints
  the expected refusal for each.
- Storefront: builds and runs in fixture mode (labelled as such in
  the UI) — catalogue, checkout explainer, order status, the public
  Constitution page.

**DONE LIVE on testnet** (Stage 2 live passes, Mon 9 Nov 2026 —
full log in `NOTES.md`, attack results in `attacks/README.md`):

**The live shop is `bounden11.testnet`** (v3, deployed 9 Nov
2026) — the redeploy carrying both live-found fixes, with the
full money sequence and all five attack cases run against it:

- Deploy + init tx `525VXugqsLgJQ9Y4UdRnNNqxabvejLQ7uKEixvTU1aaH`;
  wasm code hash `DCgiAv1ET5gtVBUqkLsHR5MuTvsqWXBZMHuFhAgDWdcK`.
  Constitution read back and **asserted in code**: payment token
  = Circle's NEAR testnet USDC
  (`3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af`),
  price band 1000 bps, refund cap 50_000_000 ($50), and
  **refund_window_ns == 3600000000000 (1 hour) by integer
  equality** — the v2 window slip is fixed and numerically
  verified this time.
- Product `licence-pro` live at $25.00 with 3 sealed inventory
  commitments; the cashier's leash v3 key
  `ed25519:8ixy4dmqQkoyx493d1Fa6yVLAr6HjQMCideisgcCTws4` permits
  exactly `fulfil_order` + `issue_refund` on bounden11 with a
  0.25 NEAR allowance (worker code hash pinned on-chain at
  deploy: `4d6f7186039c366c86b71c412b5c5c658221688d9dded98c5fdad35997a828f3`
  — superseded by the Stage 3 fix re-pin below:
  `7a5ceb1252d6952f9d36378691247e3f1630e54a0e2dbca17079e6d1f85338ac`);
  the worker's startup self-check verifies the permission
  object before it will run.
- **The leash refund proof v2 could not produce**: order 0 was
  created, paid $25.00 (its payment memo carrying a
  treasury-drain prompt injection, which produced zero extra
  signed calls), fulfilled by the leashed cashier (tx
  `7Cgeqi3vCuVPhboyWqstsEiWTw45hRmKKcqFEenYwQmv`), then
  **refunded in-band by the leash key itself at zero deposit**
  (tx `6iN5SFJjsxCEzfNqcnicj41KVnCYfYax3v5ktm5nc1NR` — the
  tx's signer public key IS the leash key; buyer restored to
  exactly 40 USDC, contract to 0).
- Order 1 was fulfilled by the leash (tx
  `ATGRLknsapjZd1X52dcLbCQHVjmxTxgar84DqVPuAiJH`), and its
  refund was attempted after the 1-hour band closed: the
  worker refused locally with no chain call, and a direct
  leash-signed `issue_refund` (tx
  `EeFLYzZ3JLFj1widHVARnLT4HmZ1EPCTHogvgAFmxJZM`) parked the
  order in **RefundRejected** with the
  `bounden_refund_rejected` event and no token movement. All
  five attack cases are closed on this deployment
  (`attacks/README.md`); a dump of every public view contains
  zero usable codes.
- USDC accounting at supersession: bounden10's 25 USDC
  treasury was withdrawn to the owner (tx
  `H3gXr3ZaXP8kAdrDu2GRNgNkiiJ1scmNpFPomK6VZyeD`) and
  redeployed as the buyer's v3 float. Final v3 balances:
  buyer 15 USDC, bounden11 treasury 25 USDC (order 1's kept
  payment), owner 0, bounden10 0.
- **Stage 3 caveat, measured and recorded in `NOTES.md`**: the
  on-chain run with the NEAR AI judgement layer active was
  attempted through a loopback credential bridge
  (`scripts/near_ai_bridge.py`; the key never touched disk).
  DeepSeek-V3.2 escalated or refused every live decision on
  factually wrong grounds (the amount DOES match the product
  price); a control probe isolates the cause — the shipped
  worker never populates the buyer-history summary the seam
  was designed around, and with that field set the identical
  request approves. The v3 orders were therefore fulfilled
  under the worker's null attestation provider (its documented
  Stage 2 mode) and carry `attestation_hash: null` on-chain.
  No `near-ai:` hash is claimed for any live order.
  **Fix run, later the same day**: the worker now populates
  the summary from its own chain scan (commit `e00c1bb`,
  regression-tested, suite 61/61) and was re-pinned on-chain
  (`set_agent` tx `F6ZRCpbpBux2awkMAzV2zJ5Vvqt6nwYFsrYjxfc81qte`,
  pinned hash `7a5ceb12…`; startup self-check passes). The
  pre-money probe then used the fixed worker's OWN derived
  summary for the next real order — "2 prior orders:
  1 refunded, 1 refund-rejected." — and the model escalated
  in 6 of 6 draws, citing the refund history. The pass
  stopped at the probe by its own rules: no order created,
  no money moved, no prompt tuned, no rosier history
  substituted. The gate now judges on true facts; it simply
  does not approve this buyer, and under the constitution an
  escalation means the cashier does not act. Still no
  `near-ai:` hash exists on any live order — full evidence
  in `NOTES.md`, "Stage 3 judgement-gate fix".

The v2 record follows — **`bounden10.testnet` is SUPERSEDED**
(its order 1 remains `Paid` there against a withdrawn
treasury; see `NOTES.md`):

- Contract deployed + initialised on **`bounden10.testnet`**
  (deploy tx `4rSmanAZugekHBkvcRiZtRPPxeJHqs1U8EwnJwWNwwis`; wasm
  code hash `3fgkfyQED4KbVkU13d1HdXxNmngXk2GGvA9ApvVq85Ur`).
  Constitution read back on-chain: owner = the owner implicit
  account, `payment_token` = Circle's actual NEAR testnet USDC,
  **`3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af`**
  (the address Circle's own developer docs list for NEAR Testnet;
  pre-flight had picked the same-name `usdc.testnet`, a different
  token the faucet does not dispense — the first deployment,
  `bounden8.testnet`, is superseded and deleted, its evidence in
  tx history and `NOTES.md`), price band 1000 bps, refund cap
  50_000_000 ($50). **One constitution field deviates from the
  documented design, stated plainly: the refund window on-chain
  is 3600000000000000 ns (1000 hours), not the intended
  3_600_000_000_000 ns (1 hour)** — an extra group of zeros in
  the init arguments. It changes no other behaviour; its one
  practical consequence is that the out-of-band refund case
  cannot be exercised until the paid order ages past the window
  (see PENDING).
- Product `licence-pro` live at $25.00 with 3 sealed inventory
  commitments (SHA-256 hashes only) registered on-chain.
- The cashier's leash is on-chain: agent `bounden7.testnet`
  registered with pinned worker code hash
  `5ed7fe92550867937ce8aef6e838594b8ea2ed2ec205a9d4fe28387786c23c2a`;
  its function-call key
  `ed25519:EJQJ2wNB1RonSiLGRSqc1fvE4HyC8UFXqwifPNyeG9Z7` permits
  exactly `fulfil_order` + `issue_refund` on bounden10 with a
  0.25 NEAR allowance (set-agent tx
  `7USiGPFuehjzKxYHNNeCsy9zA7VVx85TWo1ujnAn38Vr`, add-key tx
  `7w8rcLEQXsoC8gUnsKNdL4MFkaAE7AUx4esE5G8g39wB`; the v1 key
  bound to the superseded contract was deleted from the
  account). The worker's startup self-check verifies this
  permission object before it will run.
  (Substitution, documented in `NOTES.md`: the agent is a fresh
  named account Muse controls, not `cashier.bounden.testnet` —
  creating a subaccount of the user's `bounden.testnet` needs the
  user's own key, which Muse does not hold. The constitution cares
  about the permission object, not the account's name.)
- **A real order ran end-to-end in Circle USDC**: created, paid
  25.00 via `ft_transfer_call`, fulfilled by the leashed cashier
  (tx `6WxQLouybTAjXoBBUfsYuREoHtB3GCqantekegn4Fzmw`), then
  refunded in-band — buyer balance restored to exactly
  40,000,000 base units, contract to 0, both records in the
  on-chain fulfilment log. That refund is also the live
  acceptance proof of the Stage 1 1-yocto fix: the contract's
  outbound `ft_transfer` was accepted by the real Circle USDC
  contract. **Caveat, proven live and recorded in `NOTES.md`:
  the refund was triggered by the agent account's full-access
  key, because a function-call key cannot attach the 1 yocto
  `issue_refund` demands** (protocol rejects it:
  `DepositWithFunctionCall`) — the leash-triggered refund needs
  the small contract fix specified in `NOTES.md` (drop the
  inbound assert; the outbound yocto is the contract's own).
- Attack suite run live on the corrected deployment: the price
  band refused an owner-signed +20% reprice on-chain (verbatim
  panic) and accepted in-band moves; leash-key attempts at a
  token transfer, a treasury withdrawal, and an inventory write
  were rejected at protocol validation with the reasons returned
  verbatim (`ReceiverMismatch`, `MethodNameMismatch`); the
  prompt-injection order was fulfilled with exactly one signed
  call and no drain; a dump of every public view contains zero
  usable codes.

**PENDING** (nothing below is claimed until it is verifiable
on-chain):

- NEAR AI Cloud attestation verified against the live API —
  DONE 9 Nov 2026 for the attestation report (redacted real capture
  in `worker/test/fixtures/`, parser narrowed to the observed live
  shape). Live chat completions — DONE later the same day: once the
  $10 Builders credit landed on a key issued under the owner's
  boundenn.near workspace, two live judgement completions from
  `deepseek/deepseek-v3.2` were captured as VERIFIED-LIVE fixtures
  (in-band refund → approve; out-of-band refund → refuse) and wired
  into the worker suite. The on-chain run was ATTEMPTED with the
  v3 deploy and the judgement layer would not approve (see the
  Stage 3 caveat in the live section above). The follow-up fix
  (populate `buyerHistorySummary` from the worker's own scan)
  has since LANDED and been re-pinned, and the re-probe
  escalated 6 of 6 on the buyer's true refund-heavy history —
  the on-chain `near-ai:` order remains unproduced, by the
  gate's own decision, not by a missing fix.
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

**Stage 1 contract implemented, verified locally, and DEPLOYED**
(23 unit tests passing; release wasm 339,818 bytes). The live
deployment is the v3 build on `bounden11.testnet` (see the live
section above and docs/PREFLIGHT.md); two earlier deployments
(bounden8, bounden10) are superseded.

**Stage 2 worker built, verified locally, and RUN LIVE**
(`worker/`, 57 unit tests passing): the leashed cashier with its
runtime allowlist guard, the `create-leashed-key` setup procedure,
the AES-256-GCM sealed-inventory vault, local refund-band pre-checks,
and the Stage 3 attestation seam. **Attack suite** (`attacks/`)
ships the five named cases; all five were run live against
bounden11 and refused as designed (results in `attacks/README.md`).
The live end-to-end pass — real testnet deployment, leash setup
on-chain, paid orders fulfilled and refunded by the leashed key
alone — is COMPLETE on bounden11; the worker daemon refuses to start
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
fabricating a hash. The worker suite stands at 57 tests, all
passing (unit tests fake network access; the judgement fixtures
below are real captures). **Attestation shape VERIFIED-LIVE
9 Nov 2026:** the live report binds the model inside a
`model_attestations` array (not the flat shape the docs suggested);
the fixture is now a redacted real capture and the parser was
narrowed to the observed shape, still failing closed on anything
unrecognised (`worker/test/fixtures/README.md`). The synthetic
chat-completion fixture remains doc-derived, but two VERIFIED-LIVE
judgement completions now sit beside it — captured 9 Nov 2026 once
the Builders credit unblocked inference (in-band refund → approve;
out-of-band refund → refuse; provider tests prove the approve path
yields a `near-ai:` hash and the refuse path throws). The on-chain
run was attempted live on bounden11: the judgement layer gated
every live decision (see the Stage 3 caveat in the live section),
so no live order carries a `near-ai:` hash yet. The
**storefront** (`web/`, Next.js)
builds and demos today in fixture mode, and passed a live-mode
smoke test locally against bounden11 (all routes rendering real
chain data; not yet deployed): catalogue, product pages, a
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
- Checkout settles on NEAR in Circle's testnet USDC
  (`3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af`
  — the contract Circle's developer docs list for NEAR Testnet,
  and the one its faucet pays). NEAR Intents is mainnet-only, so
  it appears as a `dry: true` price proof, never as the
  settlement rail.
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
