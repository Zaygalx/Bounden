"use client";

import { useWallet } from "./WalletProvider";

/**
 * The wallet control — one home only: the top-right of the shell.
 * On desktop it sits at the top-right of the content column, aligned
 * to the content's top edge; on small screens it rides at the right
 * end of the top bar. Styled as an action of the book (a ledger-green
 * button in the site's own idiom), never as library stock and never
 * as a floating chip. Connected, the same spot carries the account
 * id as a data line — truncated, with the full id on hover — and a
 * plain disconnect beside it.
 */
export default function WalletControl() {
  const { contractId, accountId, connect, disconnect } = useWallet();
  if (!contractId) return null;

  if (accountId) {
    return (
      <div className="wallet-control">
        <span className="wallet-control-account" title={accountId}>
          {accountId}
        </span>
        <button
          type="button"
          className="wallet-control-disconnect"
          onClick={() => void disconnect()}
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div className="wallet-control">
      <button type="button" className="wallet-control-connect" onClick={connect}>
        Connect wallet
      </button>
    </div>
  );
}
