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

## Repo conventions

- All commits authored as Hassan Dosunmu <Dosunmuh070@gmail.com>
  (repo-local git config).
- Local first: nothing is pushed or published without the user's word.
