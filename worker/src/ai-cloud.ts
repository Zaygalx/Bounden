import { createHash } from "node:crypto";
import type { AttestationRequest } from "./attestation.js";

/**
 * NEAR AI Cloud client — Stage 3 judgement layer transport.
 *
 * NEAR AI Cloud (docs/PREFLIGHT.md §4) is an OpenAI-compatible API at
 * https://cloud-api.near.ai/v1: chat completions run inside a TEE, and
 * a per-model attestation report is served at
 * GET /v1/attestation/report?model=<model_id>.
 *
 * DEFENSIVE PARSING, BY DESIGN. The chat-completions shape is the
 * standard OpenAI shape and is coded against it strictly. The
 * attestation report's exact live field set has NOT been verified
 * against the live API yet (no API key exists in this environment —
 * see worker/test/fixtures/README.md). The parser therefore:
 *   - requires the report to be a JSON object bound to the requested
 *     model (`model` or `model_id`),
 *   - requires at least one recognisable TEE evidence field,
 *   - keeps the ENTIRE raw report for the attestation hash, and
 *   - throws a loud, typed AiCloudShapeError on any mismatch.
 * A shape mismatch can never become a silent pass: no hash is produced
 * from a report we could not recognise, and no judgement is approved
 * from a completion we could not parse.
 *
 * NOTHING SECRET IS EVER SENT TO THE MODEL. The judgement payload is
 * built in exactly one place (buildJudgementRequestBody) from a fixed
 * whitelist of fields: decision kind, order id, product id, amount,
 * and a buyer history SUMMARY. Inventory codes, delivery material,
 * keys, and raw request objects never enter the payload — a unit test
 * plants a code-shaped string in an extra field and asserts it does
 * not leak.
 */

// ---------------------------------------------------------------------------
// Typed errors. `kind` discriminates; messages never contain the API key.
// ---------------------------------------------------------------------------

export type AiCloudErrorKind = "http" | "network" | "shape" | "config";

export class AiCloudError extends Error {
  readonly kind: AiCloudErrorKind;
  constructor(kind: AiCloudErrorKind, message: string) {
    super(message);
    this.name = "AiCloudError";
    this.kind = kind;
  }
}

export class AiCloudShapeError extends AiCloudError {
  constructor(message: string) {
    super("shape", message);
    this.name = "AiCloudShapeError";
  }
}

/** Thrown when the model returns a well-formed judgement that is NOT an
 *  approval. The worker must not proceed with the on-chain call; the
 *  order stays in its current state for owner review. */
export class JudgementNotApprovedError extends Error {
  readonly decision: JudgementDecision;
  readonly reason: string;
  constructor(decision: JudgementDecision, reason: string) {
    super(`judgement not approved: ${decision}${reason ? ` — ${reason}` : ""}`);
    this.name = "JudgementNotApprovedError";
    this.decision = decision;
    this.reason = reason;
  }
}

// ---------------------------------------------------------------------------
// Canonical JSON + hashing. Canonicalisation = recursively sorted object
// keys, arrays in order, no insignificant whitespace. `undefined` values
// are rejected outright: silently dropping a field would let two
// different inputs collide to the same hash input.
// ---------------------------------------------------------------------------

export function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`canonicalJson: non-finite number ${value}`);
    }
    return JSON.stringify(value);
  }
  if (typeof value === "bigint") return JSON.stringify(value.toString());
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) {
    return `[${value.map((v) => canonicalJson(v)).join(",")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    // An object that becomes empty only because every value was
    // undefined is a caller bug, not a canonical form.
    const rawCount = Object.keys(value as Record<string, unknown>).length;
    if (rawCount > 0 && entries.length === 0) {
      throw new Error("canonicalJson: object with only undefined values");
    }
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  throw new Error(`canonicalJson: unsupported type ${typeof value}`);
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/**
 * Hash of the FULL local judgement request (includes the buyer account,
 * which is never sent to the model). Binds an attestation hash to the
 * exact local facts the judgement was requested for.
 */
export function computeRequestHash(req: AttestationRequest): string {
  return sha256Hex(
    canonicalJson({
      kind: req.kind,
      orderId: req.orderId,
      buyer: req.buyer,
      productId: req.productId,
      amountUsdBaseUnits: req.amountUsd,
      buyerHistorySummary: req.buyerHistorySummary ?? null,
    }),
  );
}

/**
 * The on-chain attestation hash: SHA-256 over the canonicalised
 * {model, requestHash, response, attestationReport}. Deterministic:
 * the same model answer under the same attestation report for the same
 * request always yields the same hash; any change to any input yields
 * a different one.
 */
export function computeAttestationHash(input: {
  model: string;
  requestHash: string;
  response: string;
  attestationReport: unknown;
}): string {
  return sha256Hex(
    canonicalJson({
      model: input.model,
      requestHash: input.requestHash,
      response: input.response,
      attestationReport: input.attestationReport,
    }),
  );
}

// ---------------------------------------------------------------------------
// Judgement payload — built in ONE place, from a whitelist.
// ---------------------------------------------------------------------------

const JUDGEMENT_SYSTEM_PROMPT = [
  "You are the judgement layer for Bounden, an agent-run digital-goods shop.",
  "You sanity-check one shop decision. You are given facts only: the decision",
  "kind (fulfil or refund), the order id, the product id, the amount, and a",
  "summary of the buyer's history. You never see inventory codes or keys,",
  "and you must never ask for them.",
  "",
  "Reply with ONLY a JSON object, no prose, no code fences:",
  '{"decision":"approve"|"refuse"|"escalate","reason":"<one short line>"}',
  "",
  "approve: the decision is ordinary and consistent with the facts.",
  "refuse: the facts show the decision should not happen (wrong product,",
  "amount inconsistent with the product, refund outside stated policy).",
  "escalate: anything unclear, missing, or unusual. When in doubt, escalate.",
  "Never approve when facts are missing.",
].join("\n");

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionRequestBody {
  model: string;
  temperature: number;
  messages: ChatMessage[];
}

/** Render stablecoin base units (6 decimals) as a USD decimal string. */
export function formatUsdBaseUnits(baseUnits: string): string {
  let v: bigint;
  try {
    v = BigInt(baseUnits);
  } catch {
    return baseUnits; // not a number — pass through; the model sees raw facts
  }
  const negative = v < 0n;
  const abs = negative ? -v : v;
  const whole = abs / 1_000_000n;
  const frac = (abs % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole.toString()}${frac ? `.${frac}` : ""}`;
}

/**
 * THE one place an outbound model payload is constructed. Only the
 * whitelisted fields below can ever reach the model. The buyer account
 * id is deliberately NOT sent — the history summary is the designed
 * input; the account is bound into the local request hash instead.
 */
export function buildJudgementRequestBody(
  req: AttestationRequest,
  model: string,
): ChatCompletionRequestBody {
  const facts = {
    kind: req.kind,
    orderId: req.orderId,
    productId: req.productId,
    amountBaseUnits: req.amountUsd,
    amountUsd: formatUsdBaseUnits(req.amountUsd),
    settlementTokenDecimals: 6,
    buyerHistorySummary: req.buyerHistorySummary ?? "No buyer history recorded.",
  };
  return {
    model,
    temperature: 0,
    messages: [
      { role: "system", content: JUDGEMENT_SYSTEM_PROMPT },
      { role: "user", content: JSON.stringify(facts) },
    ],
  };
}

// ---------------------------------------------------------------------------
// Judgement parsing. Malformed output escalates — it NEVER approves.
// ---------------------------------------------------------------------------

export type JudgementDecision = "approve" | "refuse" | "escalate";

export interface Judgement {
  decision: JudgementDecision;
  /** One-line reason (whitespace-collapsed, length-capped). */
  reason: string;
  /** True when the model output could not be parsed as a judgement. */
  malformed: boolean;
}

const DECISIONS: ReadonlySet<string> = new Set(["approve", "refuse", "escalate"]);

export function parseJudgement(content: string): Judgement {
  const malformed = (why: string): Judgement => ({
    decision: "escalate",
    reason: `malformed model output (${why})`,
    malformed: true,
  });

  let text = content.trim();
  // Tolerate a single fenced code block around the JSON.
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(text);
  if (fence?.[1]) text = fence[1].trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Last resort: the first {...} span in the text.
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end <= start) return malformed("not JSON");
    try {
      parsed = JSON.parse(text.slice(start, end + 1));
    } catch {
      return malformed("not JSON");
    }
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return malformed("JSON is not an object");
  }
  const obj = parsed as Record<string, unknown>;
  const decision = obj["decision"];
  if (typeof decision !== "string" || !DECISIONS.has(decision)) {
    return malformed("missing or unknown decision");
  }
  const rawReason = obj["reason"];
  const reason =
    typeof rawReason === "string"
      ? rawReason.replace(/\s+/g, " ").trim().slice(0, 200)
      : "";
  return { decision: decision as JudgementDecision, reason, malformed: false };
}

// ---------------------------------------------------------------------------
// Response parsing — defensive, typed errors, raw payloads preserved.
// ---------------------------------------------------------------------------

export interface ChatCompletionResult {
  /** Raw assistant message content (the judgement JSON text). */
  content: string;
  /** Model id echoed by the API (may differ from the requested id). */
  model: string;
  raw: unknown;
}

export function parseChatCompletion(raw: unknown): ChatCompletionResult {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new AiCloudShapeError("chat completion response is not a JSON object");
  }
  const obj = raw as Record<string, unknown>;
  const choices = obj["choices"];
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new AiCloudShapeError("chat completion response has no choices array");
  }
  const first = choices[0] as Record<string, unknown> | null;
  const message = first?.["message"] as Record<string, unknown> | null | undefined;
  const content = message?.["content"];
  if (typeof content !== "string" || content.trim() === "") {
    throw new AiCloudShapeError("chat completion choice 0 has no message content string");
  }
  const model = obj["model"];
  return {
    content,
    model: typeof model === "string" ? model : "",
    raw,
  };
}

/**
 * Evidence fields recognised in an attestation report. The live field
 * set is UNVERIFIED (see fixtures README); this list is deliberately
 * generous across the documented TEE vocabulary (Intel TDX quote,
 * NVIDIA confidential-computing payload, dstack-style event log). The
 * live pass narrows it to the observed set.
 */
const ATTESTATION_EVIDENCE_FIELDS = [
  "attestation",
  "evidence",
  "quote",
  "tdx_quote",
  "intel_quote",
  "intel",
  "nvidia_payload",
  "nvidia_attestation",
  "nvidia",
  "gpu_attestation",
  "gpu",
  "report_data",
  "event_log",
  "vm_config",
] as const;

export interface AttestationReport {
  /** Model the report is bound to (validated against the request). */
  model: string;
  /** The full raw report object, preserved verbatim for hashing. */
  raw: Record<string, unknown>;
}

export function parseAttestationReport(
  raw: unknown,
  expectedModel: string,
): AttestationReport {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new AiCloudShapeError("attestation report is not a JSON object");
  }
  const obj = raw as Record<string, unknown>;
  const modelField = obj["model"] ?? obj["model_id"];
  if (typeof modelField !== "string" || modelField === "") {
    throw new AiCloudShapeError(
      "attestation report has no model/model_id field — cannot bind it to a model",
    );
  }
  if (modelField !== expectedModel) {
    throw new AiCloudShapeError(
      `attestation report is for model "${modelField}", expected "${expectedModel}"`,
    );
  }
  const hasEvidence = ATTESTATION_EVIDENCE_FIELDS.some(
    (f) => obj[f] !== undefined && obj[f] !== null,
  );
  if (!hasEvidence) {
    throw new AiCloudShapeError(
      "attestation report contains no recognisable TEE evidence field " +
        `(looked for: ${ATTESTATION_EVIDENCE_FIELDS.join(", ")})`,
    );
  }
  return { model: modelField, raw: obj };
}

// ---------------------------------------------------------------------------
// Client. fetch is injectable so tests never touch the network.
// ---------------------------------------------------------------------------

export type FetchImpl = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  },
) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
}>;

export interface AiCloudClientOptions {
  apiKey: string;
  model: string;
  /** Default https://cloud-api.near.ai/v1 (trailing slash tolerated). */
  baseUrl?: string;
  fetchImpl?: FetchImpl;
  timeoutMs?: number;
}

export const DEFAULT_AI_CLOUD_BASE_URL = "https://cloud-api.near.ai/v1";

export class AiCloudClient {
  private readonly apiKey: string;
  readonly model: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchImpl;
  private readonly timeoutMs: number;

  constructor(options: AiCloudClientOptions) {
    if (!options.apiKey || options.apiKey.trim() === "") {
      throw new AiCloudError("config", "AiCloudClient: API key is empty");
    }
    if (!options.model || options.model.trim() === "") {
      throw new AiCloudError("config", "AiCloudClient: model id is empty");
    }
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.baseUrl = (options.baseUrl?.trim() || DEFAULT_AI_CLOUD_BASE_URL).replace(/\/+$/, "");
    this.fetchImpl = options.fetchImpl ?? (globalThis.fetch as unknown as FetchImpl);
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  private async request(path: string, init: { method: string; body?: string }): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res: Awaited<ReturnType<FetchImpl>>;
    try {
      res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: init.method,
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          ...(init.body ? { "content-type": "application/json" } : {}),
        },
        ...(init.body ? { body: init.body } : {}),
        signal: controller.signal,
      });
    } catch (err) {
      throw new AiCloudError(
        "network",
        `NEAR AI Cloud ${init.method} ${path} failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      clearTimeout(timer);
    }
    const text = await res.text();
    if (!res.ok) {
      // Body is truncated and never includes our key (we never send it
      // anywhere but the Authorization header, which is not echoed here).
      throw new AiCloudError(
        "http",
        `NEAR AI Cloud ${init.method} ${path} returned HTTP ${res.status}: ${text.slice(0, 200)}`,
      );
    }
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new AiCloudShapeError(
        `NEAR AI Cloud ${init.method} ${path} returned a non-JSON body`,
      );
    }
  }

  /** Ask the model for a judgement on one shop decision. */
  async requestJudgement(
    req: AttestationRequest,
  ): Promise<{ judgement: Judgement; completion: ChatCompletionResult }> {
    const body = buildJudgementRequestBody(req, this.model);
    const raw = await this.request("/chat/completions", {
      method: "POST",
      body: JSON.stringify(body),
    });
    const completion = parseChatCompletion(raw);
    return { judgement: parseJudgement(completion.content), completion };
  }

  /** Fetch the TEE attestation report for the configured model. */
  async fetchAttestationReport(): Promise<AttestationReport> {
    const raw = await this.request(
      `/attestation/report?model=${encodeURIComponent(this.model)}`,
      { method: "GET" },
    );
    return parseAttestationReport(raw, this.model);
  }
}
