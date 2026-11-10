"use client";

import { useWallet } from "./WalletProvider";

/**
 * The wallet's line in the sidebar's book of record — set in the same
 * ledger idiom as the entries above it (Contract of record, Network,
 * the live figures). Disconnected, it is a plain invitation to
 * connect; connected, the account id stands as a data line and a
 * disconnect sits under it. Nothing here resembles a settings page:
 * the wallet is the visitor's own, this is only its name in the book.
 */
export default function WalletEntry() {
  const { contractId, accountId, connect, disconnect } = useWallet();
  if (!contractId) return null;

  return (
    <div className="side-entry wallet-entry">
      <span className="wallet-label">Wallet</span>
      {accountId ? (
        <>
          <span className="wallet-account">{accountId}</span>
          <button
            type="button"
            className="wallet-action"
            onClick={() => void disconnect()}
          >
            Disconnect
          </button>
        </>
      ) : (
        <button type="button" className="wallet-action" onClick={connect}>
          Connect wallet
        </button>
      )}
    </div>
  );
}
