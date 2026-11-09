# Test fixtures — attestation VERIFIED-LIVE 9 Nov 2026; completion still DOC-DERIVED

Status as of the Stage 3 live pass (Mon 9 Nov 2026), using the
owner's NEAR AI Cloud key through the registered connector
(`custom.near-ai-cloud`; the key itself never enters this repo):

- `attestation-report.json` is a **redacted real capture** of
  `GET /v1/attestation/report?model=deepseek/deepseek-v3.2`, taken
  9 Nov 2026. **VERIFIED-LIVE.** Redaction rule, applied mechanically:
  every string longer than 200 characters was truncated to its first
  48 characters plus a truncation marker. All keys, structure, short
  values, the model binding (`model_attestations[0].model`), the GPU
  verdict (`PASS`), `verified: true` and the TCB status are the real
  response's own values. The live shape is NOT the flat shape the
  docs suggested: the report carries `gateway_attestation`,
  `model_attestations`, `ohttp_attestation` and `ohttp_key_config`,
  and the model binding lives inside the `model_attestations`
  entries. `src/ai-cloud.ts` was narrowed to this observed shape
  (the legacy flat shape is still accepted).
- A second capture sits beside it, verbatim and unredacted:
  `attestation-report.verified-live-2026-11-09.json` for
  `Qwen/Qwen3.6-35B-A3B-FP8` (309 KB). Its entry binds via
  `model_name` and carries `intel_quote` / `nvidia_payload` — the
  entry field names differ by serving provider, and the parser
  accepts both verified forms, failing closed on anything else.
  `chat-completion-error-no-limit.verified-live-2026-11-09.json`
  is the real 402 error body described below.
- The model id matters: `openai/gpt-oss-120b` is **not** a valid
  model on this API (the attestation endpoint answered 400, "not a
  valid model name or alias", and it is absent from `GET /v1/models`).
  `deepseek/deepseek-v3.2` is verified live end to end for the
  attestation path and is the model these fixtures and tests use.
- `chat-completion.json` is still **DOC-DERIVED, not a live
  capture.** On 9 Nov 2026 a real judgement-shaped completion
  request (built by the worker's own `buildJudgementRequestBody`)
  was answered **402 — "No spending limit configured. Please
  contact support to set up credits."** Inference on this account
  is gated until credits / a spending limit are set up in the
  cloud.near.ai dashboard (the $10 NEAR Builders credit in
  docs/PREFLIGHT.md §4 is the expected route). The fixture follows
  the standard OpenAI chat-completions shape, which NEAR AI Cloud
  documents itself as compatible with; only its `model` field was
  corrected to `deepseek/deepseek-v3.2`. **Remaining live-pass step:**
  once credits exist, capture one real completion, diff it against
  this fixture, replace it, and mark this file fully VERIFIED-LIVE.

Until that last step lands, claims from the completion fixture are
claims about our parsing code, not about NEAR AI Cloud's live
behaviour. Claims from the attestation fixture are claims about a
real response captured on the date above.
