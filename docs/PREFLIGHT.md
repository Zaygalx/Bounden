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

## 5. Mainnet payout account (`bounden.near`) — funding brief (updated 9 Nov, deployment run)

- `bounden.near` was verified **available** on mainnet (9 Nov, and
  re-verified during the deployment run: `view_account` →
  UNKNOWN_ACCOUNT).
- **(a) Mainnet implicit account id from the SAME owner public key**
  (`ed25519:J8nqSrjYNRDeHFdwXwFS2eT2f4xhgR1H64WFLJZhFwuZ`, generated
  locally 9 Nov; private key in the local vault only):
  **`fe9591cc09aa84478e6c8c622c402f2007eae6e65182976948ab23b1538b43f0`**
  (lowercase hex of the public key — identical on testnet and
  mainnet). This is the address the user funds; the named account is
  then created from it by script (`scripts/near_rpc.py create-top`,
  see `scripts/claim-named-account.md`).
- **(b) Exact amount to request: 0.1 NEAR.** Refined from official
  sources (9 Nov):
  - docs.near.org, *Accounts* (updated 2026-10-09): "An account can be
    created with no initial deposit; the creator pays a **0.007 NEAR**
    creation charge through gas fees, plus the other transaction
    fees", and "The first transfer to the address creates the
    account, including a transfer of 0 NEAR."
  - The NEAR MCP `account_create_account` tool defaults
    `initialBalance` to **0.1 NEAR** when creating a named account —
    the ecosystem's standard initial funding figure; wallet guidance
    likewise asks for "at least 0.1 NEAR" to activate a custom named
    account.
  So 0.1 NEAR covers the 0.007 NEAR creation charge many times over
  and leaves the payout account with a working balance for its own
  storage and gas. **Ask for exactly 0.1 NEAR — no more is needed.**
- **(c) What it will be used for:** claim **`bounden.near`** as the
  hackathon submission form's NEAR mainnet payout account (the form
  requires a mainnet address), and cover that account's creation
  charge, storage and gas. Nothing else. No mainnet contract
  deployment is planned with these funds (testnet-first decision).
- **Funding protocol (owner's condition):** Muse presents this
  brief; the USER manually sends 0.1 NEAR to the implicit address
  above; Muse then creates `bounden.near` from it by script and
  verifies on-chain. **Nothing was spent in pre-flight or in the
  deployment run.**

## 7. Deployment run (Mon 9 Nov 2026) — testnet account creation BLOCKED at the faucet wall

Executed under the owner's full-autonomy grant (07:41 WAT). Owner
keypair generated locally; private key only in
`~/workspace/bounden-secrets/` (outside the repo). Raw-RPC tooling in
`scripts/near_rpc.py` (view paths live-verified against testnet RPC:
`usdc.testnet` account + `ft_metadata` read correctly).

**Identities (public):**
- Owner public key: `ed25519:J8nqSrjYNRDeHFdwXwFS2eT2f4xhgR1H64WFLJZhFwuZ`
- Owner implicit account id (testnet + mainnet):
  `fe9591cc09aa84478e6c8c622c402f2007eae6e65182976948ab23b1538b43f0` —
  `view_account` → UNKNOWN_ACCOUNT on both networks (not created).

**Routes attempted, with evidence (max-two-retries rule honoured):**

1. **Helper service (the documented CLI faucet-sponsor protocol).**
   near-cli-rs `sponsor-by-faucet-service` POSTs
   `{newAccountId, newAccountPublicKey}` to the network faucet URL;
   replicated exactly against `https://helper.testnet.near.org/account`
   for (i) the owner implicit id, (ii) `bounden.testnet`, (iii) a
   second fresh probe keypair. All three returned HTTP 200 with a full
   execution outcome in which the `testnet` registry receipt **failed**:
   `ActionError { index: 0, kind: OnlyImplicitAccountCreationAllowed
   { account_id: <requested id> } }`. The helper service no longer
   creates accounts via this route — for named OR implicit ids.
2. **Current official faucet, near-faucet.io (NearBlocks).** Its form
   validation accepts only `*.testnet` addresses or EVM `0x…`
   addresses (an implicit NEAR id is rejected client-side); its
   request path is a Next.js server action whose programmatic calls
   returned HTTP 500 (both embedded action ids tried). It is also
   wallet-session based by design.
3. **Linkdrop surface.** `linkdrop.testnet` exists (~207,967 NEAR,
   code hash `EGFzFD5x…`) but exposes none of
   `get_key_balance` / `get_key_information` / `create_account` /
   `claim` / `create_account_and_claim` (all MethodNotFound);
   `linkdrop-proxy.testnet` and `v1.linkdrop.testnet` do not exist.
   Keypom v2 (`create_drop`/`claim`) requires a pre-funded funder —
   circular from a cold start.
4. `faucet.testnet.near.org` API paths → 404 (the domain redirects to
   near-faucet.io); `helper.testnet.near.org/faucet` → 404.

**Conclusion:** from a cold VM there is currently **no working
headless route to a first funded testnet account** — every route is
either retired (helper creation), human-gated (wallet sign-in
faucet), or requires an already-funded account. This matches §2's
original finding; the deployment therefore stops at the same wall,
now with on-chain error evidence. The signing/broadcast path of
`scripts/near_rpc.py` could not be exercised (no funded signer
exists); its view paths are verified.

**Unblock (one human step, then everything else is scripted):**
send any amount ≥ ~0.01 testnet NEAR (faucet-obtained, valueless) to
the owner implicit account above — the first transfer creates it —
or claim `bounden.testnet` in Meteor per §2 with the owner public key
added afterwards. Full command sequence: `scripts/claim-named-account.md`
(create named account → deploy + init → verification battery).
Deployment parameters are fixed there: payment token `usdc.testnet`,
price band 1000 bps, refund cap 50_000_000 ($50.00), refund window
3_600_000_000_000 ns; verification product = a $25.00 licence key
(25_000_000 base units) with SHA-256 commitments of
`BOUNDEN-TEST-LICENCE-0001…0003` (hashes only, never plaintext).

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
