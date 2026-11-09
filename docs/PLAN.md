# Bounden — Plan (approved)

**Bounden.** *The agent is bound. The money is not.*

A digital-goods shop on NEAR testnet, run end-to-end by an autonomous
agent whose authority is exactly two contract methods — `fulfil_order`
and `issue_refund` — exercised through an allowlisted function-call
access key. The shop contract is the constitution: catalogue, price
band, refund band, treasury. The agent cannot steal, redirect, or
over-refund, because those operations do not exist inside its authority.
Every power the agent holds is a public, inspectable on-chain object.

Built for the NEAR Hackathon "Build Beyond Boundaries" (submission
deadline Sun 15 Nov 2026, 00:59 WAT; internal ready target Sat 14 Nov
18:00 WAT). Tracks targeted: Autonomous Business (primary), Agent
Economy, Security.

## The product

- **Catalogue — global digital goods only.** Software licence keys, API
  credit codes, downloadable assets. No region-specific goods, no local
  currency anywhere in product, UI, or copy. Neutral English first.
- **Pricing in USD terms; settlement in a stablecoin.** Prices are
  stored on-chain in the settlement token's base units. Testnet
  settlement token: `usdc.testnet` (USDC, 6 decimals — verified live,
  see PREFLIGHT.md).
- **A template, not a one-off.** Bounden is the reference instance of an
  open constitution any agent-run digital-goods business can adopt.

## Architecture

1. **Shop contract (Rust, near-sdk) — the constitution.** Owner,
   registered agent identity + pinned code hash, catalogue, order state
   machine (`Created → Paid → Fulfilled / Cancelled / Refunded /
   RefundRejected`), price band (max bps move per update), refund band
   (cap + window), treasury withdrawable by the owner only.
2. **The cashier (agent worker).** Holds a function-call key allowlisted
   to `fulfil_order` + `issue_refund` on the shop contract, with a
   bounded allowance. That key is the whole of its NEAR power. Later
   stages run the worker as a Shade Agent (TEE-attested, code hash
   pinned in the contract); the leash does not depend on the TEE.
3. **Judgement layer (NEAR AI Cloud).** Order sanity checks and refund
   judgements are made via NEAR AI Cloud TEE inference; the attestation
   hash for each consequential decision is written on-chain with the
   order, so a decision can be verified after the fact.
4. **Checkout.** A buyer pays the contract in the stablecoin
   (ft_transfer_call). A 1Click/Intents `dry: true` quote can be shown
   alongside as cross-chain price proof. Intents is mainnet-only: it is
   a proof, never the settlement rail, and we say so.
5. **Storefront.** Minimal web UI: catalogue, checkout, order status,
   and a public "Constitution" page listing every power the agent
   holds.

## How inventory stays secret on a public chain

NEAR contract state is public, so **no plaintext code ever touches the
chain**:

- On-chain, each inventory unit is a **commitment only**: the SHA-256
  hash of the code, its product, and a consumed flag.
- Plaintext codes live in the worker's **encrypted vault** off-chain;
  the worker is the only decryptor (inside the TEE when running as a
  Shade Agent).
- On fulfilment the worker re-encrypts the code to the **buyer's**
  ephemeral public key; only the delivery ciphertext's hash is logged
  on-chain. A leaked delivered code is one buyer's key leaked, not a
  platform breach. An explorer shows hashes and order states — never a
  usable code.

## Binding design rules

1. **Demo inventory is clearly fake.** Every demo code carries an
   unmistakable test marker (e.g. `BOUNDEN-TEST-0000-DEMO`); the
   storefront shows a "Demo inventory" notice; README documents real
   inventory handling + key rotation for production.
2. **Every attack is live and reproducible.** The attack suite ships in
   the repo as a runnable script with named cases (treasury drain via
   prompt injection, out-of-band refund, payout redirect, inventory
   dump, price-band violation). Each case prints the on-chain rejection
   it hit — transaction, error, and the exact layer that refused. The
   demo film records a live run; no screenshots of attacks, no staged
   outcomes.
3. **Honesty over theatre.** Testnet only for the shipped product;
   mainnet dust settlement is an optional stretch proof, never a
   load-bearing claim. Limitations are stated in the README, not
   discovered by judges.

## Stages and kill criteria

- **Stage 1 — Constitution.** Contract (catalogue, order states, bands,
  treasury lock, agent registry) + tests, deployed to testnet.
  *Kill criterion: if the contract is not deployed by end of Day 1, the
  refund path is cut — fulfil-only ships.*
- **Stage 2 — Leashed worker v1.** Worker fulfilling orders end-to-end
  via the allowlisted key; sealed-inventory vault; attack-tested.
- **Stage 3 — Judgement + storefront.** NEAR AI Cloud judgements with
  attestation hashes on-chain; checkout; minimal storefront;
  reproducibility pass (the AI screeners run the repo).
- **Stage 4 — Shade Agent swap.** Time-boxed to one day. If the TEE
  path fights back, ship the plain worker and state plainly in the
  README that keys + contract carry the thesis; the TEE is layer three.
- **Stage 5 — Proof and submission.** Attack suite polish, demo film
  under 60 seconds, README as a judge's walkthrough ("do X, see Y"),
  X demo post, one-shot submission form (uneditable — prepared and
  double-checked before sending).

**Cut order if the clock bites:** refunds first, then Shade, then the
mainnet dust settlement. The constitution and the attack demo are never
cut — they are the entry.
