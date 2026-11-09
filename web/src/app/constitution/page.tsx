import ModeBanner from "@/components/ModeBanner";
import { contractId, fetchConstitution } from "@/lib/shop";
import { formatBandBps, formatNear, formatUsd, humaniseNs } from "@/lib/format";

export const dynamic = "force-dynamic";

const METHOD_EXPLAINED: Record<string, string> = {
  fulfil_order:
    "Mark a Paid order fulfilled and record its delivery evidence hash. This is how a buyer gets their sealed item — and the only way.",
  issue_refund:
    "Refund the buyer of record for one order, only inside the refund band below. The contract picks the destination; there is no address to redirect.",
};

/**
 * THE CONSTITUTION PAGE — the demo's Act 3.
 * Everything on this page is read from the contract and from the agent
 * key's on-chain permission object. This is the complete list of the
 * cashier's powers, published where any customer or judge can check
 * it against the chain.
 */
export default async function ConstitutionPage() {
  const { data, mode, liveError, note } = await fetchConstitution();
  const { constitution: c, agentKey } = data;
  const contract = contractId() ?? "bounden.testnet";
  const fc =
    agentKey && agentKey.permission !== "FullAccess"
      ? agentKey.permission.FunctionCall
      : null;

  return (
    <>
      <ModeBanner mode={mode} liveError={liveError} note={note} />
      <h1>The Constitution</h1>
      <p className="lede">
        This shop is run by an autonomous agent — the cashier. Below is every
        power the cashier holds, read from the shop contract (
        <code>{contract}</code>) and from the cashier key's own on-chain
        permission object. If a power is not listed here, the cashier does not
        have it. That is not a promise; it is how NEAR access keys work, and
        anyone can verify it on-chain.
      </p>

      <h2>The rules of the shop</h2>
      <table className="kv">
        <tbody>
          <tr>
            <th>Owner</th>
            <td>
              <code>{c.owner_id}</code> — the only account that can change
              these rules or touch the treasury.
            </td>
          </tr>
          <tr>
            <th>Settlement token</th>
            <td>
              <code>{c.payment_token}</code> — orders are priced in USD and
              settled in this stablecoin.
            </td>
          </tr>
          <tr>
            <th>Price band</th>
            <td>
              Prices may move at most {formatBandBps(c.price_band_bps)} per
              owner update — even the owner cannot silently reprice the shop
              in one step.
            </td>
          </tr>
          <tr>
            <th>Refund cap</th>
            <td>
              The cashier may refund at most {formatUsd(c.refund_cap_usd)} per
              order, automatically.
            </td>
          </tr>
          <tr>
            <th>Refund window</th>
            <td>
              …and only within {humaniseNs(c.refund_window_ns)} of payment.
              Outside the band, no money moves and the order is parked for the
              owner's review.
            </td>
          </tr>
          <tr>
            <th>Registered cashier</th>
            <td>
              {c.agent_account_id ? (
                <code>{c.agent_account_id}</code>
              ) : (
                "None registered"
              )}
            </td>
          </tr>
          <tr>
            <th>Cashier code hash (pinned)</th>
            <td>
              {c.agent_code_hash ? (
                <span className="hash">{c.agent_code_hash}</span>
              ) : (
                "—"
              )}
              <br />
              The contract trusts exactly this build of the cashier. A
              different binary is a different, unregistered agent.
            </td>
          </tr>
        </tbody>
      </table>

      <h2>The cashier's powers — the complete list</h2>
      {agentKey === null ? (
        <p>
          The cashier key's permission object could not be shown (see the
          banner above). When configured, this section renders the key's
          on-chain permission object: its receiver, its method allowlist, and
          its remaining allowance.
        </p>
      ) : fc === null ? (
        <p>
          <strong>Warning:</strong> the key shown for{" "}
          <code>{agentKey.accountId}</code> is a FULL-ACCESS key, not a leashed
          function-call key. A Bounden cashier must never run with this key —
          if you see this on a live shop, do not buy from it.
        </p>
      ) : (
        <>
          <table className="kv">
            <tbody>
              <tr>
                <th>Key holder</th>
                <td>
                  <code>{agentKey.accountId}</code>
                </td>
              </tr>
              <tr>
                <th>Public key</th>
                <td>
                  <span className="hash">{agentKey.publicKey}</span>
                </td>
              </tr>
              <tr>
                <th>Key may call</th>
                <td>
                  Only the contract <code>{fc.receiver_id}</code> — no other
                  account, ever.
                </td>
              </tr>
              <tr>
                <th>Key allowance</th>
                <td>
                  {formatNear(fc.allowance)} total for gas. When it runs out,
                  the key stops working until the owner tops it up. The
                  allowance can never be spent as money — it pays network fees
                  only.
                </td>
              </tr>
            </tbody>
          </table>
          <p>Within that contract, the key may call exactly these methods:</p>
          <table className="kv">
            <tbody>
              {fc.method_names.map((m) => (
                <tr key={m}>
                  <th>
                    <code>{m}</code>
                  </th>
                  <td>
                    {METHOD_EXPLAINED[m] ??
                      "A method on the shop contract, exercised under the contract's own checks."}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            NEAR rejects any other use of this key during transaction
            validation — before any contract code runs. The leash is enforced
            by the protocol, not by the cashier's good behaviour.
          </p>
        </>
      )}

      <h2>Powers the cashier does NOT hold</h2>
      <ul className="tight">
        <li>
          <strong>Withdraw the treasury.</strong> Owner-only, and the contract
          hard-codes the destination to the owner — there is no address
          parameter to redirect, for anyone.
        </li>
        <li>
          <strong>Change prices or the catalogue.</strong> Owner-only, and
          band-limited even for the owner.
        </li>
        <li>
          <strong>Register or replace the agent.</strong> Owner-only.
        </li>
        <li>
          <strong>Pay anyone but a buyer of record.</strong> Refund
          destinations are chosen by the contract, not by the cashier.
        </li>
        <li>
          <strong>Read the inventory.</strong> The chain holds only hashes of
          codes; the sealed vault lives off-chain with the cashier, and a
          delivered code is encrypted to its buyer.
        </li>
        <li>
          <strong>Act outside the two allowlisted methods.</strong> The key
          itself refuses — see above.
        </li>
      </ul>

      <p>
        The attack suite in the Bounden repository tries each of these powers
        anyway — treasury drain, payout redirect, out-of-band refund,
        inventory dump, price-band violation — and prints the on-chain
        rejection each attempt hits. The constitution is not a claim. It is a
        list you can test.
      </p>
    </>
  );
}
