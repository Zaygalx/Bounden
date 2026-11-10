window.__STAGE__ = {
 "mode": "term",
 "title": "WALL 2 — THE OUT-OF-BAND REFUND, BROADCAST LIVE",
 "startDelay": 400,
 "lines": [
  {
   "t": "order 2 before: Fulfilled    paid_at: 1794247854805346800  (9 Nov — the one-hour window is long past)",
   "cls": "cmd",
   "wait": 1000
  },
  {
   "t": "the cashier’s leashed key signs:  issue_refund { order_id: 2, attestation_hash: null }",
   "cls": "cmd",
   "wait": 1200
  },
  {
   "t": "wall2 tx: 65BVKJAJZDv6y8nEgfsGuJZf2GzA97rpYAPcdi7c6dYA",
   "cls": "dim",
   "wait": 900
  },
  {
   "t": "logs: EVENT_JSON {\"standard\":\"bounden\", \"version\":\"1.0.0\", \"event\":\"bounden_refund_rejected\", \"data\":[{\"order_id\":2, \"amount\":\"10000000\", \"within_cap\":true, \"within_window\":false}]}",
   "cls": "bad",
   "wait": 1700
  },
  {
   "t": "order 2 after: RefundRejected",
   "cls": "bad",
   "wait": 800
  },
  {
   "t": "owner USDC before = 0.00    after = 0.00        contract USDC = 40.00",
   "cls": "good",
   "wait": 900
  }
 ]
};
