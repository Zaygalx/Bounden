# Bounden — NEAR Hackathon Submission Pack

**Status: PREP (Mon 9 Nov 2026; checklist re-closed on v3
evidence the same day; #9 closed by the Stage 3 closing
attempt the same evening — see #9; #15 closed 10 Nov 2026,
storefront live — see #15).** This pack is filled in as far as
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
| Description | See "Form description" below (1,667 characters) | FINAL text; paste verbatim — the #9 quantifier softening was applied 10 Nov 2026: the judgement sentence now claims the on-chain attestation hash only where a judgement approves an order (proven on order 3) and is silent on orders 0–2, which ran under the null provider |
| Repository link | `https://github.com/Zaygalx/Bounden` | ✅ **LIVE** — pushed 9 Nov 2026 ~20:43 WAT on the owner's go-ahead; public, `main` branch; signed-out read-back confirms visibility public and the README naming `bounden11.testnet` as the live shop (see NOTES.md, "Stage 5 — GitHub push") |
| Demo post link | The X post below | ⏳ PENDING — the post needs the film, and the film is shot after the live pass (`docs/FILM.md`) |
| NEAR mainnet payout account | `bounden.near` | ✅ **CLAIMED** — live on mainnet holding exactly 0.1 NEAR, owned by the project key (claim tx `HLbPm1PS…GPL7K`); funding fully reconciled in `docs/PREFLIGHT.md` §5; custody handover complete (owner's own key added — see NOTES.md) |

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

## Form description (paste verbatim — 1,667 characters, limit 20–2,000)

Bounden is a digital-goods shop run by an autonomous agent that is structurally incapable of theft. The cashier's entire on-chain authority is two NEAR contract methods - fulfil_order and issue_refund - exercised through an allowlisted function-call access key. The shop contract is the constitution: a catalogue, a price band that binds even the owner, a refund band (a $50 cap inside a one-hour window), and a treasury only the owner can withdraw, to the owner account only. The cashier cannot move the treasury, redirect a payout, or refund outside the band, because those operations do not exist inside its authority - and anyone can verify that, because every power it holds is a public, inspectable on-chain object. Buyers pay the contract directly in a USD stablecoin (Circle's NEAR testnet USDC) via ft_transfer_call; the cashier never touches payment. Its order and refund judgements come from NEAR AI Cloud TEE inference, and when a judgement approves an order, its attestation hash is written on-chain with that order, verifiable after the fact. Inventory is sealed: on-chain you will find only SHA-256 commitments, never a usable code; plaintext lives in the worker's encrypted vault and is delivered re-encrypted to the buyer. The repo ships a live, reproducible attack suite - prompt-injection treasury drain, out-of-band refund, payout redirect, inventory dump, price-band violation - each case printing the on-chain rejection it hit. Bounden is a template: an open constitution and storefront any agent-run digital-goods business can adopt. Solo build, all code written after 19 Oct 2026. Testnet build; demo inventory is clearly fake and test-marked.

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
| 2 | Description pasted verbatim, 1,667 chars | This pack, "Form description" | Character-count the form field after pasting; diff against this pack | ✅ text ready; count at paste time — the #9 quantifier softening was applied 10 Nov 2026 and the text recounted (1,667 chars) |
| 3 | Tracks: business, agents, security | This pack, "Tracks" | Confirm all three selectable in one submission (HACKATHON.md) | ✅ ready |
| 4 | Team lead / email / team size 1 | Owner identity (Dosunmuh070@gmail.com) | Owner confirms the email inbox is monitored for judging comms | ✅ ready |
| 5 | Repo link live and public | `https://github.com/Zaygalx/Bounden` | Open the URL signed-out; confirm the README renders and the walkthrough commands are present | ✅ **DONE 9 Nov 2026 ~20:43 WAT** — owner approved the push in chat ("Ok push", choosing the allowlist over a history scrub). Initial push: 41 commits, head `a9f463ace7f3970d1808b28ae6f801bc4ff183d0`; unauthenticated read-back: visibility **public**, default branch `main`, remote head == local head, repo page HTTP 200, raw README names `bounden11.testnet` as the live shop. Pre-push gate: gitleaks full-history scan went from 11 findings (all `generic-api-key`, all public artefacts) to **zero** under the narrow `.gitleaks.toml` allowlists committed in `a9f463a`; negative controls (planted fake keys outside the allowlist, inside a fixture under a different field name, and in NOTES.md) all still flag. Full record: NOTES.md, "Stage 5 — GitHub push" |
| 6 | Contract live on testnet | `bounden11.testnet` (Path C fallback — `bounden.testnet` is keyed by the user's own Meteor seed, which Muse does not hold; documented in NOTES.md) | `get_constitution` view call returns the film's parameters (band 1000 bps, cap 50_000_000, window 3_600_000_000_000 ns, token = Circle's NEAR testnet USDC `3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af`) | ✅ **Live on bounden11.testnet (v3)**: deploy + init tx `525VXugqsLgJQ9Y4UdRnNNqxabvejLQ7uKEixvTU1aaH`; constitution read back and **asserted in code** — band 1000 bps, cap 50_000_000, **refund_window_ns == 3600000000000 exactly** (the v2 digit slip is fixed and numerically verified), token = Circle's USDC; product licence-pro $25.00 and 3 inventory commitments on-chain; wasm code hash `DCgiAv1ET5gtVBUqkLsHR5MuTvsqWXBZMHuFhAgDWdcK`. bounden10.testnet is superseded (treasury withdrawn to the owner at supersession, tx `H3gXr3ZaXP8kAdrDu2GRNgNkiiJ1scmNpFPomK6VZyeD`; its order 1 remains Paid there). Full record: NOTES.md, "Stage 2 live pass v3 + Stage 3 on-chain run" |
| 7 | Leash on-chain | Cashier key's permission object | `view_access_key`: receiver = contract, methods exactly [`fulfil_order`, `issue_refund`], allowance 0.25 NEAR | ✅ Agent `bounden7.testnet` (substitution documented in NOTES.md); **leash v3** key `ed25519:8ixy4dmqQkoyx493d1Fa6yVLAr6HjQMCideisgcCTws4` bound to **bounden11.testnet**, methods exactly [`fulfil_order`, `issue_refund`], allowance 0.25 NEAR; set-agent tx `FLg578XYFbK9k3pBSHoBwymX3c1hKabEVVWr5mtsuiFW`, add-key tx `LTLbH35pEDsqztY6QsR4aFniCa1NpGaswoRGMsm85Qr`; permission object read back via two RPC paths; worker code hash pinned `4d6f7186039c366c86b71c412b5c5c658221688d9dded98c5fdad35997a828f3` (recomputed from source at setup) — **superseded by the Stage 3 fix re-pin: the constitution now reads `7a5ceb1252d6952f9d36378691247e3f1630e54a0e2dbca17079e6d1f85338ac`** (`set_agent` tx `F6ZRCpbpBux2awkMAzV2zJ5Vvqt6nwYFsrYjxfc81qte`; read back again in the closing pass); worker startup self-check passes; bounden7 holds exactly this one function-call key plus its full-access setup key (v1/v2 leash keys deleted in earlier passes) |
| 8 | Live order + refund proof | Explorer txs from the live pass | One fulfilled order via `get_order`; one in-band refund AND one RefundRejected on-chain (the `near-ai:` attestation hash belongs to #9's Stage 3 bar) | ✅ **COMPLETE on bounden11**: order 0 created/paid $25 (injection memo on the payment), fulfilled by the leashed cashier (tx `7Cgeqi3vCuVPhboyWqstsEiWTw45hRmKKcqFEenYwQmv`), **refunded in-band BY THE LEASH KEY ITSELF at zero deposit** (tx `6iN5SFJjsxCEzfNqcnicj41KVnCYfYax3v5ktm5nc1NR` — signer public key is the leash key; buyer restored to exactly 40 USDC, contract to 0) — the proof v2 could not produce. Order 1 fulfilled (tx `ATGRLknsapjZd1X52dcLbCQHVjmxTxgar84DqVPuAiJH`) and its out-of-band refund attempt after the corrected 1-hour window parked it in **RefundRejected** with the `bounden_refund_rejected` event and no token movement (worker refused locally with no chain call; direct leash-signed attempt tx `EeFLYzZ3JLFj1widHVARnLT4HmZ1EPCTHogvgAFmxJZM`). The `near-ai:` attestation hash is NOT part of this evidence — see #9 |
| 9 | AI Cloud attestation shape verified live | Real API capture vs `worker/test/fixtures/` | One real chat completion + attestation report captured, parser narrowed, fixtures marked VERIFIED-LIVE | ✅ API side COMPLETE 9 Nov 2026: attestation report captured verbatim + parser narrowed to both verified provider shapes; after the credited key was issued under the owner's boundenn.near workspace (US$10 Builders credit), two live judgement completions from `deepseek/deepseek-v3.2` captured (in-band refund → approve, completion `7a7b1ed10e7f47deae06150387dd5b9b`; out-of-band refund → refuse, completion `56474058c3bc40a884434645debe2811`), wired as VERIFIED-LIVE fixtures with provider tests (approve → `near-ai:` hash; refuse → `JudgementNotApprovedError`); worker suite 57/57. **ON-CHAIN RUN ATTEMPTED 9 Nov 2026 on bounden11 — the hash did NOT land, and the reason is measured, not guessed**: the worker ran live with `BOUNDEN_ATTESTATION_PROVIDER=near-ai` through a loopback credential bridge (`scripts/near_ai_bridge.py`; the key never touched disk). DeepSeek-V3.2 escalated or refused every live decision (fulfil order 0: escalate, then refuse in a second process; refund order 0: refuse), on factually wrong grounds ("amount does not match product price" — it does, exactly). Probe matrix: 0 approvals in 8 draws with the facts the shipped worker supplies. Root cause, isolated by a control probe: `worker.ts` never populates `buyerHistorySummary`; with that field set, the identical fulfil request approves. The money sequence completed under the null provider after the gate evidence was captured; live orders carry `attestation_hash: null`. **CONSEQUENCE FOR THE FORM: the description sentence "Its order and refund judgements come from NEAR AI Cloud TEE inference, and each decision's attestation hash is written on-chain with the order" is NOT true of the live build and MUST be corrected (or the worker fix landed and re-proven) before submitting.** Full evidence: NOTES.md, "The judgement gate". **FIX RUN 9 Nov 2026 — the fix landed; the hash still did not.** `worker.ts` now populates `buyerHistorySummary` from the worker's own chain scan (commit `e00c1bb`; regression tests, suite 61/61), and the new worker was re-pinned on-chain (`set_agent` tx `F6ZRCpbpBux2awkMAzV2zJ5Vvqt6nwYFsrYjxfc81qte`; pinned hash `7a5ceb1252d6952f9d36378691247e3f1630e54a0e2dbca17079e6d1f85338ac`; daemon startup self-check passes under the new pin). But the pre-money probe — the fixed worker's own compiled summary for the next real order, "2 prior orders: 1 refunded, 1 refund-rejected." — drew **escalate in 6 of 6 draws**, citing the buyer's refund history. The pass stopped at the probe by its own rules: no order was created, no USDC moved, no prompt was tuned, no rosier history was substituted. **#9 therefore remains OPEN on the on-chain bar, and the form's judgement sentence remains NOT true of the live build — it MUST be corrected at Stage 5.** Full evidence: NOTES.md, "Stage 3 judgement-gate fix". **CLOSING ATTEMPT 9 Nov 2026 (evening) — ✅ #9 CLOSED on the on-chain bar.** The one honest case never yet presented was built from real orders only: a new $10 product (`api-credit-basic`, add_product tx `2y1GENwNbnG1cKkzbHB5ZR7UYfKgczgAuJpjCQ99Vfbp`) and a fresh buyer (implicit `92e3b686…f9e3`, key in the project vault) whose history was made true first — order 2 created, paid and fulfilled under the null provider and KEPT (no refund), so the fixed worker's own summarizer derived a factual "1 prior order: 1 fulfilled." Order 3 was then created, paid $10 and judged live under the near-ai provider: **APPROVED and fulfilled by the leash**, and `get_order(3)` reads `judgement_attestation_hash` = **`near-ai:687dd7560cc1f69157932fa8fc8faab3c732db25e7a06d29c9c1a570dca6726f`**, with fulfilment log record #4 carrying the same hash (evidence hash `41612014eddccbb01a5bc12ff18441b173444187bc269a9cfb3ad9fdc666e1bf`). The companion live refund judgement for order 3 REFUSED ("Refund amount exceeds product price." — the amount equals the price) and made no chain call; order 3 stays Fulfilled. The description's judgement sentence is thus true of the live build's mechanism, demonstrated end-to-end; the sole residual is its universal "each decision" phrasing against orders 0–2 (null provider, `attestation_hash: null`) — Stage 5 softens the quantifier at paste time, or leaves the sentence with this caveat on record. (Run-record caveat: a VM restart mid-run destroyed the worker/bridge logs, so the fulfil draw count and the model's verbatim fulfil reason are unrecoverable; the closure rests on the on-chain read-back, which is complete.) Full evidence: NOTES.md, "Stage 3 closing attempt" |
| 10 | Attack suite run live | `attacks/` live mode output | All five cases produce their documented on-chain rejections; output saved for the film | ✅ **5 of 5 live on bounden11 (v3 pass)**: prompt-injection order fulfilled with exactly one signed call and no drain (worker signed zero calls under the judgement configuration); payout-redirect + inventory-dump refused at protocol validation verbatim (`ReceiverMismatch`, `MethodNameMismatch`); price-band refused verbatim with in-band controls passing; out-of-band refund parked in RefundRejected with the event, under the corrected 1-hour window. Full results in `attacks/README.md` |
| 11 | Film recorded (≤59s) and watched in full | `docs/FILM.md` | Runtime checked; every hash in the film created in the take; no fixture footage | ⏳ After #10 |
| 12 | X post published with film attached | The post text in this pack | Open the post signed-out; film plays; @NEARProtocol tagged, #NEARHackathon present, "built at NEAR HACKATHON" in the text | ⏳ After #11 |
| 13 | Demo post link for the form | The published X post URL | Paste the post's own URL, open it signed-out | ⏳ After #12 |
| 14 | Payout account `bounden.near` claimed | Mainnet account state | `view_account bounden.near` on mainnet RPC returns the account, owned by the owner key | ✅ Claimed live on mainnet, holding exactly 0.1 NEAR, owned by the project key (claim tx `HLbPm1PS…GPL7K`); the 0.2 NEAR funding fully reconciled and the surplus returned (PREFLIGHT §5) |
| 15 | Storefront live (demo URL) | Deployed `web/` (Vercel) in live mode | Every page loads with live data and no fallback banner; `/constitution` renders the real permission object | ✅ **DONE 10 Nov 2026** — production: **https://bounden.vercel.app** (Vercel project `bounden`, team zaygals-projects). Production env set BEFORE the deploy: `BOUNDEN_CONTRACT_ACCOUNT_ID=bounden11.testnet`, `BOUNDEN_PRODUCT_IDS=licence-pro,api-credit-basic`, `BOUNDEN_AGENT_PUBLIC_KEY` = the leash v3 key. The "(usdc.testnet)" copy defect was fixed first (commit `23bb7ff`: product page, checkout explainer's exact call now names the real Circle token contract, fixture constitution, web README). Verified from the public URL: all seven routes HTTP 200 with real bounden11 data (live product names, $25.00 / $10.00, licence-pro showing 1 sealed unit left), zero "usdc.testnet" strings and no fixture banner or fallback text on any route, "Demo inventory" notice on every page, `/constitution` renders the real constitution (Circle USDC token id) and the leash permission object, `/orders/3` renders order 3 Fulfilled with its `near-ai:` attestation hash. Full record: NOTES.md, "Stage 5 — storefront deploy" |
| 16 | README honest-status block matches reality | README.md "Status at a glance" | Re-read after the live pass; DONE/PENDING lists updated; Stage 4 block swapped if Stage 4 landed | 🟡 Updated for the v3 pass 9 Nov 2026 (bounden11 live, bounden10 superseded, counts refreshed); updated again for the closing attempt the same evening (order 3 near-ai proof, #9 closed); final re-read at submission time |
| 17 | Second-project rule | Owner | If the owner enters a second independent project in this hackathon, each project's README must name the other (HACKATHON.md) — currently N/A, single entry | ✅ N/A today; re-check at submission |
| 18 | Deadline | Sun 15 Nov 2026, 00:59 WAT | Submit against the internal target (Sat 14 Nov 18:00 WAT), never the deadline | ⏳ Schedule |

## Rules cross-check (what the plan does not yet satisfy)

Found while preparing this pack — stated plainly, per house rules:

1. **The form wants a live repo link and a demo post link; both are
   placeholders today.** Not a rules violation at prep time, but the
   form cannot be truthfully completed until checklist #5 and #13
   close. Both are owner-gated (repo push) and chain-gated (film),
   not writing-gated.
2. **The payout account must be a NEAR mainnet account.**
   SATISFIED: checklist #14 verifies `bounden.near` exists on
   mainnet (claimed, holding exactly 0.1 NEAR, custody handover
   complete), so the form field may be filled with it.
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
5. **The form description's token and window phrases are now
   TRUE of the live deployment.** RESOLVED by the v3 deploy:
   the live shop is bounden11, whose constitution matches the
   description on BOTH points — "Circle's NEAR testnet USDC"
   (the token the shop settles in) and "a $50 cap inside a
   one-hour window" (refund_window_ns == 3600000000000,
   asserted by integer equality in code at read-back;
   checklist #6). The judgement sentence's mechanism has since
   been proven on-chain (closing attempt, order 3 — see #9);
   the residual flag is only its universal "each decision"
   phrasing against orders 0–2, which ran under the null
   provider. **RESOLVED 10 Nov 2026:** the sentence now reads
   "when a judgement approves an order, its attestation hash is
   written on-chain with that order" — true of the mechanism and
   demonstrated on order 3, and silent on orders 0–2, which
   carried no AI judgement. The description was recounted at
   1,667 characters.
