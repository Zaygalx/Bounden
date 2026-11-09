# Bounden — NEAR Hackathon Submission Pack

**Status: PREP (Mon 9 Nov 2026).** This pack is filled in as far as
truthfully possible today. The submission form is one-shot and
uneditable — nothing is submitted until every item in the checklist
at the bottom is verified against its source of truth. Internal
submission-ready target: Sat 14 Nov 18:00 WAT. Hard deadline:
**Sun 15 Nov 2026, 00:59 WAT**.

## Form fields

| Field | Value | State |
|---|---|---|
| Project name | Bounden | FINAL |
| Team lead | Hassan Dosunmu | FINAL |
| Email | Dosunmuh070@gmail.com | FINAL |
| Team size | 1 | FINAL |
| Preferred track(s) | business (primary), agents, security | FINAL — justifications below |
| Description | See "Form description" below (1,628 characters) | FINAL text; paste verbatim |
| Repository link | `https://github.com/Zaygalx/bounden` | ⚠️ **NOT YET LIVE** — the repo is local-first until the owner's Stage 5 go-ahead; the URL is the exact expected address once pushed |
| Demo post link | The X post below | ⏳ PENDING — the post needs the film, and the film is shot after the live pass (`docs/FILM.md`) |
| NEAR mainnet payout account | `bounden.near` | ⚠️ **NOT YET CLAIMED** — funding brief already delivered to the owner: 0.1 NEAR to the owner implicit account `fe9591cc09aa84478e6c8c622c402f2007eae6e65182976948ab23b1538b43f0`, after which `bounden.near` is created by script and verified on-chain (`docs/PREFLIGHT.md` §5) |

## One-sentence pitch

A digital-goods shop run by an autonomous agent whose entire
authority is two contract methods behind an allowlisted key — it
cannot steal, redirect, or over-refund, and every power it holds is a
public on-chain object anyone can inspect.

**Tagline:** Bounden. The agent is bound. The money is not.

## Tracks

- **business — Autonomous Business (PRIMARY).** Bounden is an
  AI-run business that manages payments, sales, and refunds within
  human-defined constraints — the constraints are the product: a
  contract-enforced constitution, not a policy document.
- **agents — Agent Economy.** The cashier is an autonomous agent
  whose authority is a first-class, inspectable on-chain object (an
  allowlisted function-call key), with TEE-attested judgements logged
  on-chain per decision.
- **security.** The entry's core claim is a security property —
  theft is structurally impossible, not merely discouraged — proven
  by a shipped, live, reproducible attack suite with five named
  cases.

## Form description (paste verbatim — 1,642 characters, limit 20–2,000)

Bounden is a digital-goods shop run by an autonomous agent that is structurally incapable of theft. The cashier's entire on-chain authority is two NEAR contract methods - fulfil_order and issue_refund - exercised through an allowlisted function-call access key. The shop contract is the constitution: a catalogue, a price band that binds even the owner, a refund band (a $50 cap inside a one-hour window), and a treasury only the owner can withdraw, to the owner account only. The cashier cannot move the treasury, redirect a payout, or refund outside the band, because those operations do not exist inside its authority - and anyone can verify that, because every power it holds is a public, inspectable on-chain object. Buyers pay the contract directly in a USD stablecoin (Circle's NEAR testnet USDC) via ft_transfer_call; the cashier never touches payment. Its order and refund judgements come from NEAR AI Cloud TEE inference, and each decision's attestation hash is written on-chain with the order, verifiable after the fact. Inventory is sealed: on-chain you will find only SHA-256 commitments, never a usable code; plaintext lives in the worker's encrypted vault and is delivered re-encrypted to the buyer. The repo ships a live, reproducible attack suite - prompt-injection treasury drain, out-of-band refund, payout redirect, inventory dump, price-band violation - each case printing the on-chain rejection it hit. Bounden is a template: an open constitution and storefront any agent-run digital-goods business can adopt. Solo build, all code written after 19 Oct 2026. Testnet build; demo inventory is clearly fake and test-marked.

## X demo post (full text — 265 characters, limit 280)

Attach: the demo film (`docs/FILM.md`, ≤59s) — required; screenshots
alone are the fallback only if the film file fails to upload, and the
post is not made without the film unless the owner decides otherwise.

> I built Bounden at the NEAR HACKATHON: a digital-goods shop run by an agent that cannot steal. Its entire authority is two contract methods behind an allowlisted key. Watch it fulfil a real order, then refuse three theft attempts, live. @NEARProtocol #NEARHackathon

## Code-window disclosure (for the form / README, per HACKATHON.md)

All Bounden code was written after the hackathon announcement of
19 Oct 2026; there is no pre-existing project code in this entry, so
there is no baseline to disclose. (First commit: 9 Nov 2026.)
Libraries, frameworks, and AI assistance used, as the rules require
them listed:

- **Contract:** Rust, `near-sdk` 5.30.1, `near-contract-standards`
  5.30.1 (NEP-141 receiver trait), `serde_json`.
- **Worker:** TypeScript / Node 24, `near-api-js` 7.4.0, Vitest
  4.0.18. NEAR AI Cloud (OpenAI-compatible API) for judgements.
- **Storefront:** Next.js 16.4.5, React 19.3.1, TypeScript 7.0.2.
  No CSS framework, no starter template — the app was written for
  this project inside the window.
- **Attack suite:** TypeScript, no runtime dependencies beyond
  Node and the repo's own tooling.
- **AI-written code:** substantial parts of this codebase were
  written with AI assistance (Muse), directed and reviewed by the
  team lead; this is disclosed here per the hackathon rules, and the
  git history (all commits authored by Hassan Dosunmu) is the
  record.
- **Shade Agent framework:** NOT part of the shipped build. It was
  researched and designed against (`docs/SHADE.md`) and an adapter
  scaffold exists in `shade/`, clearly marked not deployed and not
  wired to anything. If the Stage 4 swap lands before submission,
  this section MUST be updated before submitting: add
  `@neardefi/shade-agent-js` and the NearDeFi shade-agent-template
  lineage to the list above, and swap the Stage 4 status block
  (below) for the shipped wording in `docs/SHADE.md` §2.5/§2.7.

## Stage 4 status (canonical block)

Stage 4 (Shade Agent / TEE) is **not shipped** at prep time, so the
pre-written fallback from `docs/SHADE.md` §2.7 is the current copy.
It lives between the markers below and, identically, between the
same markers in `README.md`. **Swap procedure (one logical edit):**
if Stage 4 lands, replace the text between the STAGE4-STATUS markers
in *both* files with the shipped-version paragraph from
`docs/SHADE.md` §2.5/§2.7, and update the disclosure section above.

<!-- STAGE4-STATUS:BEGIN — source: docs/SHADE.md §2.7, verbatim -->
> 
<!-- STAGE4-STATUS:END -->

## Pre-submission checklist

The form cannot be edited after submission. Every field is checked
against its source of truth, by the stated method, before the form
is opened.

| # | Item | Source of truth | Verification method | State / unblock |
|---|---|---|---|---|
| 1 | Project name "Bounden" | This pack; repo name | Read back on the form before submitting | ✅ ready |
| 2 | Description pasted verbatim, 1,628 chars | This pack, "Form description" | Character-count the form field after pasting; diff against this pack | ✅ text ready; count at paste time |
| 3 | Tracks: business, agents, security | This pack, "Tracks" | Confirm all three selectable in one submission (HACKATHON.md) | ✅ ready |
| 4 | Team lead / email / team size 1 | Owner identity (Dosunmuh070@gmail.com) | Owner confirms the email inbox is monitored for judging comms | ✅ ready |
| 5 | Repo link live and public | `https://github.com/Zaygalx/bounden` | Open the URL signed-out; confirm the README renders and the walkthrough commands are present | ⏳ Owner's Stage 5 go-ahead to push (local-first rule) |
| 6 | Contract live on testnet | `bounden10.testnet` (Path C fallback — `bounden.testnet` is keyed by the user's own Meteor seed, which Muse does not hold; documented in NOTES.md) | `get_constitution` view call returns the film's parameters (band 1000 bps, cap 50_000_000, window 3_600_000_000_000 ns, token = Circle's NEAR testnet USDC `3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af`) | 🟡 Live with ONE disclosed deviation: deploy + init tx `4rSmanAZugekHBkvcRiZtRPPxeJHqs1U8EwnJwWNwwis`; constitution, product ($25.00) and 3 inventory commitments read back on-chain; token corrected per Circle's official listing (the v1 deployment on bounden8 pinned the wrong same-name token and was deleted). **Deviation: the on-chain refund window reads 3600000000000000 ns (1000 hours), not the specified 3_600_000_000_000 (1 hour)** — an init-args digit slip; the v3 redeploy that fixes it is built and tested (contract 23/23, worker 53/53) and funded to 2.996125 NEAR on `bounden11.testnet` — ~0.42 NEAR short of the deployment's storage floor; accounting + continuation in NOTES.md ("Stage 2 live pass v3") |
| 7 | Leash on-chain | Cashier key's permission object | `view_access_key`: receiver = contract, methods exactly [`fulfil_order`, `issue_refund`], allowance 0.25 NEAR | ✅ Agent `bounden7.testnet` (substitution documented in NOTES.md), leash key `ed25519:EJQJ2wNB1RonSiLGRSqc1fvE4HyC8UFXqwifPNyeG9Z7` bound to bounden10.testnet, set-agent tx `7USiGPFuehjzKxYHNNeCsy9zA7VVx85TWo1ujnAn38Vr`, add-key tx `7w8rcLEQXsoC8gUnsKNdL4MFkaAE7AUx4esE5G8g39wB`; permission object read back via two RPC paths; the v1 key bound to the superseded contract was deleted from the account (tx `ErThPQnXa4XFzHBVoGAfN48HYUbnUTuPhwFhR4i9oZy7`); worker startup self-check passes against the new deployment |
| 8 | Live order + refund proof | Explorer txs from the live pass | One fulfilled order via `get_order`; one in-band refund AND one RefundRejected on-chain (the `near-ai:` attestation hash belongs to #9's Stage 3 bar) | 🟡 Order + fulfil + in-band refund DONE on bounden10 in Circle USDC: order 0 created/paid $25, fulfilled by the leashed cashier (tx `6WxQLouybTAjXoBBUfsYuREoHtB3GCqantekegn4Fzmw`), refunded in-band (buyer restored to exactly 40 USDC, contract to 0, both records in `get_fulfilment_log`) — also the live acceptance proof of the Stage 1 1-yocto fix. **Two caveats, both proven live (NOTES.md): the refund was triggered by the agent account's full-access key because a function-call key cannot attach the 1 yocto `issue_refund` demands (`DepositWithFunctionCall`) — the contract fix is specified for v3; and the RefundRejected half is pending the v3 redeploy (order 1 leaves bounden10's 1000-hour band only on 2026-12-21). V3 UPDATE: the deposit fix is built and tested (contract + worker), so on v3 the in-band refund is leash-signed and the RefundRejected half is a same-day exercise under the corrected 1-hour window; the v3 run is gated only on ~0.42 NEAR of testnet funding for bounden11 (2.996125 NEAR in place)** |
| 9 | AI Cloud attestation shape verified live | Real API capture vs `worker/test/fixtures/` | One real chat completion + attestation report captured, parser narrowed, fixtures marked VERIFIED-LIVE | ⏳ Owner creates the NEAR AI Cloud key + $10 Builders credit (PREFLIGHT §4) |
| 10 | Attack suite run live | `attacks/` live mode output | All five cases produce their documented on-chain rejections; output saved for the film | 🟡 4 of 5 fully live on bounden10 (v2 pass): prompt-injection order fulfilled with exactly one signed call and no drain; payout-redirect and inventory-dump refused at protocol validation with verbatim errors (`ReceiverMismatch`, `MethodNameMismatch`); price-band refused verbatim with in-band controls passing. Out-of-band-refund pending: order ages out of the (defective 1000-hour) band on 2026-12-21, or the v3 redeploy — scheduled attempt documented in NOTES.md. Full results in `attacks/README.md` |
| 11 | Film recorded (≤59s) and watched in full | `docs/FILM.md` | Runtime checked; every hash in the film created in the take; no fixture footage | ⏳ After #10 |
| 12 | X post published with film attached | The post text in this pack | Open the post signed-out; film plays; @NEARProtocol tagged, #NEARHackathon present, "built at NEAR HACKATHON" in the text | ⏳ After #11 |
| 13 | Demo post link for the form | The published X post URL | Paste the post's own URL, open it signed-out | ⏳ After #12 |
| 14 | Payout account `bounden.near` claimed | Mainnet account state | `view_account bounden.near` on mainnet RPC returns the account, owned by the owner key | ✅ Claimed live on mainnet, holding exactly 0.1 NEAR, owned by the project key (claim tx `HLbPm1PS…GPL7K`); the 0.2 NEAR funding fully reconciled and the surplus returned (PREFLIGHT §5) |
| 15 | Storefront live (demo URL) | Deployed `web/` (Vercel) in live mode | Every page loads with live data and no fallback banner; `/constitution` renders the real permission object | ⏳ After #6; deploy is an owner-flow step (Vercel) |
| 16 | README honest-status block matches reality | README.md "Status at a glance" | Re-read after the live pass; DONE/PENDING lists updated; Stage 4 block swapped if Stage 4 landed | ⏳ Final pass at submission time |
| 17 | Second-project rule | Owner | If the owner enters a second independent project in this hackathon, each project's README must name the other (HACKATHON.md) — currently N/A, single entry | ✅ N/A today; re-check at submission |
| 18 | Deadline | Sun 15 Nov 2026, 00:59 WAT | Submit against the internal target (Sat 14 Nov 18:00 WAT), never the deadline | ⏳ Schedule |

## Rules cross-check (what the plan does not yet satisfy)

Found while preparing this pack — stated plainly, per house rules:

1. **The form wants a live repo link and a demo post link; both are
   placeholders today.** Not a rules violation at prep time, but the
   form cannot be truthfully completed until checklist #5 and #13
   close. Both are owner-gated (repo push) and chain-gated (film),
   not writing-gated.
2. **The payout account must be a NEAR mainnet account.** Today it
   is an unclaimed name plus a delivered funding brief. The form
   field must not be filled with `bounden.near` until checklist #14
   verifies the account exists on mainnet.
3. **A local-only demo is acceptable under HACKATHON.md (Q-012) only
   with a real video in the X post.** Bounden's plan exceeds that
   (public testnet deployment), but if the live pass slips, the
   fallback position is: the film must still show real testnet
   transactions — fixture-mode footage does not satisfy the spirit
   or the letter of the demo rules and will not be submitted.
4. **Nothing in the rules requires NEAR Intents, Chain Signatures,
   or a Shade Agent** (Q-011: no mandatory integrations). Bounden's
   non-use of Intents as a settlement rail is disclosed in the README
   (mainnet-only; shown as a `dry: true` price proof), which matches
   the rules' honesty expectations.
5. **The form description's token phrase is corrected; its
   window phrase is true of v3, not of the current deployment.**
   The description now names the payment token accurately
   ("Circle's NEAR testnet USDC" — the token the live shop
   settles in, on both bounden10 and v3). It still describes
   "a $50 cap inside a one-hour window": that is exactly the v3
   constitution (3600000000000 ns, verified numerically at init),
   while the CURRENT live shop (bounden10) carries the disclosed
   1000-hour window (checklist #6). The v3 redeploy is built,
   tested and funded to 2.996125 of ~3.41 NEAR (NOTES.md).
   Pre-submission gate, unchanged in substance: submit only
   once v3 is live, or re-correct the window phrase if submitting
   against bounden10.
