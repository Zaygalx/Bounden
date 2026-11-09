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

## Repo conventions

- All commits authored as Hassan Dosunmu <Dosunmuh070@gmail.com>
  (repo-local git config).
- Local first: nothing is pushed or published without the user's word.
