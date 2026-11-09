/**
 * Attestation provider — the seam where Stage 3 plugs in NEAR AI Cloud.
 *
 * For every consequential decision (fulfil / refund), the worker asks a
 * provider for the attestation hash of the judgement behind it. The
 * contract stores that hash on the order and in the fulfilment log, so a
 * decision can be verified after the fact against the TEE attestation
 * report (see docs/PREFLIGHT.md §4).
 *
 * Stage 2 ships ONLY the providers below. Neither of them is, or claims
 * to be, a TEE attestation:
 *
 *  - NullAttestationProvider: returns null. The contract stores no
 *    attestation hash. This is the honest Stage 2 default: orders are
 *    fulfilled under the key leash + contract bands alone, and the
 *    absence of a judgement layer is visible on-chain as a missing hash,
 *    not papered over.
 *  - LocalHashAttestationProvider: returns `local-sha256:<hex>` — a hash
 *    of the decision payload computed locally. It exists so Stage 3 can
 *    integration-test the plumbing end-to-end. The `local-` prefix makes
 *    it impossible to mistake for a NEAR AI Cloud attestation on-chain.
 */

import { createHash } from "node:crypto";

export interface AttestationRequest {
  kind: "fulfil" | "refund";
  orderId: number;
  buyer: string;
  productId: string;
  amountUsd: string;
}

export interface AttestationProvider {
  /** Human-readable provider id, logged at startup. */
  readonly name: string;
  /** Attestation hash to store on-chain, or null for "no judgement". */
  getAttestationHash(req: AttestationRequest): Promise<string | null>;
}

export class NullAttestationProvider implements AttestationProvider {
  readonly name = "null (no judgement layer — Stage 3 wires NEAR AI Cloud)";
  async getAttestationHash(): Promise<string | null> {
    return null;
  }
}

export class LocalHashAttestationProvider implements AttestationProvider {
  readonly name = "local-sha256 (DEV ONLY — not a TEE attestation)";
  async getAttestationHash(req: AttestationRequest): Promise<string | null> {
    const payload = JSON.stringify({
      kind: req.kind,
      orderId: req.orderId,
      buyer: req.buyer,
      productId: req.productId,
      amountUsd: req.amountUsd,
    });
    return `local-sha256:${createHash("sha256").update(payload).digest("hex")}`;
  }
}
