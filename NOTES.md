# Bounden — Build Notes

## Environment (verified Mon 9 Nov 2026, Africa/Lagos)

Build VM: Linux (Ubuntu-family container), x86_64, 4 CPUs, ~7.7 GB RAM,
~146 GB free disk.

| Tool | Version / status |
|---|---|
| Node.js | v24.22.1 |
| npm | 10.9.4 |
| Rust (rustup, stable) | rustc 1.99.1 (58cf8f9c3 2026-10-13), cargo 1.99.1 — installed fresh via rustup (minimal profile) during pre-flight; it was NOT present before |
| Rust targets | x86_64-unknown-linux-gnu, **wasm32-unknown-unknown** (added via rustup) |
| near-cli (JS) | NOT usable — `npm i -g near-cli` fails in this sandbox (node-gyp native build error) |
| near-cli-rs (Rust) | NOT installed — `cargo install near-cli-rs --locked` (v0.31.1) FAILED to compile in this sandbox after ~9 min; no near CLI binary currently exists here. Stage 1 proper must either fix this install or drive deployment via raw RPC calls |
| near-sdk (crate) | 5.30.1 (latest stable on crates.io at scaffold time) |

Gotchas recorded:

- near-sdk 5.30 refuses plain host `cargo build`/`cargo check` outside a
  NEAR environment (compile_error directing you to cargo-near). Host-side
  check/test works with the SDK's `unit-testing` feature enabled in
  contract/Cargo.toml. The on-chain build uses `cargo near build`
  (wasm32), which does not rely on that feature.
- near-sdk 5.x API notes (learned by compiling, all applied in
  contract/): `borsh` must be a direct dependency of the contract crate;
  the classic collections (`UnorderedMap`/`LookupMap`/`Vector`) sit
  behind the SDK's `legacy` feature; borsh derives must come ONLY from
  `#[near(serializers = [borsh])]` (manual borsh derives conflict);
  storage-key enums need `#[derive(BorshStorageKey)]`.
- **/tmp on this VM is a 512 MB tmpfs that runs FULL.** Native build
  scripts (aws-lc-sys, secp256k1-sys, pulled in by near-sdk's
  unit-testing deps) then fail cryptically. Fix: `export
  TMPDIR=$HOME/.tmp` before cargo commands that compile native deps.
- Verification status at foundation commit: `cargo check` PASS,
  `cargo test` PASS (2 tests), release wasm build PASS
  (target/wasm32-unknown-unknown/release/bounden_contract.wasm,
  ~179 KB). The formal on-chain build in Stage 1 proper uses
  `cargo near build` once cargo-near is installed — note
  `cargo install cargo-near --locked` was attempted during
  pre-flight and was still compiling after ~33 min (binaryen +
  near-cli-rs dependency tree); it was stopped to close pre-flight
  and can be resumed. The plain cargo wasm build above is the
  currently verified build path.
- Sandbox egress is HTTPS via a proxy; testnet RPC
  (https://rpc.testnet.near.org) is reachable and was used live for all
  pre-flight queries.

## Pre-flight headline results (details: docs/PREFLIGHT.md)

- `bounden.testnet` → UNKNOWN_ACCOUNT on testnet RPC (available,
  unclaimed) as of 9 Nov 2026. Claiming it is a user phone step
  (wallet + faucet anti-abuse flow); no honest headless route from a
  cold VM.
- Settlement token: `usdc.testnet` — ft_metadata verified live:
  name "USDC", symbol "USDC", decimals 6.
- `usdt.fakes.testnet` / `usdc.fakes.testnet` exist (fake-bridged test
  tokens, 6 decimals) but are not the canonical choice.
- NEAR AI Cloud: base `https://cloud-api.near.ai/v1`, `sk-` bearer
  keys from cloud.near.ai dashboard; attestation report at
  `GET /v1/attestation/report?model=<id>`; $10 credit via NEAR Builders
  (hackathon HACKATHON.md Q-000) — user account steps, Stage 3.
- `bounden.near` (mainnet) verified available 9 Nov; claiming costs
  ≈0.1 NEAR real money — deferred to Stage 5 as a user step. Nothing
  was spent in pre-flight.

## Stage 1 proper — constitution contract (Mon 9 Nov 2026)

Implemented in `contract/src/lib.rs` (tests in `contract/src/tests.rs`):

- Owner-only admin: `set_agent` (register/rotate agent + pinned code
  hash), `add_product`, `update_product` with the price band enforced
  in-contract (deviation > `price_band_bps` of the current price is
  rejected, even for the owner), `add_inventory_commitments`
  (SHA-256 hex only, duplicates rejected).
- Orders: `create_order` (price copied at creation), `cancel_order`
  (buyer-only, `Created` only). Payment ONLY via NEP-141
  `ft_transfer_call` into `ft_on_transfer`: predecessor must be the
  settlement token, sender must be the buyer, amount must equal the
  order amount EXACTLY — over/underpayment returns the full amount as
  unused (the token refunds the sender) and emits
  `bounden_order_rejected_payment`.
- `fulfil_order`: registered agent only, `Paid` only, consumes exactly
  one commitment, appends a `FulfilmentRecord` (delivery evidence hash +
  optional AI attestation hash, also stored on the order), state →
  `Fulfilled`. Second fulfil panics.
- `issue_refund`: agent only, `Paid` or `Fulfilled` orders (PLAN's
  state machine). Band failure on a valid agent call does NOT move
  money: state → `RefundRejected` + `bounden_refund_rejected` event for
  owner review. In-band: `ft_transfer` of the order amount back to the
  buyer, state → `Refunded`, log entry. (Key-level rejections never
  reach the contract; the attack suite demonstrates those.)
- Treasury: `withdraw_treasury` is owner-only and the destination is
  HARD-CODED to the owner account — no address parameter, by design.
- Views: `get_product`, `get_order`, `get_constitution`,
  `get_fulfilment_log` (paged), `fulfilment_log_len`,
  `inventory_available`. Events are NEP-297-style `EVENT_JSON:` log
  lines (`bounden_order_created/paid/fulfilled/refunded/…`).
- Verification: `cargo test` — **23 passed, 0 failed, 0 warnings**
  (TMPDIR=$HOME/.tmp). Release wasm: `cargo build --target
  wasm32-unknown-unknown --release` PASS, **339,892 bytes (~332 KB)** —
  larger than the 179 KB skeleton because the contract now carries the
  full method surface plus near-contract-standards.

SDK friction worth remembering:

- Added two direct dependencies in Stage 1 proper:
  `near-contract-standards = "5"` (resolved 5.30.1; provides the
  `FungibleTokenReceiver` trait — note it does NOT export an
  `ext_fungible_token` cross-contract trait, so the outbound FT
  interface is declared locally with `#[ext_contract]`) and
  `serde_json` (near-sdk re-exports serde but not serde_json; the
  event emitter needs real JSON escaping for free-form strings).
- `Promise`/`PromiseOrValue` returned by contract methods are
  `#[must_use]` in tests too — discarded promises in test code warn;
  bind them (`let _ =` or assert on them) instead of dropping.
- `env::attached_deposit()` returns `NearToken` in near-sdk 5.30;
  compare via `.as_yoctonear()`.

## Stage 1 fix — 1 yocto on outbound ft_transfer (Mon 9 Nov 2026)

**Finding — CONFIRMED, real latent defect** (flagged by the Stage 2
worker build's close reading; verified line by line before fixing).
Every `ft_transfer` promise the shop contract creates was built with
0 attached deposit. NEP-141 `ft_transfer` asserts exactly 1 yoctoNEAR,
so on the real settlement token both payout paths would have failed
at `usdc.testnet` — after this contract had already recorded the
state change ordering the transfer: a refund's order would sit in
`Refunded` with the buyer's money never moved, and a treasury
withdrawal's event would claim funds that never left. The 23 unit
tests could not see it: they asserted state, log lines and that a
promise was returned — never its deposit.

**Complete site audit.** The contract contains exactly two outbound
`ft_transfer` call sites, and both were defective:
`withdraw_treasury` (pays the owner) and `issue_refund` (pays the
buyer). `ft_on_transfer` creates NO token transfers — rejections
return the amount as `PromiseOrValue::Value(amount)` (the NEP-141
unused-balance mechanism; the token refunds the sender itself) and
acceptance returns `U128(0)` — so there is no third site.

**Fix.** Both sites now chain `.with_attached_deposit(ONE_YOCTO)`
(ext-builder API), with `ONE_YOCTO = NearToken::from_yoctonear(1)`
as a named constant at the top of `contract/src/lib.rs` and a comment
at each site explaining that the deposit is load-bearing. No other
behaviour changed: both methods already required the *caller* to
attach exactly 1 yocto inbound — that assert was about the caller's
deposit and never covered the outbound promise; the two are easy to
conflate, which is how the defect survived review.

**Regression protection.** `assert_ft_transfer_receipt` in
`contract/src/tests.rs` (used by `owner_withdraws_treasury_to_owner`
and `refund_within_cap_and_window_succeeds`) reads the mocked
environment's recorded receipts (`get_created_receipts`) and asserts
the `ft_transfer` receipt to the token carries
`attached_deposit == 1 yocto`. Negative control run: stripping
`.with_attached_deposit(...)` from both sites makes exactly those
two tests fail, showing `attached_deposit: NearToken { inner: 0 }` —
the original defect, caught. With the fix: **23 passed, 0 failed,
0 warnings** — same count as before, because the guard extends two
existing tests rather than adding new ones.

One mock-environment subtlety worth remembering: near-sdk registers
the scheduled receipt when the returned promise is *consumed* (the
runtime returning it, or a test dropping it), not at creation — so
the tests `drop(...)` the promise before asserting. A held,
never-consumed promise shows zero created receipts in the mock, which
looks exactly like "the call never happened" until you know this.

**What unit tests can and cannot prove here.** They prove the
promise this contract schedules carries the 1-yocto deposit. They do
NOT prove the transfer succeeds on-chain: the mock records receipts
without executing them against a real token contract. The true
verification is a live testnet refund and treasury withdrawal
against `usdc.testnet` in the deployment stage (still gated on the
testnet funding step — PREFLIGHT §7). Release wasm rebuilt:
**339,892 bytes** — identical size to the pre-fix build.

## Stage 2 pre-build — leashed worker + attack suite (Mon 9 Nov 2026)

Built everything that does not need a live testnet account; the live
end-to-end pass waits on the same faucet wall as deployment
(PREFLIGHT §7). Commits: worker `b57be5e`, attacks `c0975cb`.

- **Client library decision: near-api-js 7.4.0, exact-pinned** (with
  typescript 7.0.2, @types/node 24.10.1, vitest 4.0.18 — all exact;
  package-lock committed). Why not wrap scripts/near_rpc.py: the worker
  is a long-lived TypeScript daemon, and shelling out to Python per
  call would couple its liveness to a CLI-shaped tool and complicate
  signing/nonce handling. near-api-js is the maintained client; its
  v7 API was verified against the installed type definitions AND a
  live testnet view call (usdc.testnet ft_metadata) before use. v7
  gotchas: secret keys are the branded `KeyPairString` type;
  `signAndSendTransaction` waitUntil uses `"FINAL"`, not
  `"FINALITY_REACHED"`; the provider's view method is `callFunction`
  with `{contractId, method, args}` while Account's change method
  takes `methodName`.
- **npm in this sandbox:** `vitest@4.1.0` does not exist (registry
  tops at 4.0.18 — always check before pinning); a combined
  `npm install` of all four deps crashed npm's arborist
  (`edgesOut` on null) — installing in two steps worked. npm also
  rewrites package.json (minified, caret ranges) on `npm install <pkg>`;
  the committed manifest restores exact pins (the lockfile agrees).
- **Worker design points worth remembering:**
  - The contract has NO list-orders view. The worker discovers orders
    by probing sequential `get_order` ids to the first null — exact,
    since ids are sequential from 0.
  - Refund band pre-check happens worker-side (state/cap/window) so
    doomed calls never burn the leash key's gas allowance; the
    contract remains the enforcing layer.
  - `issue_refund` needs exactly 1 yocto attached (contract assert,
    for the token's ft_transfer).
  - The vault's FIFO order must match the order commitments were
    registered on-chain — the contract consumes its first unconsumed
    commitment. seed-demo-vault prints them in order.
  - Agent code hash = SHA-256 over worker `src/*.ts` (names+contents,
    sorted); cross-verified against an independent Python computation.
    The create-leashed-key CLI resolves `../../src` from dist — the
    hash is over SOURCE, not build output.
  - Timestamps: `paid_at` arrives as a JSON number (~1.7e18 ns); a
    double loses ~256 ns — irrelevant vs the 1-hour window. Amounts
    are strings → BigInt throughout. No floats near money.
- **Verification (all local, honestly labelled):** worker typecheck
  PASS (strict), 30/30 vitest tests PASS, build PASS; smoke runs:
  seed-demo-vault sealed 5 demo codes with ZERO plaintext in the state
  file; create-leashed-key --dry-run derived two distinct keypairs
  (0600) into a temp vault; the compiled daemon, pointed at live
  testnet with a nonexistent agent account, refused to start with
  "access key not found on-chain" — the startup leash check works.
  Attacks: typecheck/build PASS, mock mode prints 5/5 expected
  refusals.
- **Live pass needs (once any testnet account is funded):** deploy +
  init per scripts/claim-named-account.md → seed-demo-vault against
  the real vault → register the printed commitments → create the agent
  account with the dry-run full-access public key → create-leashed-key
  live run → start worker → place a real order (buyer needs testnet
  USDC from the usdc.testnet faucet flow) → watch fulfilment →
  run attacks live. Also verify on testnet whether the agent FC key's
  allowance accounting behaves with the 1-yocto refund deposit.

## Stage 3 pre-build — judgement layer + storefront (Mon 9 Nov 2026)

Built against mocks/fixtures only; testnet deployment is still gated
on the same faucet wall (PREFLIGHT §7), and no NEAR AI Cloud key
exists in this environment. Commits: worker `504b525`, web `14eaeb8`.

- **AI Cloud client (`worker/src/ai-cloud.ts`).** OpenAI-compatible
  chat client for `https://cloud-api.near.ai/v1`; key from env only,
  model id from env; fetch injectable (tests never touch the network);
  30 s timeout via AbortController. Judgement = structured JSON
  {decision: approve|refuse|escalate, reason}. Parsing decisions:
  fenced or prose-wrapped JSON is tolerated on INPUT, but the decision
  enum is strict and any malformation maps to escalate — never
  approve. The attestation report parser is the defensive centre:
  requires a JSON object, a `model`/`model_id` field equal to the
  requested model, and ≥1 field from a generous TEE-evidence set
  (quote/tdx/intel/nvidia/gpu/event_log/vm_config…); anything else is
  a typed `AiCloudShapeError`. Rationale: the live report shape is
  UNVERIFIED (fixtures are doc-derived — `worker/test/fixtures/`), so
  the parser trades strictness for loud failure, and the hash input
  keeps the ENTIRE raw report, so a future field we don't know about
  still binds into the attestation hash. The live pass narrows the
  evidence set to the observed fields and replaces the fixtures with
  real captures.
- **Provider semantics (`worker/src/ai-cloud-attestation.ts`).**
  Selected via `BOUNDEN_ATTESTATION_PROVIDER=near-ai` (default `null`
  — Stage 2 behaviour unchanged). Non-approval THROWS
  (`JudgementNotApprovedError`) rather than returning null, because
  through the `Promise<string|null>` seam a null means "no judgement —
  proceed", and a refuse must never degrade into that. The worker's
  existing catch path then leaves the order in place for owner
  review. Outcomes cached per request hash (the worker polls;
  re-asking costs credit and could flip decisions). Hash format
  `near-ai:<hex>` mirrors the `local-sha256:` prefix discipline — the
  source of a hash is visible in the hash. Key-absent refusal:
  provider constructs no client, logs at error level at startup and
  per request, returns null.
- **Payload hygiene.** ONE builder (`buildJudgementRequestBody`),
  whitelist-only. Deliberate exclusion: the buyer ACCOUNT id is not
  sent to the model (the history summary is the designed input); the
  account is bound locally via `computeRequestHash`, so a judgement
  still cannot be transplanted between buyers. Test plants
  code/key/prompt-injection strings in extra request fields and
  asserts none reach the serialised payload.
- **Worker verification:** typecheck PASS (strict), **51/51 vitest
  tests PASS** (30 Stage 2 + 21 new), build PASS. Sandbox gotcha:
  vitest dies with ENOSPC unless `TMPDIR=$HOME/.tmp` (the 512 MB /tmp
  tmpfs again).
- **Storefront (`web/`).** Next.js **16.4.5** + React **19.3.1**
  (registry-current in this sandbox; exact pins, lockfile committed),
  TypeScript 7.0.2, no CSS framework, system font stack (avoids the
  Google-Fonts fetch at build time). Data layer (`src/lib/shop.ts`):
  fixture mode iff `BOUNDEN_CONTRACT_ACCOUNT_ID` unset; live mode
  reads via JSON-RPC `query`/`call_function` (same shape PREFLIGHT
  verified live) + `view_access_key` for the leash; a failed live
  read falls back to fixture data WITH a banner saying so. Catalogue
  needs `BOUNDEN_PRODUCT_IDS` because the contract has no
  list-products view (same constraint the worker hit with orders).
  Pages all `force-dynamic` so live reads are never baked at build.
  Next 16 notes: route `params` are Promises (awaited everywhere);
  `next build` auto-rewrote tsconfig (jsx → react-jsx, added
  `.next/dev/types` include) — committed as Next left it; `.next/`
  and `*.tsbuildinfo` added to the repo .gitignore (caught 253 build
  files trying to enter the storefront commit).
- **Web verification:** typecheck PASS; `next build` PASS (7 app
  routes, all dynamic); production server smoked in fixture mode —
  `/`, `/products/licence-pro`, `/checkout/licence-pro`, `/orders/0`,
  `/orders/99`, `/constitution`, `/about` all 200, demo notice +
  fixture banner present, constitution shows the allowlist and the
  0.25 NEAR allowance, `/orders?id=1` 307-redirects to `/orders/1`.
  Live mode is NOT yet smoked (no deployed contract exists to read).
- **Checkout is an explainer, deliberately.** Buying is a wallet
  action (`create_order` + `ft_transfer_call` with msg = the order
  id as a decimal string — verified against contract/src/lib.rs, the
  msg is parsed with `msg.trim().parse::<u64>()` and nothing else).
  The storefront holds no keys and signs nothing; a wallet-connect
  buy flow is a live-pass decision, not a pre-build assumption.
- **Downloads:** design only (`docs/DOWNLOADS.md`) — HMAC-signed
  token, 15-min expiry, one-time `jti`, bound to (order_id,
  evidence_hash) from the on-chain fulfilment record; dedicated
  download sub-key so the download path can never decrypt inventory.
- **Stage 3 live pass, in order:** (1) user creates the NEAR AI Cloud
  key + claims the $10 Builders credit (PREFLIGHT §4); (2) capture
  ONE real chat completion + attestation report, diff vs fixtures,
  narrow the parser, mark fixtures VERIFIED-LIVE; (3) after testnet
  deployment (PREFLIGHT §7 sequence): set
  `BOUNDEN_ATTESTATION_PROVIDER=near-ai` + key/model env, run one
  real order end-to-end, confirm a `near-ai:` hash lands on-chain via
  `get_order`; (4) point `web/` env at the deployed contract +
  `BOUNDEN_AGENT_PUBLIC_KEY`, smoke every page in live mode, deploy
  to Vercel; (5) exercise a refund judgement (approve AND refuse
  paths) on testnet before the film.

## Repo conventions

- All commits authored as Hassan Dosunmu <Dosunmuh070@gmail.com>
  (repo-local git config).
- Local first: nothing is pushed or published without the user's word.
