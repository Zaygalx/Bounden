/**
 * Live status pill for the header: the shop contract's short address
 * and network, read from server configuration. In fixture mode (no
 * contract configured) it says so instead of inventing an address.
 */
export default function StatusPill() {
  const contract = process.env.BOUNDEN_CONTRACT_ACCOUNT_ID?.trim();
  if (!contract) {
    return (
      <span className="status-pill fixture">
        <span className="status-dot" aria-hidden="true" />
        Fixture mode
      </span>
    );
  }
  return (
    <span className="status-pill" title={`Shop contract: ${contract}`}>
      <span className="status-dot" aria-hidden="true" />
      <code>{contract}</code>
      <span className="status-net">NEAR testnet</span>
    </span>
  );
}
