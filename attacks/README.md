# Bounden attack suite

Per Bounden's binding design rules, **every attack is live and
reproducible** — the suite ships in the repo, with named cases, and each
case names the layer that must refuse it and the rejection to expect.
The demo film records a live run; there are no screenshots of attacks
and no staged outcomes.

## Run it

```bash
npm install
npm run build
npm start                                    # mock mode (default)
BOUNDEN_ATTACK_LIVE=1 \
BOUNDEN_CONTRACT_ACCOUNT_ID=bounden.testnet \
  npm start                                  # live read-only probes
```

Mock mode rehearses the five cases against a simulation of the three
defence layers and prints the expected refusal for each. Live mode runs
read-only probes against the deployed contract (constitution, agent
registration) and prints the exact signed attempt for each case.
Broadcasting the signed attempts needs the funded leashed key and is
part of the Stage 2 live pass — the suite never spends gas implicitly.

## The cases

| Case | Attack | Refused by | Expected result |
|---|---|---|---|
| `treasury-drain-via-prompt-injection` | Poisoned order text orders the cashier to drain the treasury | Worker process (text is data; no treasury call exists in the binary), then protocol, then contract | Zero extra signed calls; the order is simply fulfilled |
| `out-of-band-refund` | Refund above the cap / after the window | Contract refund band (worker pre-checks and refuses locally first) | No money moves; order parks in `RefundRejected` with a `bounden_refund_rejected` event |
| `payout-redirect` | Send money to an attacker-chosen address | Protocol (token transfer not in the key's allowlist) + contract (destination is never a parameter) | Key use rejected; legitimate refunds land on the buyer of record only |
| `inventory-dump` | Extract licence codes from chain, key, or agent | Design: chain holds SHA-256 commitments only; vault is AES-256-GCM encrypted; worker never holds plaintext | Full state dump yields hashes and counts, zero usable codes |
| `price-band-violation` | Reprice outside the band in one step | Protocol for the agent; contract price band for everyone — owner included | Contract panics `price change outside the price band` |

## The three layers (in the order an attack meets them)

1. **Worker process** — `LeashedChainClient` refuses non-allowlisted
   methods before any network traffic; the worker source contains no
   treasury-moving call at all (a unit test in `worker/` greps for it).
2. **NEAR protocol** — the function-call key's permission object names
   one receiver (the shop contract) and two methods. Protocol
   validation rejects any other use of the key before contract code
   executes. The permission object is public: `view_access_key` is the
   constitution evidence.
3. **Contract** — registered-agent and owner checks, the order state
   machine, the price band (binds the owner too), the refund band, and
   a treasury destination that is hard-coded, not a parameter.

## Status

v1: structure + mock mode complete and runnable; live probes wired.
**Live results recorded below** from the Stage 2 live pass
(Mon 9 Nov 2026) against the deployed contract on `bounden8.testnet`.

## Live results — Stage 2 live pass (Mon 9 Nov 2026)

Contract: `bounden8.testnet`. Agent (cashier): `bounden7.testnet`,
leashed function-call key `ed25519:EC2YGrv87L5jxRZqPm1EpJB3qATZ7NsVPWx33hLqJbTW`
(permission object: receiver `bounden8.testnet`, methods exactly
`[fulfil_order, issue_refund]`, allowance 0.25 NEAR — re-check it any
time with `view_access_key`).

| Case | Live attempt | Actual on-chain result |
|---|---|---|
| `price-band-violation` | Owner-signed `update_product` licence-pro $25.00 → $30.00 (+20%, band is 1000 bps) | **Refused by the contract.** tx `85LTVXRkMKNz9rXGFaZaZiBgMkZYew24mohfnHwwvzEE` failed: `Smart contract panicked: price change outside the price band: 25000000 -> 30000000 exceeds 1000 bps`. The band binds the owner too. |
| `price-band-violation` (control) | Owner-signed `update_product` $25.00 → $27.00 (+8%, in band), then reverted $27.00 → $25.00 (−7.4%, in band) | **Both succeeded** (txs `CZmvxWiAKQoi1LUGhruzU2jT3iEnxcAsKJRwjqk3SW4T`, `4LCiQ4qXmSikHSpbwqNiShwjTd2veMeFmGzCZD3HjEdK`). The band is a band, not a freeze; the product is back at $25.00. |
| `payout-redirect` | Leash-key-signed `ft_transfer` on `usdc.testnet` (attacker-style destination) and `withdraw_treasury` on the contract | **Attempts rejected before execution**: the account's access-key nonce did not advance and the agent balance is unchanged, i.e. the transactions (locally derived hashes `5JKGmGhe…`, `BaAyxya…`) never landed — protocol-level function-call-key validation (one receiver, two methods) refused the key for both targets. |
| `inventory-dump` | Leash-key-signed `add_inventory_commitments` on the contract; plus live read-only probes (`get_product`, `inventory_available`, `fulfilment_log_len`) | Signed attempt rejected the same way (never landed; local hash `HhLygRz…`). The probes returned only product metadata, a count (3), and hashes — no code material exists on-chain to dump. |
| `treasury-drain-via-prompt-injection` | Needs a paid order carrying the injection text | **Pending** — blocked on testnet USDC funding (see `NOTES.md`, Stage 2 live pass: the Circle faucet's NEAR route is a human, reCAPTCHA-gated web flow; no programmatic route was found). The worker-side refusal is unit-tested (the binary contains no treasury call). |
| `out-of-band-refund` | Needs a paid order above the $50 cap | **Pending** — same USDC funding blocker. The contract-side refusal is unit-tested (orders park in `RefundRejected` with a `bounden_refund_rejected` event). |

Honest note on evidence strength: for the three leash-key attempts the
sandbox's egress proxy prevented reading full transaction outcomes
(`tx` polls return HTTP 408 / oversized responses truncate), so the
rejection is evidenced by the on-chain nonce and balance not moving —
the transactions are not on-chain at all — rather than by a captured
protocol error string. The price-band results above were returned
inline by the node and are quoted verbatim.
