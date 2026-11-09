import type { ChainClient } from "./chain.js";
import type { AttestationProvider } from "./attestation.js";
import type { VaultStore } from "./vault.js";
import type { Logger } from "./logger.js";
import type { ChainOrder, Constitution } from "./types.js";

/**
 * The cashier's work loop. One cycle:
 *
 *  1. Reconcile vault reservations left by a crash: a reserved delivery
 *     whose order is Fulfilled on-chain is finalized; one whose order is
 *     still Paid is released (the fulfilment will be retried below).
 *  2. Discover orders by probing sequential ids (the contract exposes
 *     get_order but no list view — ids are sequential from 0, so
 *     probing until the first null is exact, not a heuristic).
 *  3. Fulfil every Paid order: prepare the sealed delivery in the
 *     vault, ask the attestation provider for the judgement hash, call
 *     fulfil_order, finalize the delivery. Any failure releases the
 *     reservation and is logged; the order stays Paid for next cycle.
 *  4. Process pending refund requests from the vault: read the order
 *     and the constitution, PRE-CHECK the band locally (state, cap,
 *     window) and refuse locally with a logged reason when outside it —
 *     no gas burned on a call the contract would park as
 *     RefundRejected. In-band requests call issue_refund with NO
 *     deposit attached: this process signs with a function-call key,
 *     which protocol rules bar from attaching any deposit at all
 *     (DepositWithFunctionCall — proven live on the v2 deployment).
 *     The 1 yocto the token requires on the outbound ft_transfer is
 *     attached by the contract itself, out of its own balance (v3
 *     contract).
 *
 * The worker reads only the typed fields of an order. Free-text fields
 * (notes, memos) are never read and never influence behaviour — order
 * content is data, not instructions. There is no code path in this
 * package that can move the treasury or pay anyone but the buyer of
 * record: the only signed calls are the two allowlisted methods, and
 * issue_refund's destination is chosen by the contract, not by us.
 *
 * Every judgement request carries a buyer history summary computed
 * from the worker's own scan of the chain (summarizeBuyerHistory):
 * counts of the buyer's OTHER orders by state. It is the only buyer
 * context ever sent to the judgement layer — the buyer account id
 * itself is never sent (see ai-cloud.ts). The summary is derived,
 * never written by hand: a first-time buyer truthfully reads
 * "No prior orders."
 */

export interface CycleReport {
  scannedOrders: number;
  fulfilledOrderIds: number[];
  skippedOrderIds: number[];
  refundsIssuedOrderIds: number[];
  refundsRefused: Array<{ orderId: number; reason: string }>;
  errors: Array<{ orderId: number; stage: string; message: string }>;
}

export interface WorkerDeps {
  chain: ChainClient;
  vault: VaultStore;
  attestation: AttestationProvider;
  logger: Logger;
  scanLimit: number;
  /** Injectable clock (ns since epoch) for deterministic tests. */
  nowNs?: () => bigint;
}

/** State labels for the buyer history summary, in report order. */
const HISTORY_STATE_LABELS: Array<[ChainOrder["state"], string]> = [
  ["Created", "created"],
  ["Paid", "paid"],
  ["Fulfilled", "fulfilled"],
  ["Cancelled", "cancelled"],
  ["Refunded", "refunded"],
  ["RefundRejected", "refund-rejected"],
];

/**
 * Factual buyer history for a judgement request, derived ONLY from
 * orders the worker itself read off the chain during its scan:
 * the buyer's other orders (the order under judgement is excluded),
 * counted by their current state. Examples:
 *   "No prior orders."
 *   "1 prior order: 1 fulfilled."
 *   "3 prior orders: 2 fulfilled, 1 refunded."
 * Nothing here is estimated, rounded, or softened — if the buyer's
 * history is refund-heavy, the summary says so.
 */
export function summarizeBuyerHistory(
  orders: ChainOrder[],
  buyer: string,
  excludeOrderId: number,
): string {
  const priors = orders.filter((o) => o.buyer === buyer && o.id !== excludeOrderId);
  if (priors.length === 0) return "No prior orders.";
  const parts: string[] = [];
  for (const [state, label] of HISTORY_STATE_LABELS) {
    const n = priors.filter((o) => o.state === state).length;
    if (n > 0) parts.push(`${n} ${label}`);
  }
  const noun = priors.length === 1 ? "order" : "orders";
  return `${priors.length} prior ${noun}: ${parts.join(", ")}.`;
}

export class BoundenWorker {
  private readonly nowNs: () => bigint;

  constructor(private readonly deps: WorkerDeps) {
    this.nowNs = deps.nowNs ?? (() => BigInt(Date.now()) * 1_000_000n);
  }

  async pollOnce(): Promise<CycleReport> {
    const { chain, vault, logger } = this.deps;
    const report: CycleReport = {
      scannedOrders: 0,
      fulfilledOrderIds: [],
      skippedOrderIds: [],
      refundsIssuedOrderIds: [],
      refundsRefused: [],
      errors: [],
    };

    const constitution = await chain.getConstitution();

    // 1. Reconcile reservations from an interrupted previous cycle.
    for (const delivery of await vault.reservedDeliveries()) {
      const order = await chain.getOrder(delivery.orderId);
      if (order?.state === "Fulfilled") {
        await vault.finalizeDelivery(delivery.orderId);
        logger.info("reconciled reserved delivery: order was fulfilled on-chain", {
          orderId: delivery.orderId,
        });
      } else {
        await vault.releaseDelivery(delivery.orderId);
        logger.warn("released stale delivery reservation; will retry", {
          orderId: delivery.orderId,
        });
      }
    }

    // 2 + 3. Discover and fulfil Paid orders. Every scanned order is
    // kept: the set is the worker's own evidence base for the buyer
    // history summaries attached to judgement requests below.
    const scanned: ChainOrder[] = [];
    const paidOrders: ChainOrder[] = [];
    for (let id = 0; id < this.deps.scanLimit; id++) {
      const order = await chain.getOrder(id);
      if (order === null) break;
      report.scannedOrders++;
      scanned.push(order);
      if (order.state === "Paid") paidOrders.push(order);
      else report.skippedOrderIds.push(order.id);
    }
    for (const order of paidOrders) {
      await this.fulfil(order, report, scanned);
    }

    // 4. Refund requests.
    for (const req of await vault.pendingRefundRequests()) {
      await this.processRefund(req.requestId, req.orderId, constitution, report, scanned);
    }

    return report;
  }

  private async fulfil(
    order: ChainOrder,
    report: CycleReport,
    scanned: ChainOrder[],
  ): Promise<void> {
    const { chain, vault, attestation, logger } = this.deps;
    let prepared = false;
    try {
      const delivery = await vault.prepareDelivery(order.id, order.buyer, order.product_id);
      prepared = true;
      const attestationHash = await attestation.getAttestationHash({
        kind: "fulfil",
        orderId: order.id,
        buyer: order.buyer,
        productId: order.product_id,
        amountUsd: order.amount_usd,
        buyerHistorySummary: summarizeBuyerHistory(scanned, order.buyer, order.id),
      });
      const args: Record<string, unknown> = {
        order_id: order.id,
        delivery_evidence_hash: delivery.evidenceHash,
      };
      if (attestationHash !== null) args["attestation_hash"] = attestationHash;
      const { txHash } = await chain.callAgentMethod("fulfil_order", args);
      await vault.finalizeDelivery(order.id);
      report.fulfilledOrderIds.push(order.id);
      logger.info("order fulfilled", {
        orderId: order.id,
        productId: order.product_id,
        commitment: delivery.commitment,
        evidenceHash: delivery.evidenceHash,
        ...(txHash ? { txHash } : {}),
      });
    } catch (err) {
      if (prepared) await vault.releaseDelivery(order.id).catch(() => undefined);
      const message = err instanceof Error ? err.message : String(err);
      report.errors.push({ orderId: order.id, stage: "fulfil", message });
      logger.error("fulfilment failed; order left Paid for next cycle", {
        orderId: order.id,
        message,
      });
    }
  }

  private async processRefund(
    requestId: string,
    orderId: number,
    constitution: Constitution,
    report: CycleReport,
    scanned: ChainOrder[],
  ): Promise<void> {
    const { chain, vault, attestation, logger } = this.deps;
    const refuse = async (reason: string): Promise<void> => {
      await vault.resolveRefundRequest(requestId, { status: "refused", reason });
      report.refundsRefused.push({ orderId, reason });
      logger.warn("refund refused locally (no on-chain call made)", { orderId, reason });
    };

    const order = await chain.getOrder(orderId);
    if (!order) return refuse("order not found on-chain");
    if (order.state !== "Paid" && order.state !== "Fulfilled") {
      return refuse(`order state ${order.state} is not refundable (must be Paid or Fulfilled)`);
    }
    if (order.paid_at === null) return refuse("order has no paid_at timestamp");
    if (BigInt(order.amount_usd) > BigInt(constitution.refund_cap_usd)) {
      return refuse(
        `amount ${order.amount_usd} exceeds refund cap ${constitution.refund_cap_usd} (base units)`,
      );
    }
    const elapsed = this.nowNs() - BigInt(Math.trunc(order.paid_at));
    if (elapsed > BigInt(constitution.refund_window_ns)) {
      return refuse(`refund window elapsed: ${elapsed} ns since payment > window ${constitution.refund_window_ns} ns`);
    }

    try {
      const attestationHash = await attestation.getAttestationHash({
        kind: "refund",
        orderId: order.id,
        buyer: order.buyer,
        productId: order.product_id,
        amountUsd: order.amount_usd,
        buyerHistorySummary: summarizeBuyerHistory(scanned, order.buyer, order.id),
      });
      const args: Record<string, unknown> = { order_id: order.id };
      if (attestationHash !== null) args["attestation_hash"] = attestationHash;
      const { txHash } = await chain.callAgentMethod("issue_refund", args, { depositYocto: "0" });
      await vault.resolveRefundRequest(requestId, {
        status: "issued",
        ...(txHash ? { txHash } : {}),
      });
      report.refundsIssuedOrderIds.push(order.id);
      logger.info("refund issued", { orderId: order.id, ...(txHash ? { txHash } : {}) });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      report.errors.push({ orderId, stage: "refund", message });
      logger.error("refund call failed; request left pending", { orderId, message });
    }
  }
}
