import {
  AiCloudClient,
  computeAttestationHash,
  computeRequestHash,
  JudgementNotApprovedError,
  DEFAULT_AI_CLOUD_BASE_URL,
  type FetchImpl,
} from "./ai-cloud.js";
import {
  NullAttestationProvider,
  LocalHashAttestationProvider,
  type AttestationProvider,
  type AttestationRequest,
} from "./attestation.js";
import type { Logger } from "./logger.js";

/**
 * NearAiCloudAttestationProvider — the real Stage 3 judgement layer,
 * behind the Stage 2 AttestationProvider seam.
 *
 * Flow per consequential decision (fulfil / refund):
 *   1. Build the judgement payload (ai-cloud.ts, whitelist-built —
 *      facts only, never inventory material).
 *   2. Ask NEAR AI Cloud (TEE inference) for a structured judgement:
 *      approve / refuse / escalate.
 *   3. NOT approve → throw JudgementNotApprovedError. The worker's
 *      cycle catches it and does NOT make the on-chain call; the order
 *      keeps its current state for owner review. (Returning null would
 *      mean "no judgement" and the worker would proceed — a refuse
 *      must never silently degrade into that.)
 *   4. Approve → fetch the model's attestation report, compute the
 *      deterministic attestation hash over
 *      {model, requestHash, response, attestationReport}, return it as
 *      `near-ai:<hex>` for the contract to store on the order.
 *
 * Fail-closed throughout: transport errors, HTTP errors, and report
 * shape mismatches all throw. A hash is only ever produced from a real
 * model approval plus a recognised attestation report.
 *
 * NO API KEY → REFUSAL, NOT FABRICATION. If NEAR_AI_CLOUD_API_KEY is
 * absent the provider logs loudly at startup and on every request, and
 * returns null (NullAttestationProvider behaviour): orders proceed
 * under the key leash + contract bands alone, and the absence of a
 * judgement is visible on-chain as a missing hash.
 *
 * Outcomes are cached per request hash for the life of the process:
 * the worker polls, and re-asking the model about the same unchanged
 * order every cycle would burn credit and could flip a decision
 * between cycles. A changed order (state/amount/history) hashes
 * differently and is judged fresh.
 */

export interface NearAiCloudProviderOptions {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  /** Pre-built client (tests). When given, apiKey/model come from it. */
  client?: AiCloudClient;
  fetchImpl?: FetchImpl;
  logger: Logger;
}

type CachedOutcome =
  | { type: "hash"; hash: string }
  | { type: "not-approved"; decision: "refuse" | "escalate"; reason: string };

export class NearAiCloudAttestationProvider implements AttestationProvider {
  readonly name: string;
  private readonly client: AiCloudClient | null;
  private readonly logger: Logger;
  private readonly cache = new Map<string, CachedOutcome>();

  constructor(options: NearAiCloudProviderOptions) {
    this.logger = options.logger;
    if (options.client) {
      this.client = options.client;
      this.name = `near-ai-cloud (model ${options.client.model}, TEE judgement + attestation hash)`;
      return;
    }
    const apiKey = options.apiKey?.trim() ?? "";
    const model = options.model?.trim() ?? "";
    if (apiKey === "") {
      this.client = null;
      this.name = "near-ai-cloud DISABLED (NEAR_AI_CLOUD_API_KEY absent — judgements refused, no hash fabricated)";
      this.logger.error(
        "NEAR AI Cloud attestation provider selected but NEAR_AI_CLOUD_API_KEY is absent: " +
          "judgement layer DISABLED. Orders proceed under the key leash and contract bands only; " +
          "no attestation hash will be stored. This is a configuration refusal, not a silent fallback.",
      );
      return;
    }
    if (model === "") {
      this.client = null;
      this.name = "near-ai-cloud DISABLED (NEAR_AI_CLOUD_MODEL absent — judgements refused, no hash fabricated)";
      this.logger.error(
        "NEAR AI Cloud attestation provider selected and an API key is present, but " +
          "NEAR_AI_CLOUD_MODEL is absent: judgement layer DISABLED rather than guessing a model id.",
      );
      return;
    }
    this.client = new AiCloudClient({
      apiKey,
      model,
      ...(options.baseUrl ? { baseUrl: options.baseUrl } : {}),
      ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
    });
    this.name = `near-ai-cloud (model ${model}, TEE judgement + attestation hash)`;
  }

  get enabled(): boolean {
    return this.client !== null;
  }

  async getAttestationHash(req: AttestationRequest): Promise<string | null> {
    if (this.client === null) {
      this.logger.error(
        "judgement requested but NEAR AI Cloud provider is disabled (no API key/model): " +
          "returning no attestation hash — the decision proceeds WITHOUT a judgement layer",
        { orderId: req.orderId, kind: req.kind },
      );
      return null;
    }

    const requestHash = computeRequestHash(req);
    const cached = this.cache.get(requestHash);
    if (cached?.type === "hash") return cached.hash;
    if (cached?.type === "not-approved") {
      throw new JudgementNotApprovedError(cached.decision, cached.reason);
    }

    const { judgement, completion } = await this.client.requestJudgement(req);
    if (judgement.decision !== "approve") {
      this.cache.set(requestHash, {
        type: "not-approved",
        decision: judgement.decision,
        reason: judgement.reason,
      });
      this.logger.warn("judgement did not approve; on-chain call will NOT be made", {
        orderId: req.orderId,
        kind: req.kind,
        decision: judgement.decision,
        reason: judgement.reason,
        malformed: judgement.malformed,
      });
      throw new JudgementNotApprovedError(judgement.decision, judgement.reason);
    }

    const report = await this.client.fetchAttestationReport();
    const hash = computeAttestationHash({
      model: this.client.model,
      requestHash,
      response: completion.content,
      attestationReport: report.raw,
    });
    const full = `near-ai:${hash}`;
    this.cache.set(requestHash, { type: "hash", hash: full });
    this.logger.info("judgement approved; attestation hash computed", {
      orderId: req.orderId,
      kind: req.kind,
      model: this.client.model,
      attestationHash: full,
    });
    return full;
  }
}

/**
 * Provider selection for the worker entrypoint.
 * BOUNDEN_ATTESTATION_PROVIDER: "null" (default, Stage 2 behaviour),
 * "local" (dev hash), "near-ai" (Stage 3 NEAR AI Cloud).
 * NEAR_AI_CLOUD_API_KEY / NEAR_AI_CLOUD_MODEL / NEAR_AI_CLOUD_BASE_URL
 * configure the near-ai provider; values come from env only and are
 * never logged.
 */
export function selectAttestationProvider(
  env: NodeJS.ProcessEnv,
  logger: Logger,
): AttestationProvider {
  const which = (env.BOUNDEN_ATTESTATION_PROVIDER ?? "null").trim().toLowerCase();
  if (which === "near-ai") {
    return new NearAiCloudAttestationProvider({
      ...(env.NEAR_AI_CLOUD_API_KEY ? { apiKey: env.NEAR_AI_CLOUD_API_KEY } : {}),
      ...(env.NEAR_AI_CLOUD_MODEL ? { model: env.NEAR_AI_CLOUD_MODEL } : {}),
      baseUrl: env.NEAR_AI_CLOUD_BASE_URL?.trim() || DEFAULT_AI_CLOUD_BASE_URL,
      logger,
    });
  }
  if (which === "local") return new LocalHashAttestationProvider();
  if (which !== "null" && which !== "") {
    logger.warn(
      `unknown BOUNDEN_ATTESTATION_PROVIDER "${which}" — falling back to the null provider`,
    );
  }
  return new NullAttestationProvider();
}
