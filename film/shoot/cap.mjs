// Bounden film — shared capture library.
// Playwright-core + the sandbox's headless Chromium, with the two RPC
// forwards the earlier storefront passes proved necessary, the egress
// proxy, and (optionally) a seeded wallet session + video recording.
//
// External pages (wallets, the explorer) need a local relay: the
// headless shell cannot tunnel through the egress proxy directly
// (ERR_TUNNEL_CONNECTION_FAILED), and the egress proxy's TLS
// interception is outside the shell's trust store. relay.mjs (a plain
// CONNECT forwarder on 127.0.0.1:8899) bridges both; it is started
// here if not already listening. The shop itself stays on localhost.
import { createRequire } from "node:module";
import fs from "node:fs";
import net from "node:net";
import { spawn } from "node:child_process";
const require = createRequire("/home/hatch/workspace/shot-tool/package.json");
const { chromium } = require("playwright-core");

export const EXE = process.env.HOME + "/.cache/ms-playwright/chromium_headless_shell-1254/chrome-headless-shell-linux64/chrome-headless-shell";
export const SHOP = "http://localhost:3100";
export const RELAY = "http://127.0.0.1:8899";

async function ensureRelay() {
  const up = await new Promise((resolve) => {
    const s = net.connect(8899, "127.0.0.1");
    s.once("connect", () => { s.end(); resolve(true); });
    s.once("error", () => resolve(false));
    setTimeout(() => { s.destroy(); resolve(false); }, 1500);
  });
  if (up) return;
  const child = spawn("node", ["/home/hatch/workspace/bounden/film/shoot/relay.mjs"], { detached: true, stdio: "ignore" });
  child.unref();
  await new Promise((r) => setTimeout(r, 1200));
}

export async function launch({ seed = null, recordDir = null, userDataDir = null } = {}) {
  await ensureRelay();
  const proxyCfg = { server: RELAY, bypass: "localhost,127.0.0.1" };
  const launchOpts = {
    executablePath: EXE,
    args: ["--no-sandbox", "--ignore-certificate-errors"],
    proxy: proxyCfg,
  };
  const ctxOpts = {
    viewport: { width: 1920, height: 1080 },
    ...(recordDir ? { recordVideo: { dir: recordDir, size: { width: 1920, height: 1080 } } } : {}),
  };
  let browser = null, context;
  if (userDataDir) {
    context = await chromium.launchPersistentContext(userDataDir, { ...launchOpts, ...ctxOpts });
  } else {
    browser = await chromium.launch(launchOpts);
    context = await browser.newContext(ctxOpts);
  }

  // Forward the page's near.org RPC calls to fastnear (proven route).
  const forward = (from, to) => context.route(from, async (route) => {
    try {
      const req = route.request();
      const r = await fetch(to, {
        method: req.method(),
        headers: { "content-type": "application/json" },
        body: req.postData() || undefined,
      });
      await route.fulfill({
        status: r.status,
        headers: { "access-control-allow-origin": "*", "content-type": "application/json" },
        body: await r.text(),
      });
    } catch { await route.abort(); }
  });
  await forward("https://rpc.testnet.near.org/**", "https://rpc.testnet.fastnear.com");
  await forward("https://test.rpc.fastnear.com/**", "https://test.rpc.fastnear.com");

  if (seed) {
    const s = JSON.parse(fs.readFileSync(seed, "utf8"));
    await context.addInitScript((seedObj) => {
      try {
        localStorage.setItem("near-wallet-selector:selectedWalletId", JSON.stringify("meteor-wallet"));
        localStorage.setItem("near-wallet-selector:recentlySignedInWallets", JSON.stringify(["meteor-wallet"]));
        localStorage.setItem("default_meteor_wallet_auth_key", JSON.stringify({ accountId: seedObj.account_id, allKeys: [seedObj.public_key] }));
        localStorage.setItem("_meteor_wallet" + seedObj.account_id + ":testnet", seedObj.private_key);
        localStorage.setItem("_meteor_wallet:" + seedObj.account_id + ":testnet", seedObj.private_key);
      } catch { /* storage unavailable */ }
    }, s);
  }

  const page = context.pages()[0] ?? (await context.newPage());
  return { browser, context, page };
}

export async function closeAll({ browser, context }) {
  try { await context.close(); } catch { /* already closed */ }
  try { await browser?.close(); } catch { /* already closed */ }
}
