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

> **SUPERSEDED (Mon 9 Nov 2026, Stage 2 live pass v2) — the
> decision above is WRONG, and the table's "Canonical" verdict
> with it.** `usdc.testnet` is a token with USDC's name, symbol
> and decimals but a null icon, and Circle's faucet does not
> dispense it. Circle's actual NEAR testnet USDC is the
> implicit-style contract
> **`3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af`**:
> Circle's own developer documentation ("USDC contract
> addresses", updated 2026-11-06) lists exactly that address
> for NEAR Testnet; its `ft_metadata` carries Circle's official
> USDC icon; and the owner's two faucet claims landed there
> (20,000,000 base units each, re-verified on-chain). The
> error: the token was picked by NAME from metadata that two
> different contracts share. The live shop (bounden10.testnet)
> pins the corrected contract; full evidence in `NOTES.md`,
> "Stage 2 live pass v2".

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
- **Verified live (9 Nov 2026, Stage 3 live pass, via the registered
  `custom.near-ai-cloud` connector; key in the secure vault only):**
  auth proven (`GET /v1/models` → 200, 64 models). The attestation
  endpoint works without inference credits and its real shape is
  captured (redacted) in `worker/test/fixtures/` — top level
  `gateway_attestation` / `model_attestations` / `ohttp_attestation`
  / `ohttp_key_config`, model binding inside the
  `model_attestations` entries. `openai/gpt-oss-120b` is NOT a valid
  model on this API (400, absent from the model list); the verified
  judgement model is `deepseek/deepseek-v3.2` (report entry:
  `gpu_verdict` PASS, `verified` true, TCB `UpToDate`).
  **Chat completions are gated:** a real judgement request returned
  **402 "No spending limit configured"** — inference needs credits /
  a spending limit set up in the cloud.near.ai dashboard (the $10
  Builders credit above is the expected route) before the first live
  judgement can run. [USER STEP, dashboard only]

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

- **EXECUTED (Mon 9 Nov 2026) — claim done, return SENT at the
  maximum that fits after a stopped saga, accounting closed
  (see the final return entry):**
  the user's exchange minimum withdrawal was 0.2 NEAR, so 0.2 NEAR
  was sent (owner-approved). Full on-chain accounting, every figure
  recovered from chain records and reconciled to the yocto:
  - **In:** 0.2 NEAR to the owner implicit account — tx
    `Bq48FFAYDdiKsLMvvJdYuDshJAsAHejPu5CF7nFLQVYp`.
  - **Claim:** tx `HLbPm1PSJ2N34qYMrXWvaQUsRTPMpMmT2uJptqPGPL7K` —
    the implicit account called `create_account` on the `near`
    registry with 0.1 NEAR attached; `bounden.near` now exists
    holding exactly **0.1 NEAR** (verified by `view_account`).
  - **Exact creation cost:** 7,444,150,112,772,500,000,000 yocto
    (**0.0074441501127725 NEAR**) total `tokens_burnt` across the
    claim tx's transaction + receipt outcomes (RPC
    `EXPERIMENTAL_tx_status`). Reconciliation: 0.2 in − 0.1 to
    `bounden.near` − 0.0074441501127725 cost = **0.0925558498872275
    NEAR** remaining in the implicit account (92,555,849,887,227,
    500,000,000 yocto) — matches `view_account` exactly.
  - **Return (STOPPED — not sent):** the user named return address
    `395665c1e9e898b79a67f41ea5fbe1d45d3eb4e2b3ca242b4b2e58a158f5140e`
    (still UNKNOWN_ACCOUNT — a plain transfer would create it).
    Agreed return = fresh balance − 0.002 NEAR gas reserve =
    **0.0905558498872275 NEAR** (90,555,849,887,227,500,000,000
    yocto). Two broadcast attempts were made with
    `scripts/near_rpc.py`'s signing path; **both were rejected by
    the mainnet node at request validation** (`send_tx` → HTTP 400,
    `REQUEST_VALIDATION_ERROR` / `PARSE_ERROR`: "the value could not
    decoded from borsh due to: unknown key type '25'") — the tx was
    refused *before* broadcast, so **no return transaction exists**
    (re-verified after each attempt: balances unchanged, recipient
    still unknown, the implicit account's history still shows only
    the two txs above). Working diagnosis: the raw-RPC tooling's
    transaction serialisation for this transfer construction is
    rejected by the current mainnet node, while its named-account
    calls (the claim itself, and the testnet deploys) succeed — the
    defect is in the local tooling path for this case, not in the
    account, the key, or the recipient. Per the real-funds rule the
    run stopped after two attempts rather than improvising a third
    signing path. **Next step to close this out:** send the same
    0.0905558498872275 NEAR from the implicit account using a
    standard maintained NEAR client (e.g. near-api-js) or a wallet,
    then record the return tx here. Until then the implicit account
    continues to hold 0.0925558498872275 NEAR, of which
    0.0905558498872275 NEAR is owed to the user.
  - **Return via near-api-js (later, Mon 9 Nov) — ALSO NOT SENT;
    the amount does not fit, and no funds moved:** a follow-up run
    executed exactly the close-out step above with near-api-js
    7.4.0 (the worker's pinned client): fresh `view_account`
    re-confirmed the implicit balance at exactly
    92,555,849,887,227,500,000,000 yocto, the key was verified
    on-chain as the account's FullAccess key, and
    `Account.transfer` of the agreed 90,555,849,887,227,500,000,000
    yocto to the user's address was attempted. The client refused
    **locally, before broadcast**, with: "Not enough balance for
    fe9591cc…43f0 (balance: 92555849887227500000000, cost:
    98163292343477500000000)". The demanded cost — amount +
    5,607,442,546,000,000,000,000 yocto (≈0.0056 NEAR) of
    client-computed transaction cost — exceeds the agreed 0.002
    NEAR reserve. No transaction was signed or broadcast;
    re-verified afterwards: implicit balance unchanged to the
    yocto, recipient still UNKNOWN_ACCOUNT. Working reading
    (labelled as such, not a proven root cause): the demanded
    uplift matches a storage price of ~5.6×10^19 yocto/byte × 100
    bytes — the standard minimum balance of a freshly created
    account — i.e. the client prices creating the recipient's
    implicit account into a plain transfer; whatever its origin,
    the arithmetic is the chain's/client's, not a figure this
    project can negotiate. **Consequence, stated plainly:** from
    this implicit account, a return of 0.0905558498872275 NEAR is
    impossible today — at most ≈0.0869 NEAR can leave while
    covering the demanded cost — and the run was forbidden to
    improvise: no reduced amount was sent and no third signing
    path was tried. **The debt stands unchanged:** the implicit
    account still holds 0.0925558498872275 NEAR, of which
    **0.0905558498872275 NEAR is owed to the user** at
    `395665c1e9e898b79a67f41ea5fbe1d45d3eb4e2b3ca242b4b2e58a158f5140e`.
    Closing it needs a decision from the owner: a slightly larger
    gas reserve (a smaller return), a different return route, or
    a top-up — not another automated attempt.
  - **Return — SENT (later, Mon 9 Nov 2026; owner-confirmed in
    chat: "Ok send 0.0849 yes") — saga closed.** Two things were
    established first. (i) An owner-approved lean attempt (plain
    transfer via `signAndSendTransaction`, then a hand-built
    signed transaction broadcast straight to the provider) was
    refused with the *identical* demanded cost as
    `Account.transfer` — the uplift is enforced by the
    node/protocol at validation on every signing path, not
    computed by any client. (ii) The uplift figure in the
    previous entry was an arithmetic slip: 98,163,292,343,477,
    500,000,000 − 90,555,849,887,227,500,000,000 =
    **7,607,442,456,250,000,000,000 yocto (0.00760744245625
    NEAR)** — the new-implicit-account creation charge. The
    maximum that fits from the implicit balance is therefore
    92,555,849,887,227,500,000,000 − 7,607,442,456,250,000,000,000
    = **84,948,407,430,977,500,000,000 yocto
    (0.0849484074309775 NEAR)**, and the owner approved sending
    exactly that. Sent via near-api-js 7.4.0 `Account.transfer`
    (single Transfer action) — tx
    **`3rt2FniuvobUtrT67bBvo31NZhARvJxNbP3LujGKnFkt`**, final
    status **SuccessValue** (verified via RPC `tx`). The
    transfer created the user's account, which now holds exactly
    the amount sent — no deduction at the recipient. Return fees
    burnt: **7,114,989,537,500,000,000,000 yocto
    (0.0071149895375 NEAR)**, confirmed identically by the tx
    `tokens_burnt` sum and by the balance delta. Sender dust
    remaining on the implicit account: **492,452,918,750,000,000
    yocto (0.00049245291875 NEAR)**. `bounden.near` untouched at
    exactly 0.1 NEAR.
  - **Final reconciliation of the user's 0.2 NEAR (verified,
    yocto-exact):** 0.1 seeded in `bounden.near` +
    0.0074441501127725 claim cost + 0.0849484074309775 returned +
    0.0071149895375 return fees + 0.00049245291875 dust remaining
    = **0.2 NEAR exactly** (200,000,000,000,000,000,000,000
    yocto). Nothing else was spent. The return obligation is
    closed.

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
