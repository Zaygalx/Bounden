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
- REWORK PASS 1 (10 Nov 2026): owner rejected the placard
  presenter (flat, not alive) and the v3 film's clarity.
  Built the MASCOT (film/shoot/mascot-anim.html +
  render-mascot.mjs, cues-mascot-proof.json): full-colour
  cartoon bear, honey-brown/cream, deep-green apron; walk,
  wave, speak, point, card, stamp slam, shrug, shake,
  thumbs-up at 24fps. Proof reel film/mascot-proof-reel.mp4
  (15.5s over the Act 1 background, his intro line at 2.7s).
  Script v4 written into docs/FILM.md; ALL lines recorded
  en_US-joe-medium (voices-v4.sh -> assets/voice/v4/,
  durations merged): hook 9.10, act1 12.09, collect 3.54,
  w1 12.14, w2 10.65, w3 10.50, climax 7.96. Narrator (ryan)
  retired. README disclosure updated. Film NOT re-assembled —
  pass 2 waits on the owner's word on the bear + the words.
- REWORK PASS 1B (10 Nov 2026): owner rejected the v4 WORDS
  (no story) and fired the bear. Story approved in chat
  (customer with a history and a reason; walls answer his
  doubt; climax = why a stranger could buy). New presenter:
  the owner's own supplied image — red hooded cloak, gold face
  wrap. Cut out with rembg (isnet + alpha matting), cleaned
  (3x upscale, alpha erosion, fringe decontamination, unsharp)
  -> assets/figure/figure-master.png. Animation shipped: 2.5D
  warp rig (figure_anim.py: cloak sway, breathing, feathered
  head layer for turns/tilts/shake; compositor glides + leans).
  Wan I2V NOT used — Kaggle GPU committed to THE SAME WAY
  Stage D; standing no-crowding order; brief's fallback clause.
  Voice: Kokoro-82M via kokoro-onnx, LOCAL CPU (torch index
  read-timed-out via the proxy; onnx route needs none),
  am_michael, en-US, speed 1.0; voices-v5.py asserts the
  approved lines verbatim, sentence-joined -> assets/voice/v5/.
  Durations: hook 10.06, choice 11.25, purchase 9.88,
  wall1 12.29, wall2 6.01, wall3 4.83, climax 9.78 — TOTAL
  64.09s, un-trimmed (59s map LIFTED by the owner).
  Proof reel film/figure-proof-reel.mp4 (build_figure_reel.py):
  19.5s over the order-8 delivery-counter page; figure 300px
  bottom-right; glide-in 2.8s, HOOK from 0.9s, gesture lean on
  sentence 2, slow head-shake (3.4deg x2) on the theft line,
  idle settle; captions = the hook's three sentences. Verified:
  frames eyeballed at 5 timepoints, silence-detect confirms
  voice 0.94->10.92s, peak -1.45 dB. Docs: FILM.md Script v5,
  README disclosure (figure wording), NOTES entry. Film NOT
  re-assembled — pass 2 waits on the owner's approval of the
  figure + voice and assembles at the story's length.
- REWORK PASS 1C (10 Nov 2026): owner rejected the 1b
  ANIMATION outright — a treated still is not a living
  character; "let it swing hand... If it's Blender you will
  use, use Blender." Warp rig figure_anim.py RETIRED.
  Presenter rebuilt as a rigged 3D character in Blender
  5.2.3 (figure3d_build.py; baked scene figure3d.blend):
  crimson folded cloak skinned to chest/spine + 6 lagged
  hem bones, hood with flopped point, gold wrap + tail,
  shadowed face (none invented), bell sleeves with real
  hands, legs walking under the cloak — 25 bones.
  Choreography semantic, conjugated into bone space, baked
  at 24fps: walk-in + turn, swinging-hand wave, beckon,
  head-shake on the theft line, hand-to-chest, point on
  "Read my rules", open arms, nod, bow, breathing idle.
  Render: Workbench (Eevee ~108s/frame and Cycles ~33s/
  frame measured and rejected on this box; Workbench
  ~1.7s/frame at 1200x982), CPU-only, no Kaggle use.
  Proof reel v2 film/figure-proof-reel-v2.mp4
  (build_figure_reel_v2.py): 24.6s over the order-8
  delivery-counter page, hook + choice in the approved
  Kokoro voice (track-verified 0.96->22.49s), seven caption
  blocks, figure 300px bottom-right, evidence uncovered.
  Docs: FILM.md pass 1c, README disclosure corrected,
  NOTES entry. Film NOT re-assembled — pass 2 waits on the
  owner's approval of the animated character.

PASS 2 — FINAL ASSEMBLY (10 Nov 2026). Owner approved the
Blender character with one amendment: bigger (proof 300px
was straining on his phone). Character baked at 501px tall
on the 1080p frame (layer 1154x944 at x946,y136, hem flush
with frame bottom), measured on the baked alpha. Film
choreography: figure3d_film.py — proof hook verbatim plus
choice/purchase/walls/climax; 1959 frames rendered under
xvfb (Blender aborts headless without libEGL; run under
Xvfb/GLX), Workbench ~1.5s/frame. Timeline frame-quantized
to 2086 frames / 86.92s; voice starts 0.90/12.20/24.75/
38.60/52.40/61.50/70.40; vacates as v1 (memo glance, event
glance, collection reveal, both permission holds); climax
step-aside + fade. Captions: captions_v5.py (sentence
windows from the wavs + one beat chip per beat).
assemble2.py -> bounden-demo-master.mp4 (1920x1080,
86.96s, 8.2MB) + bounden-demo-x.mp4 (720p, 3.3MB); v1 cut
preserved as *-v1.mp4. Verified: frames at every beat and
inside every vacate window; master silence map matched to
caption windows; no beat-level size exception. NOT posted
— owner reviews first.
