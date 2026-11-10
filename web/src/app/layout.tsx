import type { Metadata, Viewport } from "next";
import { Archivo, IBM_Plex_Mono, Newsreader } from "next/font/google";
import Link from "next/link";
import SealMark from "@/components/SealMark";
import { MobileTabBar, SidebarNav } from "@/components/SiteNav";
import WalletEntry from "@/components/WalletEntry";
import WalletProvider from "@/components/WalletProvider";
import { contractId, fetchOrder, fetchProducts } from "@/lib/shop";
import { formatAge } from "@/lib/format";
import "./globals.css";

const display = Newsreader({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
});

const ui = Archivo({
  subsets: ["latin"],
  variable: "--font-ui",
  weight: ["400", "500", "600", "700"],
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500", "600"],
});

export const viewport: Viewport = {
  themeColor: "#faf5ea",
};

export const metadata: Metadata = {
  title: {
    default: "Bounden",
    template: "%s — Bounden",
  },
  description:
    "A digital-goods shop run by an autonomous agent whose authority is exactly two contract methods. Every power the agent holds is a public on-chain object.",
};

/* The shell carries live figures, so no route may be prerendered
   with yesterday's numbers baked into the sidebar. */
export const dynamic = "force-dynamic";

/** Count orders by probing sequential ids until the chain says stop.
 *  Same probe the home page runs; live (or last-known live) data only. */
async function countOrders(): Promise<number | null> {
  try {
    let n = 0;
    while (n < 64) {
      const r = await fetchOrder(n);
      if (r.mode === "fixture" || r.data === null) break;
      n++;
    }
    return n;
  } catch {
    return null;
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const contract = contractId();
  const { data: products, mode, cachedAt } = await fetchProducts();
  const sealedUnits = products.reduce<number | null>((acc, p) => {
    if (p.inventoryAvailable === null) return acc;
    return (acc ?? 0) + p.inventoryAvailable;
  }, null);
  const ordersRecorded = mode !== "fixture" ? await countOrders() : null;

  return (
    <html lang="en" className={`${display.variable} ${ui.variable} ${mono.variable}`}>
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>

        <WalletProvider contractId={contract}>

        <div className="notice-bar" role="note">
          <strong>Demo inventory.</strong>
          Every product here is a clearly marked test item with no real-world
          value. The shop runs on NEAR testnet and settles in testnet USDC.
        </div>

        <div className="shell">
          <aside className="sidebar">
            <Link href="/" className="brand" aria-label="Bounden — home">
              <SealMark />
              <span className="brand-name">Bounden</span>
            </Link>

            <SidebarNav />

            <div className="side-book">
              <dl className="side-entries">
                <div className="side-entry">
                  <dt>Contract of record</dt>
                  <dd>{contract ?? "Not configured"}</dd>
                </div>
                <div className="side-entry">
                  <dt>Network</dt>
                  <dd>NEAR testnet</dd>
                </div>
                <div className="side-entry">
                  <dt>Goods for sale</dt>
                  <dd>{products.length}</dd>
                </div>
                <div className="side-entry">
                  <dt>Sealed units in the vault</dt>
                  <dd>{sealedUnits ?? "—"}</dd>
                </div>
                {ordersRecorded !== null && (
                  <div className="side-entry">
                    <dt>Orders entered</dt>
                    <dd>{ordersRecorded}</dd>
                  </div>
                )}
              </dl>
              <WalletEntry />
              <p className="side-book-note">
                {mode === "live"
                  ? "Read live from the contract."
                  : mode === "cached"
                    ? `From the last live read, ${cachedAt ? formatAge(cachedAt) : "a moment ago"}.`
                    : "Sample figures — fixture mode, not chain state."}
              </p>
            </div>
          </aside>

          <div className="column">
            <header className="topbar">
              <Link href="/" className="brand" aria-label="Bounden — home">
                <SealMark small />
                <span className="brand-name">Bounden</span>
              </Link>
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
          </div>
        </div>

        <MobileTabBar />
        </WalletProvider>
      </body>
    </html>
  );
}
