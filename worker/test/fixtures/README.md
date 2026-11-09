# Test fixtures — DOC-DERIVED, UNVERIFIED-LIVE

**These fixtures were hand-built from documentation. They are NOT
recordings of live API responses.**

Status as of Stage 3 pre-build (Mon 9 Nov 2026):

- NEAR AI Cloud's API key is a user account step (docs/PREFLIGHT.md
  §4). No key exists in this build environment, so **no live response
  has ever been captured** and nothing here may be cited as one.
- `chat-completion.json` follows the standard OpenAI chat-completions
  shape, which NEAR AI Cloud documents itself as compatible with. The
  model id (`openai/gpt-oss-120b`) is illustrative; the live model id
  is whatever the cloud.near.ai dashboard offers and is set via
  `NEAR_AI_CLOUD_MODEL` at deploy time.
- `attestation-report.json` is the riskiest fixture in the repo. The
  endpoint (`GET /v1/attestation/report?model=<id>`) is documented;
  its exact response field set is **not verified**. The fixture uses
  the documented TEE vocabulary (per-model binding, NVIDIA payload,
  Intel TDX quote) and visibly placeholder values. The parser in
  `src/ai-cloud.ts` accepts a generous evidence-field set and throws a
  typed `AiCloudShapeError` on anything unrecognised — it never
  silently passes.

**First hour of the live pass (Stage 3):** with a real key, capture
one real chat completion and one real attestation report, diff them
against these fixtures, narrow the parser's evidence-field list to
the observed set, replace these fixtures with the real (redacted)
captures, and update this file to say VERIFIED-LIVE with the date.
Until then, every claim in this folder is a claim about our parsing
code, not about NEAR AI Cloud's live behaviour.
