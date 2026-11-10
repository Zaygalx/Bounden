// Explorer glances + clean order pages.
// NearBlocks (testnet.nearblocks.io) does not load through this
// capture network at all (CDN blocks the egress; navigation times
// out on an empty body, verified twice). The glances are filmed on
// NEAR Rocks (testnet.near.rocks) — a public explorer NEAR's own
// explorer selector recommends — showing the same transactions;
// every hash stays copyable. Deviation logged in FILM.md/NOTES.md.
import fs from "node:fs";
import { launch, closeAll, SHOP } from "./cap.mjs";
const OUTDIR = "/home/hatch/workspace/bounden/film/render/explorer";
const OUT = "/home/hatch/workspace/bounden/film/shoot/out";
fs.mkdirSync(OUTDIR, { recursive: true });
const PAY_TX = "4ETi2vpAg7tH3RCk1txYQjX6WAu5hp2i3ETS9NmYHCmJ";
const WALL2_TX = "65BVKJAJZDv6y8nEgfsGuJZf2GzA97rpYAPcdi7c6dYA";
const marks = [];
const t0 = Date.now();
const mark = (what) => {
  const s = +(((Date.now() - t0) / 1000).toFixed(1));
  marks.push({ t: s, what });
  console.log(`${s}s ${what}`);
};
const scrollToText = async (page, needle) => page.evaluate((n) => {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    if (node.textContent.includes(n)) {
      node.parentElement.scrollIntoView({ block: "center" });
      return true;
    }
  }
  return false;
}, needle).catch(() => false);

const rec = await launch({ seed: "/tmp/bfilm/seed-buyer.json", recordDir: OUTDIR });
const { page } = rec;

// 1 — wall 1: the poisoned memo in the pay transaction's args
await page.goto(`https://testnet.near.rocks/tx/${PAY_TX}`, { waitUntil: "domcontentloaded", timeout: 90000 }).catch(() => {});
const memoOk = await page.waitForFunction(() => document.body.innerText.includes("SYSTEM OVERRIDE"), null, { timeout: 90000 }).then(() => true).catch(() => false);
mark(`explorer wall1: memo rendered = ${memoOk}`);
if (memoOk) await scrollToText(page, "SYSTEM OVERRIDE");
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/wall1-memo2.png` });
await page.waitForTimeout(6000);
mark("wall1 memo glance held");

// 2 — wall 2: the bounden_refund_rejected event on the refund tx
await page.goto(`https://testnet.near.rocks/tx/${WALL2_TX}`, { waitUntil: "domcontentloaded", timeout: 90000 }).catch(() => {});
const evOk = await page.waitForFunction(() => document.body.innerText.includes("bounden_refund_rejected"), null, { timeout: 90000 }).then(() => true).catch(() => false);
mark(`explorer wall2: event rendered = ${evOk}`);
if (evOk) await scrollToText(page, "bounden_refund_rejected");
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/wall2-event.png` });
await page.waitForTimeout(6000);
mark("wall2 event glance held");

// 3 — order 9 page, live read (retry past the fixture fallback)
let live9 = false;
for (let i = 0; i < 4 && !live9; i++) {
  await page.goto(`${SHOP}/orders/9`, { waitUntil: "domcontentloaded", timeout: 90000 });
  live9 = await page.waitForFunction(
    () => document.body.innerText.includes("FULFILLED") && !document.body.innerText.includes("fixture data"),
    null, { timeout: 45000 }).then(() => true).catch(() => false);
  mark(`order 9 page attempt ${i + 1}: live = ${live9}`);
}
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/wall1-fulfilled2.png` });
await page.waitForTimeout(5000);

// 4 — order 2 page: RefundRejected
let live2 = false;
for (let i = 0; i < 4 && !live2; i++) {
  await page.goto(`${SHOP}/orders/2`, { waitUntil: "domcontentloaded", timeout: 90000 });
  live2 = await page.waitForFunction(
    () => /REFUND/i.test(document.body.innerText) && !document.body.innerText.includes("fixture data"),
    null, { timeout: 45000 }).then(() => true).catch(() => false);
  mark(`order 2 page attempt ${i + 1}: live = ${live2}`);
}
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/wall2-order2.png` });
await page.waitForTimeout(6000);
mark("EXPLORER + ORDER PAGES COMPLETE");
fs.writeFileSync(`${OUT}/explorer-marks.json`, JSON.stringify(marks, null, 1));
await closeAll(rec);
