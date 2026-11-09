# Bounden — Stage 4 Shade Agent: Feasibility Spike

**Status: SPIKE ONLY (Mon 9 Nov 2026).** Research + integration design +
a non-Docker adapter sketch. Nothing was deployed, no account was
created, nothing was registered, no faucet was touched. The main-line
testnet deployment is blocked elsewhere (PREFLIGHT §7) and this spike
did not touch it.

**Verdict: RISKY — feasible inside the one-day time-box only under
narrow conditions, with the pre-authorised fallback the likely ship.**
Details and the hour budget are in §5. The single biggest reason is not
the Shade framework itself (it is real, TypeScript-native, and maps
onto Bounden unusually well) — it is that **the Shade deploy path is
Docker end-to-end and this build VM has no Docker** (`docker: command
not found`, verified during this spike), so the real build must run
from a Docker-capable machine that does not yet exist in our setup.

---

## 1. What the primary sources actually say

All load-bearing claims below are quoted from the **Shade Agent
Framework monorepo** (`github.com/NearDeFi/shade-agent-framework`,
cloned and read at depth 1 during this spike; docs under `docs/`,
README at repo root). NEAR's own docs site now points here:

> "After April 19th, 2026, the Shade Agent Framework will no longer
> maintained as standalone developer tooling. Its documentation has
> been moved to the Shade Agent monorepo and is available here:
> https://github.com/NearDeFi/shade-agent-framework/tree/main/docs.
> While the framework remains open source, it will no longer be
> actively maintained."
> — docs.near.org, "Shade Agents (deprecated)"

That deprecation is the spike's most consequential finding. See §1.6.

### 1.1 The current template and its getting-started steps

The standalone template repo is
`github.com/NearDeFi/shade-agent-template` — "a simple Shade Agent
built with Hono and written in **TypeScript** that acts as a verifiable
ETH price oracle" (framework docs, *Deploying an Agent*). The monorepo
also carries in-tree copies (`shade-agent-template/`,
`shade-contract-template/`) that "rel[y] on local dependencies and
[are] used for development of the framework".

The documented deploy flow (same doc), verbatim steps:

1. Install the CLI: `npm i -g @neardefi/shade-agent-cli`
2. "Set up **Docker**" — install Docker, create an account, `docker login`.
3. "Set up a free **Phala Cloud** account at
   https://cloud.phala.network/register, then get an API key from
   https://cloud.phala.network/dashboard/tokens."
4. Clone the template.
5. `shade auth set all testnet create-new` — sets up NEAR + Phala
   credentials; the CLI generates a sponsor account.
6. Fill `deployment.yaml`: a unique `agent_contract.contract_id` and
   `build_docker_image.tag` (a Docker Hub tag you own).
7. Create `.env` with `AGENT_CONTRACT_ID`, `SPONSOR_ACCOUNT_ID`,
   `SPONSOR_PRIVATE_KEY` (values from the CLI).
8. Local mode: `environment: local` in `deployment.yaml`, run
   `shade deploy`, then `npm run dev` (app on http://localhost:3000),
   then `shade whitelist` with the agent account ID the app prints.
9. TEE mode: `environment: TEE`, `shade plan`, then `shade deploy`.
   "The CLI will output the URL of your app."

The template's shape (framework docs, *Key Components*): `src/index.ts`
initialises the Shade client, registers the agent, defines Hono
routes; route files hold business logic; an agent contract (Rust,
reference implementation) lives alongside. Template dependencies
(monorepo copy, package.json): `hono`, `@hono/node-server`,
`@neardefi/shade-agent-js` (the Shade Agent API library),
`chainsig.js`, `ethers`, `dotenv`, `tsx`.

Inside `src/index.ts`, registration is library calls, not ceremony:

- `ShadeClient.create({ networkId: "testnet", agentContractId,
  sponsor: { accountId, privateKey }, derivationPath })`
- funding check: "the agent [is] **funded** with 0.3 NEAR via the
  `sponsor` account using the `agent.fund()` method" (top-up when
  balance < 0.2 NEAR)
- a retry loop calling `agent.register()` until whitelisted/registered
- "Since registrations expire (every 7 days by default), an interval
  is set to **re-register** the agent every 6 days."

### 1.2 What testnet registration actually requires

There is **no separate Shade registry contract** and no whitelist of
developers. Registration is a method on **your own agent contract**,
which you deploy yourself (the CLI does it from `deployment.yaml`):

> "When an agent is booted up in a TEE, it generates a random
> **ephemeral private key** and **NEAR account**."
> "The agent calls the `register_agent` function on the **agent smart
> contract**, providing its **attestation**."
> — *Introduction*

> "The `register_agent` function verifies that the agent is running
> in a TEE, is executing the expected code (as defined by the approved
> measurements), and is running on a certain machine (as defined by
> the approved PPIDs). Upon successful verification, the agent's
> account ID becomes registered and gains access to agent-gated
> functions."
> — *Introduction*

Costs and gates, from the agent-contract reference
(`docs/reference/agent-contract.md`):

- Contract init takes `requires_tee`, `attestation_expiration_time_ms`,
  `owner_id`, `mpc_contract_id` — "Set to v1.signer-prod.testnet for
  testnet, v1.signer for mainnet" (the Chain Signatures MPC contract).
- `register_agent` is `#[payable]`: "An agent must attach 0.00486 NEAR
  to cover its own storage cost in the contract" (the
  `STORAGE_BYTES_TO_REGISTER` constant).
- The template's `deployment.yaml` funds a freshly deployed agent
  contract account with **8 NEAR** (`deploy_custom.funding_amount: 8`)
  and the framework's own in-TEE test suite wants a testnet account
  "with at least 20 testnet NEAR" (monorepo README, Testing section).
- Owner-side approvals are separate owner-only calls the CLI performs
  during deploy: `approve_measurements` and `approve_ppids`.
- **No fee to NEAR or Phala is documented for registration itself.**
  The external accounts required are: a funded testnet sponsor
  (created by `shade auth`), a Docker Hub account (image push), and a
  Phala Cloud account + API key (TEE hosting). Phala Cloud pricing is
  **not** stated in the framework docs — UNVERIFIED whether the free
  tier covers a hackathon-scale deployment; the docs only say the
  account is "free" to set up.
- Local mode replaces attestation with an owner-managed whitelist
  (`whitelist_agent_for_local`): "The **whitelist** applies only in
  **local mode**. It defines which account IDs may call
  **agent-gated methods**, since in local mode, the contract cannot
  verify that an agent is running approved code." A contract with
  `requires_tee = true` panics on whitelisting.

### 1.3 Code identity: measurements, not a code hash — and the mapping

Bounden today pins a **source hash**: `agent_code_hash` on the shop
contract, set by owner-only `set_agent`, computed by
`computeWorkerCodeHash()` as SHA-256 over the worker's `src/*.ts`
(file names + contents, sorted). `worker/src/leash.ts` already
anticipates Stage 4 in its own comment: "(The production form of this
is the Shade Agent code hash from TEE attestation — Stage 4; the
contract field and the registration flow are identical.)" That last
clause is **wrong in one detail**, and the spike exists to catch
exactly this: in the Shade framework the thing pinned on-chain is not
a hash of source files. It is a set of **TEE measurements**:

> "The measurements are hashes that uniquely identify the code
> running in the TEE, and the platform it's running on. … There are 6
> measurements:
> - **MRTD**: Measures the initial setup of the trusted domain. This
>   is constant.
> - **RTMR0**: Measures the virtual hardware. …
> - **RTMR1**: Measures the kernel. This is constant.
> - **RTMR2**: Measures the Dstack image version. …
> - **Key Provider Digest**: Measures the key provider of the TEE. …
> - **App Compose Hash**: Measures the application. This is constant
>   for a given Docker Compose file and app layer configurations."
> — *Terminology*

Only one of the six identifies *our* code: the **App Compose Hash**,
"the hash of the Docker Compose file and app layer configurations"
(*Reproducibility* doc). It binds the compose file, which must
reference the worker's Docker image **by SHA-256 digest, never by
tag**: "Never reference Docker images by `latest` … Always reference
versions of the image you want to use via **hash**" (*Security
Considerations*); likewise "every `FROM` line must pin its base image
by digest" (*Reproducibility*).

**Mapping onto Bounden.** `set_agent(agent_account_id,
agent_code_hash)` does not need to change shape:

- Today: `agent_code_hash` = SHA-256 over worker sources — an
  *owner-asserted* value. Nothing on-chain proves the running worker
  produced it; it is a tripwire, not a proof.
- Stage 4: the same field carries the **App Compose Hash** of the
  deployed Shade worker, and the *proof* moves into a new verification
  step (§2): the shop contract (or a thin registry wrapper) stores the
  approved measurements + PPIDs and accepts the agent only after
  `register_agent`-style attestation verification via the framework's
  `shade-attestation` Rust crate — "a published Rust crate to verify
  Shade Agent TEE attestations in NEAR smart contracts" (monorepo
  README). The crate checks the Dstack quote/collateral, TCB status
  ("UpToDate", no outstanding advisory IDs), report data, PPID, and
  measurements including the app compose hash.
- The attestation is **bound to the agent's key**: "The attestation's
  **report data** must contain the NEAR account ID of the agent. This
  binds the attestation to the same TEE where the agent's key was
  created to prevent replay of valid attestations." The reference
  contract further requires that account to be an **implicit account**
  (64-char lowercase hex) — a real constraint on Bounden's agent
  identity; see §2.3.
- Practical consequence: any worker change → new Docker image → new
  digest → new app compose hash → owner must approve new
  measurements. The framework's documented upgrade flow is exactly
  that: "approve a new set of measurements, allow a transition period
  …, then remove the old measurements." Our Stage 2 source hash
  changes on *any* source edit; the Shade hash changes only on a
  *redeploy*. They are different granularities and the README must not
  conflate them.

### 1.4 The caveats, quoted

The audit warning exists, twice, in the framework's own words:

> "This technology has not yet undergone a formal audit. Please
> conduct your own due diligence and exercise caution before
> integrating or relying on it in production environments"
> — monorepo README (GitHub warning banner)

> "After April 19th, 2026, the Shade Agent Framework will no longer
> maintained as standalone developer tooling. … While the framework
> remains open source, it will no longer be actively maintained."
> — docs.near.org (see §1)

Further caveats from the framework's *Security Considerations* doc
that matter for a money-handling cashier:

- "TEE confidentiality is not absolute — recent disclosures like
  TEE.fail have shown that a host with physical access can extract
  secrets from Intel TDX through hardware side-channel attacks, which
  could include an agent's private keys."
- "Disk state is **not wiped on app upgrades**. … A future malicious
  upgrade can read everything previous versions wrote: derived keys,
  cached credentials, user data, anything." And: "The CVM may be
  rescheduled to a different instance and there is no guarantee that
  the disk follows. … Your agent should be able to recover from a
  cold start." **This directly hits Bounden's vault design** — see
  §2.4.
- "The agent's **ephemeral keys should not be stored** anywhere,
  including on the host machine."
- Duplicate-action warning for redundant agents: with multiple
  identical agents live, "all agents will respond to triggers … You
  must ensure that the Shade Agent collectively performs the desired
  action only **once**." (Bounden's contract already enforces
  fulfil-exactly-once by state machine — `Paid` only, second fulfil
  panics — so this framework-level hazard is largely pre-solved by
  the constitution. Stated here so the Stage 4 build doesn't
  re-litigate it.)
- Registration expiry: registrations are validity-windowed
  (`attestation_expiration_time_ms`; template default 7 days), so a
  long-lived cashier must re-register on a timer (the template uses 6
  days). For a hackathon demo this is a non-issue; for the "real
  product" framing it is an operational fact worth one README line.

### 1.5 Can the existing TypeScript worker run inside the template?

**Mostly yes — the stack matches; the shape does not.** The framework
expects TypeScript agents ("Agents are written in TypeScript/
JavaScript using the **Shade Agent API**, and agent contracts are
written in Rust"), Node in a Docker container, driven through
`@neardefi/shade-agent-js`. Bounden's worker is TypeScript/Node
(near-api-js 7.4.0). But the template's agent is an **HTTP service**
(Hono routes, called by a frontend/user), while Bounden's worker is a
**poll-loop daemon** with no inbound API. Concrete deltas:

| # | Delta | Size |
|---|---|---|
| D1 | **Containerisation.** Worker needs a `Dockerfile` (base image pinned by digest) + `docker-compose.yaml` whose image reference is a digest. The worker today is run from source with `tsx`/build output and local file paths. | Small, mechanical |
| D2 | **Entrypoint shape.** Add a thin Shade bootstrap (`ShadeClient.create` → `agent.fund()` check → `agent.register()` + 6-day re-register timer) and a minimal HTTP surface (Hono, template-style) exposing at least a health/agent-info route — Phala's deployment model and the CLI's flow expect a reachable app. The existing poll loop (`worker/src/index.ts` → `BoundenWorker`) runs unchanged *inside* that process once registration succeeds. | Small–medium |
| D3 | **Key custody inversion — the deep one.** Today the worker loads a credentials file from the vault and its startup leash check verifies that file's key on-chain. In Shade mode the agent's key is **ephemeral and generated in-enclave** ("exclusively used to call the agent contract"); there is no key file, and keys must not be persisted. Signing path changes: NEAR-native calls the agent makes itself use its ephemeral key; anything beyond the agent contract goes through the contract's agent-gated methods (the framework's pattern is `request_signature` via Chain Signatures / `agent.call()`). Bounden's design must decide (see §2.2) whether `fulfil_order`/`issue_refund` are called *by* the ephemeral key directly against the shop contract, or routed *through* a Shade agent contract. | Medium; design decision, §2 |
| D4 | **Vault relocation.** The AES-256-GCM sealed-inventory vault is a local directory (`BOUNDEN_VAULT_DIR`) whose key file lives outside the repo. In a Phala CVM, local disk is neither persistent nor upgrade-safe (§1.4). The vault must move to encrypted storage the enclave can re-derive or re-fetch at cold start (e.g. ciphertext in contract-adjacent storage or an owner-operated endpoint, key derived in-enclave), and the worker must tolerate cold starts with no disk. This is the least "modest" delta. | Medium–large |
| D5 | **Startup leash verification changes target.** `index.ts` currently verifies (a) the loaded key is the two-method FC key on the shop contract, (b) the contract's registered agent == this account. In Shade mode (a) is replaced by: registration status + approved measurements read from the agent/registry contract; (b) stays. If the §2.2 "direct call" option is chosen, the FC leash itself is created *for* the ephemeral key — which is re-created per enclave instance, so leash creation becomes part of registration, not a one-off setup script. `create-leashed-key.ts` does not survive unchanged. | Medium |
| D6 | **Code-hash pinning changes meaning.** `computeWorkerCodeHash()` (source SHA-256) is replaced, for the on-chain pin, by the CLI-computed app compose hash (§1.3). The source hash can remain as a build-time artefact in NOTES, but `set_agent`'s value becomes the compose hash and the owner approval flow becomes `approve_measurements` + `set_agent` together. | Small |
| D7 | **Accounts & funding plumbing.** `shade auth` creates a sponsor account that funds the agent (0.3 NEAR top-ups) and can deploy/fund the agent contract (template default 8 NEAR). Bounden needs those testnet funds from the same faucet-gated pool as everything else (§5 risk note), plus Docker Hub and Phala Cloud accounts (owner steps or agent-with-grant steps — to be decided at build time, not in this spike). | Small, but gated |

What does **not** change: the worker's core (`BoundenWorker` poll
loop, order probing, refund band pre-checks, attestation-provider
seam, redacting logger), the shop contract's order state machine, and
the storefront. The Shade work is a shell around the worker, plus the
vault move.

### 1.6 The deprecation problem (challenge-first note)

The research brief assumed a living Phala/Dstack template. The
primary source says the framework's standalone tooling stops being
maintained after **19 April 2026** — which, on this project's calendar
(November 2026), is **already past**. The code is open source and the
docs are intact (this spike read them from a fresh clone), and the
in-TEE test suite exists; but there is no maintainer to unblock us if,
say, the CLI's Phala integration or a dcap-qvl collateral endpoint has
rotted since April. This does not make Stage 4 impossible. It makes
its failure mode *unfixable-by-escalation*: if registration fights
back, there is nobody to ask. That is precisely the condition the
plan's fallback was written for, and it raises the fallback's prior
probability — reflected in the §5 verdict.

Also flagged for honesty: the hackathon's own HACKATHON.md points at
Shade Agents as a supported pattern (recorded in PREFLIGHT-era
research), so a *working* Shade deployment still reads as
sponsor-aligned to judges even on unmaintained tooling. A *failed*
one, described honestly, reads as engineering judgement. A faked one
is disqualifying. Those are the only three doors.

---

## 2. Integration design: Shade inside the constitution

Design rule, unchanged from PLAN: **the constitution does not move.**
Same shop contract state machine, same price/refund bands, same
treasury lock, same two-method leash. Stage 4 changes *who holds the
leash key and how we know*, never *what the leash allows*.

### 2.1 Target architecture

```
                 ┌────────────────────────────────────────────┐
                 │  Phala CVM (Intel TDX)                     │
                 │  Shade bootstrap (register + re-register)  │
                 │  BoundenWorker poll loop (unchanged core)  │
                 │  Vault: ciphertext fetched, key in-enclave │
                 └───────┬───────────────────┬────────────────┘
        register_agent   │                   │ fulfil_order /
        (attestation)    │                   │ issue_refund (FC key)
                 ┌───────▼──────────┐  ┌─────▼──────────────────┐
                 │ Registry contract│  │ Shop contract          │
                 │ (Shade ref impl: │  │ (the constitution —    │
                 │  measurements,   │  │  UNCHANGED methods)    │
                 │  PPIDs, agents,  │  │  set_agent now gated:  │
                 │  shade-attest.   │  │  agent must be a valid │
                 │  crate verify)   │  │  registered Shade agent│
                 └──────────────────┘  └────────────────────────┘
```

Two contracts, deliberately. The Shade framework's reference agent
contract is a chunk of attestation machinery (Dstack quote
verification via `shade-attestation`, measurement/PPID sets,
registration expiry) that has no business inside the money contract.
Bounden keeps it in a **separate registry contract** — the framework's
reference implementation, minimally adapted — and the shop contract
gains exactly one new check, at registration time only.

### 2.2 The one real design decision: how does the cashier call the shop?

**Option A — direct call, registry as gatekeeper (RECOMMENDED).**
The enclave agent keeps an ephemeral key; after `register_agent`
succeeds in the registry, the owner (or an automated owner-side step
in `shade deploy`'s post-flow) calls the shop's existing `set_agent`
with the agent's account + the app compose hash. The cashier then
calls `fulfil_order` / `issue_refund` on the shop contract **directly**
with a function-call key allowlisted to exactly those two methods —
identical to Stage 2. The registry's role is *admission*: `set_agent`
is only ever called for an account that is a currently-valid
registered agent in the registry (checked by the owner at setup, and
re-checkable by anyone via the storefront's Constitution page, which
can render both the shop's `agent_code_hash` and the registry's
approved measurements side by side).

- Pros: the shop contract changes **zero** method behaviour; the FC
  leash — the thesis artefact — survives byte-for-byte; the demo's
  attack suite runs unchanged against the Shade cashier.
- Cons: the binding between "registered in the registry" and
  "registered in the shop" is an owner action, not a cross-contract
  proof. A sceptical judge can be shown both objects on-chain, but
  the shop does not *itself* verify the attestation at call time.
- Mitigation within scope: at worker startup (D5), the Shade worker
  verifies its own registry registration is valid *and* that the
  shop's pinned compose hash equals the app compose hash of its own
  deployment (read from the registry's approved measurements); mismatch
  → exit, extending the Stage 2 "refuses to start unless its leash is
  verifiably in place" behaviour rather than weakening it.

**Option B — routed calls through a Shade agent contract.**
`fulfil_order`/`issue_refund` become agent-gated methods on a Shade
agent contract that in turn calls the shop contract. This is the
framework's native pattern (`request_signature`-style gating), and it
makes the shop's trust in the agent purely attestation-based.

- Cons (decisive): the shop contract would have to trust the agent
  contract's account as its registered agent — i.e. the *contract
  account*, holding a full-access relationship, becomes the caller,
  and the two-method FC key leash is replaced by "whatever the agent
  contract chooses to forward". That is a *weaker, less legible*
  constitution, and it rewrites Stage 1/2 artefacts the demo is built
  on. **Rejected.** Bounden's thesis is that the leash is the story;
  Option B trades the story for framework orthodoxy.

### 2.3 Constraints the framework imposes on Bounden (accepted, documented)

1. **Implicit agent account.** The reference `verify_attestation`
   requires the agent's account ID to be an implicit account (64-char
   hex) because report data binds the raw account bytes. Bounden's
   Stage 2 plan named the cashier `cashier.bounden.testnet`. Under
   Shade, the cashier's on-chain identity is a hex account; the named
   account can remain as the shop/registry owner-facing label (and
   can hold the sponsor role), but the Constitution page must present
   the hex ID as the agent of record. Cosmetic cost only — arguably a
   better demo: the cashier's identity *is* a key fingerprint.
2. **Registration expiry.** Default 7-day validity; the worker
   re-registers every 6 days (template pattern). One timer in the
   bootstrap (D2).
3. **Sponsor funding.** The ephemeral agent needs gas money it cannot
   earn before it exists: the sponsor (owner-controlled) funds it
   (0.3 NEAR top-ups; `register_agent` itself needs 0.00486 NEAR
   attached). The FC key's 0.25 NEAR allowance model from Stage 2
   maps onto this: sponsor → agent funding is a new, public, bounded
   flow the Constitution page should list.
4. **Approved-measurements gas limit.** "If the approved measurements
   list grows too large, registration could fail due to the function
   call running into the **gas limit**." Keep exactly one approved
   measurement set live; rotate by replace, not accumulate.
5. **No local-mode leakage into production.** The framework's own
   guidance is to strip local mode from a production contract. Our
   registry is testnet-demo scope; we keep local mode for development
   but the deployed registry is initialised `requires_tee: true`, and
   the README says which mode the deployed registry runs. (For the
   demo film, local mode is also the rehearsal path — see §4.)

### 2.4 The vault problem (the design's soft underbelly)

PLAN says: "Plaintext codes live in the worker's **encrypted vault**
off-chain; the worker is the only decryptor (inside the TEE when
running as a Shade Agent)." Stage 2 implemented the vault as an
AES-256-GCM state file in a local directory with a key file beside
the deployment. The framework's security doc forbids both halves of
that in a CVM: disk may not follow the agent, and disk survives
upgrades into hostile hands (§1.4). Stage 4 vault design:

- **Ciphertext is public-safe by construction** (AES-256-GCM,
  per-order delivery re-encryption already designed in Stage 2/3), so
  store the ciphertext *outside* the enclave: as a small owner-operated
  HTTPS blob endpoint, or chunked into the registry contract's storage
  if size allows (demo inventory is five fake codes — trivially
  small; production inventory handling stays a documented owner-side
  concern, as the README already frames it).
- **The vault key is derived in-enclave, never written down**: derive
  from the agent's identity via the framework's key-derivation path
  (Chain Signatures derivation is the framework's persistence trick —
  "any instance of an agent running the same code inside a TEE can
  access the same accounts" — the same derivation pattern yields a
  stable vault key for any *valid* instance and for no one else).
  Exact derivation API to be confirmed against `shade-agent-js` in
  the build's first hour; if no suitable derivation exists, fallback
  is an encrypted-key envelope fetched from the owner endpoint and
  unsealed only inside the enclave — weaker, and if we land there the
  README says so.
- **Cold start is a normal path**: boot → register → fetch ciphertext
  → derive key → decrypt in memory → poll. No state on disk beyond
  logs. This also fixes a Stage 2 wart (crash-reservation
  reconciliation against a state file) by moving reservation state
  on-chain-adjacent: the contract's order state already is the
  source of truth the worker reconciles from.

If the vault move cannot be completed and verified inside the
time-box, that alone is sufficient reason to invoke the fallback:
a Shade cashier that cannot fulfil orders is a screensaver.

### 2.5 What the demo gains

Act 2's closer changes from a true statement to a *provable* one:

- Stage 2/3 version: "Here is the complete list of things I am able
  to do" (the FC key's permission object) — already strong.
- Stage 4 adds, on the Constitution page and in the film: the
  registry's registration record for the cashier — measurements, PPID,
  validity window — next to the shop's pinned app compose hash, and
  the line: **"This cashier's key was generated inside a TEE. No
  human has ever held it — not the owner, not the developer. The
  contract checked the hardware's proof before it let the key near
  your money, and the key can still only do two things."**
- The attack suite gains a sixth, free case: *run a modified worker*
  (one byte changed → new image digest → measurements not approved)
  and watch `register_agent` refuse it. That is a live, reproducible
  attack the plain worker cannot offer, and it is the single most
  judge-legible artefact Stage 4 can produce.

### 2.6 Failure modes

| Failure | Detection | Response |
|---|---|---|
| `register_agent` rejects attestation (stale collateral, TCB advisory, measurement mismatch) | Registration loop never succeeds; CLI/Phala logs | Time-boxed debug (≤2 h, §5); then fallback. Do NOT weaken to local mode on the deployed registry and call it TEE. |
| CLI or Phala integration rotted since Apr 2026 deprecation | `shade plan`/`shade deploy` errors against live services | No escalation path exists. Fallback. |
| Docker unavailable on the machine doing the build | `docker` missing (true of the current build VM) | Build must move to a Docker-capable host (user's VPS agent environment or a fresh cloud VM) — decided BEFORE the Stage 4 day starts, not during it. |
| Vault derivation path doesn't exist in shade-agent-js as expected | First-hour API check | Envelope fallback (§2.4); if that also slips, fallback overall. |
| Registration succeeds but expires mid-demo | `attestation_expiration_time_ms` set too short | Init registry with a generous window for the demo (e.g. 30 days) — a documented demo parameter, not hidden. |
| Duplicate fulfil attempts from a second instance | Contract state machine (`Paid` only) | Already safe at the constitution layer; no work. |
| Phala free tier insufficient / account friction | Deploy step | Owner step; if it stalls >1 h, fallback rather than burn the day. |

### 2.7 The fallback, word for word

If Stage 4 does not land, the README's Stage 4 status paragraph is
replaced with exactly this (pre-written now so nobody improvises it
under deadline pressure):

> **Stage 4 (Shade Agent / TEE) — not shipped, by decision.**
> Bounden's cashier runs as the plain Stage 2 worker. We spiked the
> Shade Agent swap (design: `docs/SHADE.md`) and chose not to ship
> it in this build: the Shade Agent Framework's standalone tooling
> stopped being maintained in April 2026, its deploy path requires a
> Docker-capable host this build did not have, and the swap was not
> verified end-to-end inside its one-day time-box. Nothing about the
> shop's security depends on it. The cashier's authority is the
> two-method function-call key and the contract's bands — both live,
> both inspectable on-chain — and the TEE was always layer three: it
> would have proven *where the key lives*, never *what the key can
> do*. The design, the integration points, and the exact remaining
> steps are documented in `docs/SHADE.md` for the next build.

And if Stage 4 *does* land, the README instead gains the §2.5
paragraph and a link to the registry's registration record. Either
way the README never claims a TEE it cannot link to.

---

## 3. Scaffold

Per the spike's rules: the template is clonable (the monorepo cloned
cleanly), but **Docker is unavailable on this VM** — verified:
`docker: command not found`, and Docker is a hard prerequisite of
every documented Shade path (CLI deploy, image build, `shade
reproduce`, even local mode runs through the CLI's Docker flow). So
the scaffold is limited to a **non-Docker adapter sketch** in
`shade/`: the mapping of the worker's entry points onto the
template's expected shape, as code-shaped documentation. It is marked
SCAFFOLD — NOT DEPLOYED, NOT REGISTERED in its header, it is not
wired into the worker package, and its `package.json` deliberately
has no installable dependency on `@neardefi/shade-agent-js` pinned
from a registry version this spike did not verify — the version is
resolved by `npm i` at real build time (the monorepo develops the
library in-tree; the published version must be checked then, not
guessed now).

Sketch contents (`shade/src/index.ts`): ShadeClient bootstrap
(create → fund check → register loop → 6-day re-register), a minimal
Hono surface (`/api/agent-info`, `/api/health`), and the handoff
point where the existing `BoundenWorker` poll loop starts once
registration succeeds — with the Stage 2 startup leash check replaced
by its Shade equivalent (D5) as an explicit TODO-shaped function that
throws "not implemented in scaffold" rather than silently passing.
`shade/README.md` states what it is and is not.

---

## 4. Rehearsal path (how the real build de-risks itself)

The framework's local mode exists precisely so the integration can be
built and tested without a TEE: same contract code with
`requires_tee: false`, whitelist instead of attestation, mock
measurements. The real Stage 4 build therefore runs local-first:
bootstrap + registry + shop binding proven locally (on a
Docker-capable host), then flipped to `environment: TEE` for the
Phala deploy. If the flip is the only thing that fails, the failure
is isolated to attestation/Phala — and the fallback decision (§2.7)
can be taken with evidence instead of vibes.

---

## 5. Time-box verdict

**VERDICT: RISKY.** Feasible in one day *only if* all four
preconditions are met before the day starts; otherwise the honest
expectation is the fallback, and Stage 5's schedule should be planned
as if the fallback ships, with Stage 4 as upside.

Preconditions (none currently true):

1. A **Docker-capable build host** is available (this VM has no
   Docker; the deploy, image build, and measurement reproduction all
   require it).
2. **Testnet funding is unblocked** (the registry deploy + sponsor +
   agent funding need roughly 10–20 testnet NEAR across accounts; the
   main line is still at the faucet wall, PREFLIGHT §7).
3. **Phala Cloud + Docker Hub accounts** exist with API keys in the
   vault (owner/grant steps).
4. The worker's Stage 2/3 live pass is already done, so Stage 4 swaps
   a *proven* worker rather than debugging two stages at once.

Hour budget for the day itself (8 working hours, one builder):

| Block | Hours | Risk |
|---|---|---|
| Local-mode integration: bootstrap, registry deploy (local), shop binding, leash-check rewrite (D2, D5, D6) | 2.0 | Low — library calls are documented, template-shaped |
| Vault relocation: ciphertext out of the CVM, in-enclave key derivation, cold-start path (D4) | 2.0 | **High** — least-documented surface; derivation API unverified |
| Docker image + compose, digest pinning, reproducible build hygiene (D1) | 1.0 | Medium — first Docker build of this worker; base-image digest pinning is fiddly |
| TEE flip: `shade plan`, measurements/PPID approval, Phala deploy, `register_agent` on testnet | 1.5 | **Highest** — the riskiest step (below) |
| Demo wiring: Constitution page registry panel, attack case 6, README | 1.0 | Low |
| Buffer / write-up | 0.5 | — |

**The riskiest step is the TEE flip**: the first real
`register_agent` against a `requires_tee: true` registry on testnet.
It is the first moment every untested layer must agree at once —
Dstack quote collateral freshness, TCB status, PPID approval for
Phala's fleet, measurement computation from *our* compose file — on
tooling unmaintained since April 2026, with no maintainer to ask.
Every other step can be rehearsed in local mode; this one cannot,
by definition. If it is not green within 2 hours of first attempt,
the fallback (§2.7) triggers and the remaining hours go to Stage 5.
That trigger is a decision rule, not a mood.

**Blunt summary for Stage 5 planning:** plan the film and the
submission around the plain worker (it is complete, attack-tested,
and the thesis does not need the TEE). Treat a landed Shade
deployment as a one-scene upgrade to Act 2's closer plus a
Constitution-page panel — both pre-designed above so that, if the
flip goes green early, integration is an hour, not a scramble; and
if it doesn't, nothing in Stage 5 was built on sand.

---

## 6. Sources

Primary (read directly during this spike, 9 Nov 2026):

- Shade Agent Framework monorepo — `github.com/NearDeFi/shade-agent-framework`:
  root README (audit warning; repo contents; testing/funding notes),
  `docs/getting-started/introduction.md`,
  `docs/getting-started/quickstart-deploying.md`,
  `docs/getting-started/quickstart-components.md`,
  `docs/reference/agent-contract.md`,
  `docs/reference/cli.md`,
  `docs/concepts/framework-overview.md`,
  `docs/concepts/terminology.md`,
  `docs/concepts/security.md`,
  `docs/concepts/reproducability.md`,
  `shade-attestation/README.md`,
  `shade-agent-template/deployment.yaml` + `package.json`,
  `shade-agent-js/src/api.ts` (method surface).
- NEAR docs, "Shade Agents (deprecated)" —
  `docs.near.org/ai/shade-agents/getting-started/introduction`
  (deprecation notice and pointer to the monorepo).

Not used: third-party explainers and blog templates (ADK-TS etc.)
were consulted only to locate the primary repos and are not cited
for any load-bearing claim. Phala Cloud pricing and the published
`@neardefi/shade-agent-js` registry version are UNVERIFIED (see
§1.2, §3) and must be checked in the real build's first hour.
