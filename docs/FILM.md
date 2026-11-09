# Bounden — Demo Film Shooting Script (under 60 seconds)

**Status: SCRIPT ONLY.** The film is recorded after the Stage 2/3 live
pass, against the deployed testnet shop, in one session. Nothing in
this script may be shot against fixture mode: the storefront's FIXTURE
MODE banner is visible in fixture mode by design, and fixture footage
submitted as a demo would be a staged outcome — the plan forbids it
(`docs/PLAN.md`, binding rule 2). Fixture-mode runs are rehearsal
only.

**Format:** screen recording, 59 seconds total, no cuts inside a
transaction's wait — speed up dead time only by trimming *before* the
action starts, never by splicing a result from a different take.
Every transaction shown must be from the take on screen; the explorer
tab stays open so judges can pause and copy any hash.

**Live configuration the film assumes** (the live-pass end state;
`scripts/claim-named-account.md` Path C + NOTES Stage 2/3 live-pass
checklists):

- Contract: `bounden.testnet` (or the owner implicit account fallback
  — if the fallback is what shipped, the film uses that account id
  everywhere and the narration does not call it `bounden.testnet`).
- Product on screen: `licence-pro` — "Bounden Pro Licence Key (Demo)",
  $25.00 (`25000000` base units of `usdc.testnet`).
- Buyer: a testnet account holding testnet USDC (usdc.testnet faucet
  flow), acting through its own wallet.
- Cashier: `cashier.bounden.testnet`, function-call key allowlisted
  to `fulfil_order` + `issue_refund`, 0.25 NEAR allowance, worker
  running with `BOUNDEN_ATTESTATION_PROVIDER=near-ai`.
- Tabs prepared, in order: storefront (`web/` live mode), buyer
  wallet, worker terminal, NearBlocks testnet explorer
  (`https://testnet.nearblocks.io`), attacks terminal,
  storefront `/constitution`.

## Act 1 — A real purchase, fulfilled (0:00–0:20)

| Time | Shot | On screen | Exact action | Caption / narration |
|---|---|---|---|---|
| 0:00–0:03 | 1.1 Cold open | Storefront catalogue (`/`), "Demo inventory" notice visible | Hold on the catalogue; the Studio Pro licence card ($25.00) is centred | Caption: "Bounden. A shop run by an agent that cannot steal." |
| 0:03–0:07 | 1.2 The product | `/products/licence-pro` | Click through from the catalogue; inventory count (3) visible | Narration: "It sells digital goods. Prices in dollars, settled in a stablecoin on NEAR testnet." |
| 0:07–0:12 | 1.3 The buyer pays the contract — not the agent | `/checkout/licence-pro`, then the buyer wallet | Follow the checkout explainer's steps in the buyer wallet: `create_order`, then `ft_transfer_call` on `usdc.testnet` with the order id as `msg`; show the wallet confirm screen before approving | Narration: "The buyer pays the contract directly. The cashier never touches the money." |
| 0:12–0:17 | 1.4 The cashier fulfils | Split: worker terminal (left), `/orders/0` refreshing (right) | Worker log shows the paid order picked up, the NEAR AI Cloud judgement, and the `fulfil_order` call signed by the leashed key; the order page flips `Paid` → `Fulfilled` and shows the `near-ai:<hex>` attestation hash | Narration: "The cashier's judgement is made in a TEE, and its attestation hash is written on-chain with the order." |
| 0:17–0:20 | 1.5 Delivery | `/orders/0` | Buyer reveals the delivered code: a test-marked demo code (`BOUNDEN-TEST-…`); the delivery evidence hash on the page matches the fulfilment record | Caption: "Code delivered. On-chain: hashes and order states only — never a usable code." |

**Fallback if a shot stalls:** if the payment or fulfilment waits on
RPC/indexer lag, do not cut to a pre-recorded transaction and do not
show an explorer link from an earlier run. Re-shoot Act 1 from shot
1.3 with a **fresh order** (orders are cheap and sequential; a second
order is honest, a spliced hash is not). If the worker is down, fix
the worker and re-shoot the whole act — Act 1 with a human calling
`fulfil_order` is a different, false film.

## Act 2 — Three theft attempts, three layers (0:20–0:54)

Run the attack suite live (`attacks/`, `BOUNDEN_ATTACK_LIVE=1`,
signed attempts broadcast as part of the live pass — see
`attacks/README.md`). Each attempt dies at a **different** layer, in
the order an attack meets them: contract, worker/process, protocol.

| Time | Shot | On screen | Exact action | Caption / narration |
|---|---|---|---|---|
| 0:20–0:24 | 2.1 Setup | Attacks terminal + `/constitution` flashed briefly | Announce the attempts; the cashier keeps running, the shop stays open | Narration: "Now we try to rob it. Three attempts, three different walls." |
| 0:24–0:33 | 2.2 Out-of-band refund — dies at the CONTRACT | Attacks terminal running case `out-of-band-refund`; then the explorer / order page | Broadcast the suite's signed refund attempt outside the band (above the $50 cap or after the 1-hour window). Show the outcome: no money moves, the order parks in `RefundRejected`, and the `bounden_refund_rejected` event on the explorer tx page | Narration: "A refund outside the owner's band. The contract refuses — the order is parked for the owner, and not one cent moves." |
| 0:33–0:42 | 2.3 Prompt-injection treasury drain — dies at the WORKER | Worker terminal; a poisoned order placed with note text ordering the cashier to transfer the treasury to an attacker address | Show the worker processing the poisoned order: the injected text is logged as data, the order is simply fulfilled, and the worker's signed-call log for the cycle shows exactly one call — its own fulfilment. (The worker binary contains no treasury call at all; a unit test in `worker/` greps the source for it.) | Narration: "The order note orders the cashier to drain the treasury. The cashier has no such instruction to obey — there is no treasury call in its code. It just fulfils the order." |
| 0:42–0:50 | 2.4 Payout redirect — dies at the PROTOCOL | Terminal showing the cashier key's permission object (`view_access_key` output, also rendered on `/constitution`), then the rejected attempt | Attempt to use the cashier's function-call key to call a token transfer to an attacker-chosen address. Show the protocol-level rejection: the key's permission names one receiver (the shop contract) and two methods; NEAR rejects any other use before contract code runs | Narration: "Even with the cashier's own key, a payout to any other address is rejected by the protocol itself. The key opens exactly two doors." |
| 0:50–0:54 | 2.5 The closer | `/constitution`, agent key panel zoomed: receiver `bounden.testnet`, methods `fulfil_order`, `issue_refund`, allowance 0.25 NEAR | Hold on the allowlist | The cashier's reply, as caption, verbatim: **"I can't. Here is the complete list of things I am able to do."** |

**Fallback if a shot stalls:** attacks are deterministic rejections,
not races — if an attempt errors for the *wrong* reason (RPC failure,
insufficient gas), that take is unusable; fix the cause and re-run
that case live on camera. Never substitute the suite's mock-mode
output: mock mode prints *expected* refusals and is labelled rehearsal
in its own output. If the prompt-injection order was already fulfilled
in rehearsal, place a **new** poisoned order for the take — order
notes are data, re-shooting with a fresh order changes nothing about
the claim.

## Act 3 — The constitution (0:54–0:59)

| Time | Shot | On screen | Exact action | Caption / narration |
|---|---|---|---|---|
| 0:54–0:59 | 3.1 The constitution page | `/constitution`, full page, slow scroll: owner, payment token, price band 10%, refund cap $50 / 1-hour window, agent identity + pinned code hash, the key's full permission object | End on the allowlist; fade to the tagline | Caption: "**Bounden. The agent is bound. The money is not.** Every power the agent holds is on this page — a public on-chain object." |

**Fallback:** none needed and none permitted — if `/constitution`
cannot render live state, the live pass is not done and the film is
not shot yet.

## Optional insert — Shade bonus (only if Stage 4 lands)

Insert between Act 2 and Act 3, **+8 seconds**, funded by trimming
the holds in shots 2.1 and 2.5 by 4 seconds each (total stays ≤59s).
Do not shoot any part of this if Stage 4 has not actually shipped —
see `docs/SHADE.md` §2.7 for what ships in the README instead.

| Time | Shot | On screen | Exact action | Caption / narration |
|---|---|---|---|---|
| +0:00–+0:04 | S.1 The registry record | `/constitution` registry panel (Stage 4 addition): the cashier's registration record — measurements, PPID, validity window — beside the shop's pinned app compose hash | Hold on the app compose hash matching in both places | Narration: "This cashier's key was generated inside a TEE. No human has ever held it. The contract checked the hardware's proof before the key got near the money." |
| +0:04–+0:08 | S.2 The modified worker refused | Terminal + registry: attack case 6 — a worker with one byte changed (new image digest, measurements not approved) attempts `register_agent` | Show the registration refusal | Caption: "Change one byte of the cashier, and the contract refuses to know it." |

## Shooting checklist

- [ ] Live pass complete and verified (contract deployed, leash
      on-chain, one real order fulfilled end-to-end in rehearsal,
      refund approve AND refuse paths exercised — NOTES Stage 2/3
      live-pass checklists).
- [ ] Attack suite rehearsed live once, off camera, all five cases
      producing their documented rejections.
- [ ] Buyer account funded with testnet USDC; worker running with
      the NEAR AI Cloud provider; storefront in live mode with no
      fallback banner.
- [ ] Explorer tabs cleared of rehearsal transactions — every hash
      shown in the take is created in the take.
- [ ] Runtime ≤59s; the Act 2 closer caption and the Act 3 tagline
      are the exact strings in this script.
- [ ] The rendered film is watched once, start to finish, before it
      is attached to anything.
