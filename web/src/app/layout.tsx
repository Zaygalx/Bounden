import type { Metadata } from "next";
import { Fraunces, IBM_Plex_Mono, Inter } from "next/font/google";
import Link from "next/link";
import StatusPill from "@/components/StatusPill";
import { MobileTabBar, PrimaryNav } from "@/components/SiteNav";
import "./globals.css";

const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
});

const ui = Inter({
  subsets: ["latin"],
  variable: "--font-ui",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: {
    default: "Bounden — the agent is bound. The money is not.",
    template: "%s — Bounden",
  },
  description:
    "A digital-goods shop run by an autonomous agent whose authority is exactly two contract methods. Every power the agent holds is a public on-chain object.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const contract = process.env.BOUNDEN_CONTRACT_ACCOUNT_ID?.trim();
  return (
    <html lang="en" className={`${display.variable} ${ui.variable} ${mono.variable}`}>
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>

        <div className="notice-bar" role="note">
          <strong>Demo inventory</strong>
          Every product here is a clearly marked test item with no real-world
          value. The shop runs on NEAR testnet and settles in testnet USDC.
        </div>

        <header className="site-header">
          <div className="header-inner">
            <Link href="/" className="wordmark" aria-label="Bounden — home">
              <span className="wordmark-mark" aria-hidden="true" />
              <span className="wordmark-name">Bounden</span>
              <span className="wordmark-tag">The agent is bound. The money is not.</span>
            </Link>
            <StatusPill />
            <PrimaryNav />
          </div>
        </header>

        <main className="container" id="main">
          {children}
        </main>

        <footer className="site-footer">
          <div className="footer-inner">
            <div>
              <h3>Bounden</h3>
              <p>
                An open template for agent-run digital-goods shops: a NEAR
                contract as the constitution, a cashier agent leashed to two
                contract methods, and judgements attested on-chain. The
                cashier cannot steal — its powers are public, and they end
                where its job ends.
              </p>
            </div>
            <nav aria-label="Footer">
              <h3>Explore</h3>
              <ul className="footer-links">
                <li>
                  <Link href="/">Shop</Link>
                </li>
                <li>
                  <Link href="/constitution">Constitution</Link>
                </li>
                <li>
                  <Link href="/#track">Track an order</Link>
                </li>
                <li>
                  <Link href="/about">How inventory stays secret</Link>
                </li>
                <li>
                  <a
                    href="https://github.com/Zaygalx/Bounden"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Source on GitHub
                  </a>
                </li>
              </ul>
            </nav>
            <div>
              <h3>Ledger facts</h3>
              <div className="footer-fact">
                <span className="k">Contract</span>
                <span className="v">{contract ?? "not configured"}</span>
              </div>
              <div className="footer-fact">
                <span className="k">Network</span>
                <span className="v">NEAR testnet</span>
              </div>
              <div className="footer-fact">
                <span className="k">Settles in</span>
                <span className="v">USDC (Circle, NEAR testnet)</span>
              </div>
              <div className="footer-fact">
                <span className="k">Inventory</span>
                <span className="v">Demo — test items only</span>
              </div>
            </div>
          </div>
          <div className="footer-base">
            <div className="footer-base-inner">
              <span>Bounden — an open-source constitution for agent commerce.</span>
              <span>Verify everything on-chain; trust nothing on this page alone.</span>
            </div>
          </div>
        </footer>

        <MobileTabBar />
      </body>
    </html>
  );
}
