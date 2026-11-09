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
[docs/DOWNLOADS.md](docs/DOWNLOADS.md) · Build notes: [NOTES.md](NOTES.md)

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
fabricating a hash. 21 new unit tests (51 worker tests total, all
passing, all network access faked). **Honest limit: the attestation
report's live response shape is NOT yet verified** — the fixtures are
hand-built from the docs and labelled DOC-DERIVED, UNVERIFIED-LIVE
(`worker/test/fixtures/README.md`); the parser throws a typed error
on any unrecognised shape, and verifying against the real API is the
first hour of the live pass. The **storefront** (`web/`, Next.js)
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

## Licence

MIT
