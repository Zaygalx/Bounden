/**
 * The wallet purchase payload — the exact calls a buyer's wallet signs
 * to buy from the shop, built as ONE batch of two transactions:
 *
 *   1. `create_order` on the shop contract (args: the product id).
 *      Creates the order with the price copied at creation.
 *   2. `ft_transfer_call` on the settlement token (args: the shop as
 *      receiver, the order amount, and the order id as `msg`). This is
 *      the payment the contract accepts — exact amount, buyer of
 *      record only; anything else is refunded by the token in full.
 *
 * Every figure here is a figure the live flow has already proven on
 * bounden11.testnet, not a guess:
 *   - create_order was signed for order 3 with gas 5 Tgas and NO
 *     deposit (tx Dtz5mz4Dyo357tmd9mjTUEpkQZnZXYBK5rMhpLW3Kvvu:
 *     args {"product_id": "api-credit-basic"}, gas 5000000000000,
 *     deposit "0").
 *   - The payments for orders 2 and 3 landed at 100 Tgas with exactly
 *     1 yoctoNEAR attached; the 10 and 30 Tgas attempts failed in
 *     execution with "More gas is required" (NOTES.md, Stage 3 v3
 *     closing pass). The msg is the order id as a decimal string —
 *     nothing else is parsed from it.
 *
 * The batch carries the id the order WILL have: order ids are
 * sequential and the storefront probes the next free id immediately
 * before signing (see BuyPanel). If another buyer somehow took that
 * id in between, the payment names an order that is not the signer's,
 * the contract rejects it, and the token refunds the signer in full —
 * the failure mode is a refund, never a loss.
 *
 * This module is pure and dependency-free on purpose: the same builder
 * the page uses is what the live verification harness compiles and
 * signs with, so what is verified is what ships. The actions are
 * built in the wallet selector's plain internal shape; BuyPanel
 * converts them to near-api-js Action objects with the selector's
 * own internalActionToNaj at the signing call, because that is the
 * form signAndSendTransactions (and every wallet module behind it)
 * accepts — the conversion changes the wrapper, never the payload.
 */

/** Circle's NEAR testnet USDC — the only token the shop accepts. */
export const TOKEN_CONTRACT_ID =
  "3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af";

/**
 * Classify a signing failure by the token contract's known panics.
 * When the payment call dies inside the token — the paying account
 * is not registered with it, or its balance cannot cover the amount
 * — the raw chain error is a JSON blob no buyer should have to read
 * (the owner's own first purchase surfaced exactly that). BuyPanel
 * uses this to answer in plain language instead. Returns null for
 * anything else, so unknown failures keep their original wording.
 */
export function classifyTokenPanic(
  message: string,
): "unregistered" | "insufficient" | null {
  if (/not registered/i.test(message)) return "unregistered";
  if (
    /insufficient|doesn'?t have enough|not enough|less than the amount|underflow/i.test(
      message,
    )
  ) {
    return "insufficient";
  }
  return null;
}

/** Gas for create_order, as proven by the order-3 creation tx. */
export const CREATE_ORDER_GAS = "5000000000000"; // 5 Tgas

/** Gas for the payment; 100 Tgas is what orders 2 and 3 landed with. */
export const PAYMENT_GAS = "100000000000000"; // 100 Tgas

export interface PurchaseAction {
  type: "FunctionCall";
  params: {
    methodName: string;
    args: Record<string, unknown>;
    gas: string;
    deposit: string;
  };
}

export interface PurchaseTransaction {
  receiverId: string;
  actions: PurchaseAction[];
}

export interface PurchaseInput {
  /** The shop contract account (e.g. bounden11.testnet). */
  shopContractId: string;
  productId: string;
  /** Price in token base units (6-dp string), exactly as on-chain. */
  priceUsd: string;
  /** The sequential id the new order will receive. */
  orderId: number;
}

export function buildPurchaseTransactions(input: PurchaseInput): PurchaseTransaction[] {
  return [
    {
      receiverId: input.shopContractId,
      actions: [
        {
          type: "FunctionCall",
          params: {
            methodName: "create_order",
            args: { product_id: input.productId },
            gas: CREATE_ORDER_GAS,
            deposit: "0",
          },
        },
      ],
    },
    {
      receiverId: TOKEN_CONTRACT_ID,
      actions: [
        {
          type: "FunctionCall",
          params: {
            methodName: "ft_transfer_call",
            args: {
              receiver_id: input.shopContractId,
              amount: input.priceUsd,
              msg: String(input.orderId),
            },
            gas: PAYMENT_GAS,
            deposit: "1",
          },
        },
      ],
    },
  ];
}
