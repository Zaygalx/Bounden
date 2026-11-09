# Claiming `bounden.testnet` (and later `bounden.near`) — the documented path

Status at Mon 9 Nov 2026: **no funded testnet account exists yet**, so the
contract is not deployed. This file records exactly why, and the exact
commands that finish the job the moment any testnet NEAR lands in the
owner account. All evidence is in `docs/PREFLIGHT.md` §7.

## Identities (public values only)

- Owner public key: `ed25519:J8nqSrjYNRDeHFdwXwFS2eT2f4xhgR1H64WFLJZhFwuZ`
- Owner implicit account id (testnet AND mainnet — hex of the public key):
  `fe9591cc09aa84478e6c8c622c402f2007eae6e65182976948ab23b1538b43f0`
- Owner private key: local vault only (`~/workspace/bounden-secrets/`,
  outside this repo). Never commit it, never print it.

## Why headless creation is blocked (measured, 9 Nov 2026)

1. `POST https://helper.testnet.near.org/account`
   `{newAccountId, newAccountPublicKey}` (the near-cli-rs
   `sponsor-by-faucet-service` protocol) executes on-chain but the
   registry receipt fails with
   `OnlyImplicitAccountCreationAllowed` — twice, with two different
   fresh keypairs, so it is not key-specific. The helper service no
   longer creates accounts at all from this route.
2. The current official faucet, https://near-faucet.io (NearBlocks),
   accepts only `*.testnet` wallet addresses or EVM addresses — an
   implicit NEAR account id is rejected by its own form validation —
   and its request action returned HTTP 500 to programmatic calls.
3. `linkdrop.testnet` exposes no callable claim/create surface
   (Keypom v2 methods live on `v2.keypom.testnet`; drops must be
   pre-funded by an existing account — circular from cold).

Conclusion: the first testnet NEAR must arrive through a human-gated
channel (wallet faucet sign-in). Everything after that is scripted
below and needs no further human steps.

## Path A — user funds the owner account (≈2 minutes, phone)

1. In any NEAR testnet wallet (e.g. Meteor, network = Testnet), send
   **5 testnet NEAR** (faucet-obtained, valueless) to:
   `fe9591cc09aa84478e6c8c622c402f2007eae6e65182976948ab23b1538b43f0`
   The first transfer to an implicit account creates it on-chain
   (docs.near.org, Accounts: "The first transfer to the address creates
   the account, including a transfer of 0 NEAR"; creator pays a
   0.007 NEAR creation charge through gas).
   Alternatively open https://near-faucet.io signed in with a wallet
   and request a drip to any account you control, then forward.
2. Tell the agent it is funded. The agent verifies with:
   `python3 scripts/near_rpc.py account fe9591cc09aa84478e6c8c622c402f2007eae6e65182976948ab23b1538b43f0 testnet`

## Path B — once ANY account we control is funded

Create the named account from the funded account via the registry
contract (this is what `near_rpc.py create-top` does):

```bash
export BOUNDEN_OWNER_KEY=~/workspace/bounden-secrets/owner-ed25519.json
# 1. Create bounden.testnet with the OWNER public key, funded 0.1 NEAR
#    (100000000000000000000000 yocto). Signer = the funded account.
python3 scripts/near_rpc.py create-top <FUNDED_ACCOUNT> bounden.testnet \
  J8nqSrjYNRDeHFdwXwFS2eT2f4xhgR1H64WFLJZhFwuZ \
  100000000000000000000000 testnet
# 2. Verify
python3 scripts/near_rpc.py account bounden.testnet testnet
```

Then update the vault credential's `account_id` to `bounden.testnet`
(the key file stays the same — the owner key becomes a full-access key
of the named account), set `BOUNDEN_CONTRACT_KEY` to the same file, and
deploy (Path C).

## Path C — deploy + initialise + verify (fully scripted)

Deploy target: `bounden.testnet` if claimed, otherwise the owner
implicit account. Constitution parameters (from PLAN/tests):
price band 1000 bps (10%), refund cap 50_000_000 (USDC $50.00),
refund window 3_600_000_000_000 ns (1 hour), payment token
`usdc.testnet`.

```bash
export BOUNDEN_OWNER_KEY=~/workspace/bounden-secrets/owner-ed25519.json
export BOUNDEN_CONTRACT_KEY=~/workspace/bounden-secrets/owner-ed25519.json
OWNER=fe9591cc09aa84478e6c8c622c402f2007eae6e65182976948ab23b1538b43f0
CONTRACT=bounden.testnet   # or $OWNER for the implicit fallback

# Deploy wasm + init in one transaction
python3 scripts/near_rpc.py deploy-init $CONTRACT $CONTRACT \
  target/wasm32-unknown-unknown/release/bounden_contract.wasm new \
  "{\"owner_id\":\"$OWNER\",\"payment_token\":\"usdc.testnet\",\"price_band_bps\":1000,\"refund_cap_usd\":\"50000000\",\"refund_window_ns\":3600000000000}"

# Verification battery
python3 scripts/near_rpc.py view $CONTRACT get_constitution
python3 scripts/near_rpc.py tx $OWNER $CONTRACT add_product \
  "{\"product_id\":\"licence-pro\",\"name\":\"Bounden Pro Licence Key (Demo)\",\"kind\":\"LicenceKey\",\"price_usd\":\"25000000\"}" 0 30000000000000
python3 scripts/near_rpc.py view $CONTRACT get_product '{"product_id":"licence-pro"}'
python3 - <<'PY'
import hashlib
for c in ("BOUNDEN-TEST-LICENCE-0001","BOUNDEN-TEST-LICENCE-0002","BOUNDEN-TEST-LICENCE-0003"):
    print(c, hashlib.sha256(c.encode()).hexdigest())
PY
# paste the three hashes into:
python3 scripts/near_rpc.py tx $OWNER $CONTRACT add_inventory_commitments \
  "{\"product_id\":\"licence-pro\",\"code_hashes\":[\"<H1>\",\"<H2>\",\"<H3>\"]}" 0 30000000000000
python3 scripts/near_rpc.py view $CONTRACT inventory_available '{"product_id":"licence-pro"}'
```

Note: if deploying to `bounden.testnet`, the contract account needs
≈3.4 NEAR of storage balance for the 339,892-byte wasm
(10^19 yocto/byte) plus state — top it up from the owner account
before deploying, or deploy to the implicit account instead.
