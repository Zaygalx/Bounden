# Bounden film — shoot log (every on-chain action, in order)

Contract: bounden11.testnet · Token: Circle testnet USDC
3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af
Buyer (the robber = the owner): fe9591cc09aa84478e6c8c622c402f2007eae6e65182976948ab23b1538b43f0

## Prep (10 Nov 2026, before the takes)

- NEAR top-up bounden7 -> owner implicit, 0.05 NEAR:
  tx `8W6YPttBSnfvja7yJy2BLAw5NvW32Jz7vvhBisr1H1YN`
- Treasury withdrawal (owner-signed `withdraw_treasury`, 20 USDC,
  destination hard-coded to the owner account):
  tx `DWZ4Sr5CtoJG2mbDP666mws97RZkTrK7pUzfd5CSBcAp`
  event `bounden_treasury_withdrawn` {amount: "20000000"}
- Balances after prep: buyer NEAR 0.0660 / USDC 20.00;
  treasury 20.00 USDC; inventory api-credit-basic 2, licence-pro 1;
  next order id 7.
- Restock +2 api-credit-basic (FileVault.addCodes, worker stopped
  and restarted healthy, leash re-verified): codes
  BOUNDEN-TEST-CREDIT-0007 (commitment 811333c894e1c70a…) and
  BOUNDEN-TEST-CREDIT-0008 (commitment 631b5a722d89f725…);
  owner-signed `add_inventory_commitments` tx
  `ErsJ2qBJmMtF9hLkKFx9hpK6YGxfskDpBcN4bFAh4rEm`;
  `inventory_available` now api-credit-basic 4, licence-pro 1.
- **Act 1 take 1 — FAILED in the take, on the record.** The filmed
  Buy click built the batch; the broadcast's `create_order` landed
  (order 7, tx `2gbGNiirPvjzNiDfEpCZQpyLqJkXv93k7N5w9MvugrnY`) but
  the 100-TGas `ft_transfer_call` could not be prepaid from the
  buyer's 0.0656 NEAR (prepaid cost 0.1009 NEAR — the balance must
  cover the full prepaid gas, most of which refunds). Order 7
  stands Created/unpaid on the book, like order 5. Remedy: NEAR
  top-up buyer-2 -> owner implicit, 0.09 NEAR, tx
  `HPJjnS5fZUmVEraAJVbkBuUibmHY6Xh5LzGMKdMRcvr3`; buyer now
  0.1554 NEAR / 20.00 USDC. Reshoot = take 2, fresh order 8.
- **Act 1 take 2** — order 8 created (tx
  `Fi1ktpiaicDj524XsJop4QaH1QCfTysH5dxstGzzXJDX`), paid
  (`57te5W9GvBmqARvY5e4wfgkGKUzSqbxnhR6W3pFPrdHN`), Fulfilled by the
  on-duty cashier on a first-draw approval (fulfil tx
  `HnPySG5TYXSnMScpVjtgpZ1ndzN5t5k44emdG9wj7Lok`, attestation
  `near-ai:c9dba5b99b972442efd9d64154db3d3c85a3fe19562125ec61eaf6221345a561`).
  The collection beat stalled in the take: the seeded Meteor
  session never completed the NEP-413 signature (the counter
  correctly released nothing).

## Continuation (later the same morning)

- **Order 7's state, for the record:** Created, unpaid, exactly as
  take 1 left it. It holds no inventory and no funds; it is take
  1's honest remainder, like order 5.
- **Why no wallet popup can be driven in this browser (checked, not
  assumed):** the headless capture browser reaches external sites
  only through a local CONNECT relay (film/shoot/relay.mjs; the
  egress proxy cannot be tunnelled by the headless shell directly
  and its TLS interception is outside the shell's trust store —
  capture plumbing, disclosed here). Through it: Meteor's web
  wallet is served a CDN block page ("Sorry, you have been
  blocked", also 403 to curl) — it cannot load at all. MyNearWallet
  is in limited mode: its landing offers no account access and its
  own notice says app approvals were switched off from
  1 November. Both findings are the capture sandbox's limits, not
  the product's: the owner collected order 6 through real Meteor
  on his phone the same morning.
- **The collection pickup (order 8), executed for real three
  times** via film/shoot/collect.mjs — the note built exactly as
  web/src/lib/collect.ts builds it, signed NEP-413 with the buyer
  of record's key, filed at the shop's delivery counter
  (production rendezvous), answered by the on-duty cashier
  (journal: "delivery counter: request answered", outcome ready),
  and the sealed reply opened with the one-time key. Result every
  time: **BOUNDEN-TEST-CREDIT-0005**, SHA-256
  `b1937225ba11ad5ad88221c006f45fd95928c978ab9add8a71a9cb312582a6de`
  == the commitment order 8 consumed; delivery evidence hash
  `d146e3df708b85f9398135020429b6671c30c57170e9bed6ae8eff2733415547`
  == the hash on order 8's page. Transcript:
  film/shoot/out/collect-transcript.txt. Filmed as: browser
  bookends on order 8's page (film/render/act1-pickup/) + a
  terminal segment replaying the transcript verbatim
  (film/render/pickup-term/), per the script's terminal rule.
- **Incident:** a sandbox service restart during the pickup
  killed the local shop server and both cashier services; the
  worker + bridge were restored from their unit files (watchdog
  procedure) and the leash re-verified before any filming
  continued. No take spans the gap.
- **Voice re-cast (owner's direction, ~07:23 WAT):** the British
  takes (en_GB alan / northern_english_male) are discarded —
  parked under film/assets/voice/gb-discarded/, not used. All
  twelve lines re-rendered in clear neutral English: narrator
  en_US-ryan-medium, cashier en_US-joe-medium (dry, no scale
  tricks). Generator: film/shoot/voices.sh; durations re-mapped
  in film/assets/voice/durations.json (hook now 3.18s — inside
  its 4s window).

## Continuation — film finished (10 Nov 2026)

- COLLECTION PICKUP on order 8: DONE through the counter's real
  channel (locally signed NEP-413 note, byte-identical to the
  site's collect flow; wallet findings and the full reasoning
  in this log's earlier continuation entry and in
  docs/FILM.md). Item: BOUNDEN-TEST-CREDIT-0005, hash-matched
  to the consumed commitment; evidence hash matches the order
  page. Filmed as browser bookends (render/act1-pickup/) + the
  verbatim terminal replay (render/pickup-term/).
- VOICES: re-cast per the owner — narrator en_US-ryan-medium,
  cashier en_US-joe-medium; durations re-mapped.
- CHARACTER: animated (film/shoot/cashier-anim.html +
  render-cashier.mjs): idle bob/blink/glances, walks and hops
  in the corner zone, verdict stamp slam, puzzled/shake/flat
  reactions, mouth flaps on his lines. Proof reel:
  film/cashier-proof-reel.mp4 (14s over a take background).
- WALL 1 (order 9): created Fw4bY9n3oVcqqPAAqQDGNka93WHYN2yqz1hWL85R68Sq;
  pay-poison 4ETi2vpAg7tH3RCk1txYQjX6WAu5hp2i3ETS9NmYHCmJ;
  judgement approved FIRST DRAW (near-ai:91d92e8a…), no restart;
  fulfil 3fwf2K2uEDmY5Bzk5yCinFmYkpFha3QWukNvWCJ1yekK.
  Explorer glance re-filmed on NEAR Rocks (NearBlocks does not
  load through this network — see FILM.md deviation 4).
- WALL 2 (order 2): issue_refund broadcast live, tx
  65BVKJAJZDv6y8nEgfsGuJZf2GzA97rpYAPcdi7c6dYA; event
  bounden_refund_rejected (within_cap true, within_window
  false); order RefundRejected; owner USDC 0.00 -> 0.00.
- WALL 3: ft_transfer redirect rejected at validation,
  AccessKeyReceiverMismatchActionError (verbatim in
  out/wall3-transcript.txt + probe). Constitution key panel
  filmed for the why-beat and the climax hold.
- ASSEMBLY (film/shoot/assemble.py): 59.000s on the map;
  silences measured room-tone-only; cashier absent from the
  memo/event explorer shots, the collection reveal and the
  permission holds (one assembly pass was caught putting him
  in the wall-2 event shot and was corrected). Master:
  film/bounden-demo-master.mp4; X copy: film/bounden-demo-x.mp4.
- serve.sh secret literals scrubbed to runtime reads and
  boot-tested. Docs: FILM.md as-shot note, NOTES.md entry,
  SUBMISSION.md #11 closed. NOT posted; owner reviews first.
