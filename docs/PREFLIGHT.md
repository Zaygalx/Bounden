# Bounden — Stage 1 Pre-flight Results

Run: Mon 9 Nov 2026 (Africa/Lagos), from the build VM against live
testnet RPC. Everything below was verified, not assumed. Items needing
the user's phone are marked **[USER STEP]**; items the agent can do are
marked **[AGENT]**.

## 1. Testnet RPC + the `bounden.testnet` name

- `https://rpc.testnet.near.org` is reachable from this sandbox
  (chain_id `testnet`, protocol version 88 at check time).
- `view_account bounden.testnet` → **UNKNOWN_ACCOUNT** — the name is
  still unclaimed (re-confirmed 9 Nov, after the 06:41 WAT check).

## 2. Creating the named testnet account — [USER STEP]

Per the current NEAR docs (https://docs.near.org/getting-started/create-account),
a named testnet account is created either through a wallet UI or through
the NEAR CLI, whose account-creation flow is funded by the testnet
faucet. Verified constraint from this sandbox: **the CLI cannot be
bootstrapped here without an already-funded account** — the JS CLI
failed to install (native build error), and the Rust CLI's
create-account path needs a funded signer or its interactive web-login
flow. There is no honest fully-headless route from a cold VM, so this
is a user step, by design of NEAR's faucet (it is anti-abuse gated):

**[USER STEP] Claim `bounden.testnet` on your phone (≈3 minutes):**
1. Open https://wallet.near.org and pick a testnet-capable wallet
   (Meteor), switching the network to **Testnet**. (Not MyNearWallet:
   it sunset 31 Oct 2026 — see §5.)
2. Create a new account with the exact ID **`bounden.testnet`** and
   complete the wallet's funding step (the wallet draws on the testnet
   faucet; new testnet accounts arrive funded).
3. Save the seed phrase somewhere safe — it is the only recovery path.
4. Tell Muse the account is created. From then on, deployments and
   top-ups from the CLI/agent side are automatable; if test NEAR runs
   low, the faucet at https://faucet.testnet.near.org tops up an
   existing account (wallet sign-in required).

**Fallback (agent, no user needed):** development can proceed against a
generated implicit account (64-char hex account ID derived from a local
keypair, funded via the faucet path once any funded account exists),
with the named `bounden.testnet` claim completed before Stage 5. The
contract itself is account-agnostic.

## 3. Testnet USD stablecoin — VERIFIED

Queried live via `ft_metadata` on testnet RPC, 9 Nov 2026:

| Contract | Name | Symbol | Decimals | Verdict |
|---|---|---|---|---|
| `usdc.testnet` | USDC | USDC | 6 | **Canonical — USE THIS** |
| `usdt.fakes.testnet` | Tether USD | USDT.e | 6 | Fake-bridged test token (Rainbow "fakes" factory) |
| `usdc.fakes.testnet` | Bridged USDC | USDC.e | 6 | Fake-bridged test token |
| `usdt.testnet` | — | — | — | Account exists, **no contract code** — do not use |

**Decision:** settlement token = **`usdc.testnet`** (USDC, 6 decimals).
Prices are stored in its base units: $1.00 = `1_000_000`.
No custom token needed; the tUSD fallback is not triggered.

## 4. NEAR AI Cloud — documented (Stage 3 dependency)

From docs.near.ai (Quickstart + API reference, crawled 9 Nov 2026):

- **API base URL:** `https://cloud-api.near.ai/v1` (OpenAI-compatible;
  e.g. `POST /v1/chat/completions`).
- **Auth:** API key with `sk-` prefix, sent as `Authorization: Bearer`.
- **Getting a key — [USER STEP]:** sign up at https://cloud.near.ai →
  "API Keys" section → generate a key. Keys are account actions; the
  agent never receives one by chat — it goes in the secure vault /
  environment when Stage 3 starts.
- **$10 builders credit — [USER STEP]:** per the hackathon's
  HACKATHON.md (Q-000), $10 of NEAR AI Cloud credit is claimable by
  joining **NEAR Builders**. Claim it on the same cloud.near.ai account
  before generating usage; the dashboard's "Credits" section is where
  credit is added.
- **Attestation (the receipt):** every response is produced inside a
  TEE and is verifiable. The attestation report is served per model at
  `GET /v1/attestation/report?model=<model_id>` on the cloud API host;
  a public no-code checker lives at https://cloud.near.ai/verify
  (Verification Center). Bounden stores only the attestation **hash**
  on-chain per judgement (contract field
  `judgement_attestation_hash`); full verification stays possible via
  the report endpoint + Verification Center.

## 5. Mainnet payout account (`bounden.near`) — [USER STEP], do not rush

- `bounden.near` was verified **available** on mainnet (9 Nov).
- Cost reality (official docs + current wallet guidance): a named
  mainnet account needs a small real NEAR deposit — ≈**0.1 NEAR** for
  storage — paid at creation. There is **no verified free sponsored
  creation flow** for arbitrary names right now: MyNearWallet sunset
  31 Oct 2026 and NEAR's current recommendation is near.com passkey
  accounts / Meteor Wallet. (Any site promising free named mainnet
  accounts should be treated as unverified.)
- **Cheapest honest route — [USER STEP], needed only before the
  submission form (Stage 5), not now:**
  1. Create the account via Meteor Wallet (mobile app) or near.com,
     choosing the exact ID **`bounden.near`**.
  2. Fund the creation with ≈0.1 NEAR (buy a small amount in-wallet or
     transfer from any exchange account you already hold NEAR on).
  3. Save the seed phrase / passkey recovery safely.
- **Nothing was spent in pre-flight.** This step exists because the
  hackathon's one-shot submission form requires a NEAR mainnet account
  address for prize payout.

## 6. Toolchain on the build VM

See NOTES.md: Node 24, Rust stable 1.99.1 (freshly installed via
rustup), wasm32-unknown-unknown target installed. CLI status, stated
plainly: JS near-cli failed to install (node-gyp native build error)
and `cargo install near-cli-rs --locked` (v0.31.1) also FAILED to
compile in this sandbox — **no near CLI binary currently exists on
this VM**. Stage 1 proper must either fix a CLI install or deploy via
raw RPC calls. (`cargo install cargo-near --locked` was also
attempted: still compiling after ~33 minutes — its dependency tree
includes binaryen and the near-cli-rs crate — and was stopped so
pre-flight could close; it can be resumed in Stage 1 proper, and
the plain cargo wasm build already works without it.)
