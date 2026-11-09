# Test fixtures — attestation AND completions VERIFIED-LIVE 9 Nov 2026

Status as of the Stage 3 live verification pack (Mon 9 Nov 2026,
~15:57 WAT), using the owner's NEAR AI Cloud key through the
registered connector (`custom.near-ai-cloud`; the key itself never
enters this repo):

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
  is the real 402 error body from the pre-credit key (inference was
  unblocked later on 9 Nov, when the credited key was issued under
  the owner's boundenn.near builder workspace).
- The model id matters: `openai/gpt-oss-120b` is **not** a valid
  model on this API (the attestation endpoint answered 400, "not a
  valid model name or alias", and it is absent from `GET /v1/models`).
  `deepseek/deepseek-v3.2` is verified live end to end for the
  attestation path and is the model these fixtures and tests use.
- `chat-completion.json` remains **DOC-DERIVED** and is kept for
  the synthetic `completionWith()` cases (escalate/malformed
  variants the live model was not asked to produce). The live
  captures below sit beside it and are the VERIFIED-LIVE evidence.
- **VERIFIED-LIVE completions (9 Nov 2026, ~15:57 WAT, after the
  $10 Builders credit landed on the key):** two judgement
  completions from `deepseek/deepseek-v3.2`, request bodies built
  by the worker's own `buildJudgementRequestBody` (plus
  `max_tokens: 512`, which the client does not set) for synthetic
  test orders:
  - `chat-completion-refund-in-band.verified-live-2026-11-09.json` —
    routine refund inside the stated 24-hour window → **approve**,
    completion `7a7b1ed10e7f47deae06150387dd5b9b`, 300 tokens.
  - `chat-completion-refund-out-of-band.verified-live-2026-11-09.json` —
    refund requested 30 days after delivery, outside the stated
    policy → **refuse**, completion
    `56474058c3bc40a884434645debe2811`, 300 tokens.
  Both parse under the strict parser; provider-level tests prove
  approve → `near-ai:` hash and refuse →
  `JudgementNotApprovedError` (thrown before any attestation
  fetch). Shape vs the doc-derived fixture: the live response adds
  null fields (`logprobs`, `reasoning_content`, `tool_calls`,
  `usage.prompt_tokens_details`, `usage.reasoning_tokens`) and its
  `id` is a bare 32-hex string, not a `chatcmpl-` id. **No
  attestation material and no separate inference-id field appear
  in the completion JSON** — attestation stays a separate endpoint
  fetch, as the worker's design assumes. Remaining Stage 3 step:
  the on-chain run (`BOUNDEN_ATTESTATION_PROVIDER=near-ai`) that
  lands a `near-ai:` hash on a real order — it rides with the v3
  deploy (funding-gated; see NOTES.md).

Claims from the attestation fixture and the two refund completion
fixtures are claims about real responses captured on the date
above. Claims from the doc-derived `chat-completion.json` are
claims about our parsing code only.
