import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bounden — the agent is bound. The money is not.",
  description:
    "A digital-goods shop run by an autonomous agent whose authority is exactly two contract methods. Every power the agent holds is a public on-chain object.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <Link href="/" className="brand">
            Bounden
          </Link>
          <span className="tagline">The agent is bound. The money is not.</span>
          <nav className="site-nav">
            <Link href="/">Catalogue</Link>
            <Link href="/constitution">Constitution</Link>
            <Link href="/about">How inventory stays secret</Link>
          </nav>
        </header>

        <div className="demo-notice" role="note">
          <strong>Demo inventory.</strong> Every product in this shop is a
          clearly marked test item with no real-world value. The shop runs on
          NEAR testnet and settles in testnet USDC.
        </div>

        <main className="container">{children}</main>

        <footer className="site-footer">
          <p>
            Bounden is an open template for agent-run digital-goods shops: a
            NEAR contract as the constitution, a cashier agent leashed to two
            contract methods, and judgements attested on-chain.
          </p>
        </footer>
      </body>
    </html>
  );
}
