"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Shop", match: (p: string) => p === "/" || p.startsWith("/products") || p.startsWith("/checkout") },
  { href: "/constitution", label: "Constitution", match: (p: string) => p.startsWith("/constitution") },
  { href: "/#track", label: "Track Order", match: (p: string) => p.startsWith("/orders") },
  { href: "/about", label: "About", match: (p: string) => p.startsWith("/about") },
];

/** The four destinations as a ruled vertical list in the sidebar. */
export function SidebarNav() {
  const pathname = usePathname() ?? "/";
  return (
    <nav className="side-nav" aria-label="Primary">
      {TABS.map((t) => (
        <Link
          key={t.label}
          href={t.href}
          className="side-nav-item"
          aria-current={t.match(pathname) ? "page" : undefined}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

/** The same four destinations as a bottom tab bar on small screens. */
export function MobileTabBar() {
  const pathname = usePathname() ?? "/";
  return (
    <nav className="tabbar" aria-label="Primary, mobile">
      {TABS.map((t) => (
        <Link
          key={t.label}
          href={t.href}
          className="tabbar-item"
          aria-current={t.match(pathname) ? "page" : undefined}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
