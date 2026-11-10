# Bounden — Demo Film Shooting Script (under 60 seconds)

**Script v2 — 10 Nov 2026 — owner-directed revision.** V1 was accurate
but too clean: twelve shots in 59 seconds, a caption every three
seconds, no person in it, and the best line buried at 0:50. This
revision keeps every honesty rule in v1 and restructures around the
owner's direction: open on the heist, one human voice, fewer shots
with longer holds, the closer as the climax, and sound treated as
half the film. It is also conformed to the shop as actually shipped
(bounden11.testnet — see Live configuration).

**Status: SCRIPT ONLY — do not shoot until the owner says start.**
The film is the last piece of the submission. The film is recorded
against the deployed testnet shop, in one session. Nothing in this
script may be shot against fixture mode: the storefront's FIXTURE
MODE banner is visible in fixture mode by design, and fixture
footage submitted as a demo would be a staged outcome — the plan
forbids it (`docs/PLAN.md`, binding rule 2). Fixture-mode runs are
rehearsal only.

## Honesty rules (unchanged from v1, restated in full)

- Live footage only. Every transaction shown is created in the take
  on screen; the explorer tab stays open so judges can pause and
  copy any hash.
- No spliced results: never cut a result from a different take onto
  an action. Cuts happen between actions, never across a
  transaction's outcome. Dead time may be trimmed *before* an action
  starts, never inside a transaction's wait.
- Fresh order for every reshoot. Orders are sequential and cheap; a
  second order is honest, a spliced hash is not.
- The fulfilment on screen must be the leashed cashier's own call,
  with the worker genuinely running. A take where a human calls
  `fulfil_order` is a different, false film.
- The attack suite runs live (`attacks/`, `BOUNDEN_ATTACK_LIVE=1`).
  Its mock-mode output prints *expected* refusals and is labelled
  rehearsal — mock output is never footage. If an attempt errors for
  the *wrong* reason (RPC failure, insufficient gas), that take is
  unusable; fix the cause and re-run that case live on camera.
- Imperfections must be real. A typo the owner makes and fixes on
  camera stays in. A staged mistake is the same sin as a fixture
  take and is forbidden for the same reason.

## Live configuration (the shop as shipped)

- Storefront: `https://bounden.vercel.app`, live mode, no fallback
  banner.
- Contract: `bounden11.testnet`.
- Payment token: Circle's NEAR testnet USDC,
  `3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af`
  (6 decimals). Never `usdc.testnet` — that is a different,
  lookalike token and appears nowhere in this film.
- Product on screen: `licence-pro` — $25.00 (2,500,000 base units).
  (`api-credit-basic`, $10.00, is the alternate.) Check live
  availability at shoot time; it was 1 unit at the last read.
- Cashier: `bounden7.testnet`, function-call key on
  `bounden11.testnet` allowlisted to `fulfil_order` +
  `issue_refund`, 0.25 NEAR allowance; worker running with
  `BOUNDEN_ATTESTATION_PROVIDER=near-ai`.
- Orders 0–3 already exist on the contract. The film's purchase
  creates **the next order** — the narration and captions never name
  a fixed order number; the order page shown is whichever order the
  take creates.
- Buyer: a testnet account holding Circle testnet USDC
  (faucet.circle.com flow), paying through its own wallet by
  following the checkout steps on screen.
- Tabs prepared, in order: storefront, buyer wallet, worker
  terminal, NearBlocks testnet explorer
  (`https://testnet.nearblocks.io`), attacks terminal, storefront
  `/constitution`.

## Structure and timings

Timings are guides, not a metronome: **cut when the thought lands,
not on a clock.** The only hard numbers are the total (≤59s) and the
one-second silences, which are structural.

### The hook — open on the heist (0:00–0:05)

One shot: the owner's hands/screen, typing the poisoned order note
live — the note that will order the cashier to send the treasury to
him. Real keystrokes (see Sound).

Owner's voice, plain, over the typing:

> "I built a shop that an AI runs. Then I tried to rob it."

No product name, no caption stack. The stakes are the whole open:
a man, his own shop, and a robbery in progress.

### Act 1 — one flowing take: buy, pay, fulfilled (0:05–0:20)

A single continuous take, about 15 seconds, no internal cuts: the
catalogue, into `licence-pro`, the buyer pays **the contract** with
`ft_transfer_call` on Circle's USDC contract (wallet confirm screen
shown before approving), and the same unbroken shot lands on the
order page as the on-duty cashier picks the order up — NEAR AI Cloud
judgement in the worker log, the `fulfil_order` call signed by the
leashed key — and the page flips Paid → Fulfilled with its
`near-ai:<hex>` attestation hash. The delivered test code
(`BOUNDEN-TEST-…`) is revealed in the same take.

Narration is sparse; let the take breathe. At most:

> "This is the shop. Prices in dollars, settled in a stablecoin."
>
> "I pay the contract. Not the agent. It never touches the money."

**Fallback:** if the payment or fulfilment waits on RPC/indexer lag,
do not cut to a pre-recorded transaction and do not show an explorer
link from an earlier run. Re-shoot the whole take with a **fresh
order**. If the worker is down, fix the worker and re-shoot — see
the honesty rules.

### Act 2 — three walls (0:20–0:50)

Each wall gets about ten seconds, and each refusal is followed by
**one full second of silence** before anything else happens. Small
reactions from the owner — a breath, a short laugh, a "okay" — stay
in. They are not edited out.

**Wall 1 — the poisoned note, dies at the WORKER (~0:20–0:30).**
Pay off the hook: the poisoned order from the opening is processed.
The worker log shows the injected text handled as data; the order is
simply fulfilled; the worker's signed-call log for the cycle shows
exactly one call — its own fulfilment. (The worker binary contains
no treasury call at all; a unit test in `worker/` greps the source
for it.)

> Owner: "The note in that order says: send the treasury to me."
> *(the order fulfils normally)* "It just did its job. There is no
> button for that in its code."

*One second of silence.*

**Wall 2 — the out-of-band refund, dies at the CONTRACT
(~0:30–0:40).** Broadcast the suite's signed refund attempt outside
the band (above the $50 cap, or after the 1-hour window). Show the
outcome on the order page / explorer: no money moves, the order
parks in `RefundRejected`, and the `bounden_refund_rejected` event
is on the tx page.

> Owner: "Fine. Refund me outside the rules." *(refusal lands)*
> "The contract said no. Not one cent moved."

*One second of silence.*

**Wall 3 — the payout redirect, dies at the PROTOCOL (~0:40–0:50).**
Attempt to use the cashier's own function-call key to call a token
transfer to an attacker-chosen address. Show the protocol-level
rejection: the key's permission names one receiver (the shop
contract) and two methods; NEAR rejects any other use before
contract code runs.

> Owner: "Last try. Its own key. My address." *(rejection lands)*
> "The protocol won't even ask the contract. Refused before it
> starts."

*One second of silence.*

**Fallback:** attacks are deterministic rejections, not races — a
wrong-reason error kills the take; fix the cause and re-run that
case live. If the prompt-injection order was already fulfilled in
rehearsal, place a **new** poisoned order for the take — order notes
are data, re-shooting with a fresh order changes nothing about the
claim. Re-typing the note for a reshoot is a fresh real attempt, not
a staged one.

### The climax — the closer (0:50–0:56)

A beat of silence. Then the cashier's reply, on screen as its own
message, verbatim:

> **"I can't. Here is the complete list of things I am able to
> do."**

*Then* reveal the allowlist: `/constitution`, the agent key panel —
receiver `bounden11.testnet`, methods `fulfil_order`,
`issue_refund`, allowance 0.25 NEAR. Hold on it. This line is the
peak of the film; everything before it is the run-up.

### End card (0:56–0:59)

Only now does the tagline appear, as the final caption:

> **Bounden. The agent is bound. The money is not.**

Small line under it: every power the agent holds is a public
on-chain object — the constitution page.

**Fallback:** none needed and none permitted — if `/constitution`
cannot render live state, the shop is not ready and the film is not
shot yet.

## Sound

Sound is half the film.

- **One voice: the owner's**, recorded in **one pass** over the
  locked picture. Not brochure-read; lines are short and written the
  way he actually talks. In the edit, do **not** clean the narration
  up: breaths, pauses, ums and stumbles stay. No comping together of
  words from different takes. Level-normalise only.
- **Real room sound:** the typing in the hook is the owner's actual
  keystrokes; mouse clicks and room tone run under the whole film.
  No stock effects.
- **The silences are real:** the one-second holds after each refusal
  carry room tone only — no sting, no swell.
- **Music:** none, or a very quiet bed under the hook and Act 1
  only, gone before Act 2. When in doubt, none.
- The breath before a risky click stays in. It is the sound of the
  stakes the hook promised.

## Retired: the Shade insert

V1's optional Shade insert is **not applicable and must not be
shot**: Stage 4 did not ship, and per `docs/SHADE.md` §2.7 the
verbatim fallback statement ships in the README instead. There is
nothing to insert.

## Shooting checklist

- [ ] Owner has said start. (The film is last by his direction; this
      script alone authorises nothing.)
- [ ] Worker on duty and verified (the supervised service is
      running with the NEAR AI Cloud provider); storefront in live
      mode with no fallback banner; `/constitution` renders live
      state.
- [ ] Live availability of `licence-pro` checked at shoot time;
      buyer account funded with Circle testnet USDC.
- [ ] Attack suite rehearsed live once, off camera, all five cases
      producing their documented rejections.
- [ ] Explorer tabs cleared of rehearsal transactions — every hash
      shown in the take is created in the take; the film's order is
      the next order on the contract, whatever number that is.
- [ ] Voice plan settled: one pass, one voice, no cleanup edit —
      and the room/keyboard recording set up before the first take,
      not after.
- [ ] Runtime ≤59s; the three one-second silences are in the cut;
      the closer line and the end-card tagline are the exact strings
      in this script.
- [ ] The rendered film is watched once, start to finish, before it
      is attached to anything.
