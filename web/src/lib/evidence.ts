import { viewCall } from "./near";
import { contractId } from "./shop";
import { FIXTURE_EVIDENCE } from "./fixtures";

/**
 * Delivery-evidence lookup for the order page.
 *
 * The order view carries the judgement attestation hash, but the
 * delivery evidence hash lives in the contract's append-only
 * fulfilment log (`get_fulfilment_log`). This helper reads the log
 * and returns the fulfil record for one order. It deliberately lives
 * outside shop.ts: the shop data layer's contract is unchanged.
 *
 * Honesty rules, same as the data layer:
 *  - live mode: a failed read returns null ("not read"), never a
 *    fixture value dressed as chain state;
 *  - fixture mode: returns the labelled fixture record.
 */

export interface DeliveryEvidence {
  evidenceHash: string;
  attestationHash: string | null;
  /** Block timestamp, nanoseconds since epoch. */
  at: number;
}

interface FulfilmentRecord {
  order_id: number;
  action: string;
  evidence_hash: string;
  attestation_hash: string | null;
  at: number;
}

/** Last successfully read evidence per order (per server process).
 *  A failed read serves this before it serves "not read" — the same
 *  degradation order as the shop data layer. */
const lastKnown = new Map<number, DeliveryEvidence>();

export async function fetchDeliveryEvidence(
  orderId: number,
): Promise<DeliveryEvidence | null> {
  const contract = contractId();
  if (contract === null) return FIXTURE_EVIDENCE[orderId] ?? null;
  try {
    const log = await viewCall<FulfilmentRecord[]>(contract, "get_fulfilment_log", {
      from_index: 0,
      limit: 200,
    });
    const recs = log.filter((r) => r.order_id === orderId && r.action === "fulfil");
    const rec = recs[recs.length - 1];
    if (!rec) return null;
    const evidence: DeliveryEvidence = {
      evidenceHash: rec.evidence_hash,
      attestationHash: rec.attestation_hash,
      at: rec.at,
    };
    lastKnown.set(orderId, evidence);
    return evidence;
  } catch {
    return lastKnown.get(orderId) ?? null;
  }
}
