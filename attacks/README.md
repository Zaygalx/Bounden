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
The signed live attempts execute in the Stage 2 live pass, once the
testnet deployment lands (see `docs/PREFLIGHT.md` §7 for the blocker).
Nothing in this directory has broadcast a transaction yet.
