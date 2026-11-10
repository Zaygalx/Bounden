// ACT 1 PICKUP — the collection beat, filmed after take 2.
// Browser bookends on order 8's page (the counter, then the evidence
// block); the collection itself is filmed as a terminal segment
// (pickup-term) replaying collect.mjs's real output verbatim — the
// route the shoot log and as-shot note disclose.
import fs from "node:fs";
import { launch, closeAll, SHOP } from "./cap.mjs";

const OUTDIR = "/home/hatch/workspace/bounden/film/render/act1-pickup";
const OUT = "/home/hatch/workspace/bounden/film/shoot/out";
fs.mkdirSync(OUTDIR, { recursive: true });
const marks = [];
const t0 = Date.now();
const mark = (what) => {
  const s = +(((Date.now() - t0) / 1000).toFixed(1));
  marks.push({ t: s, what });
  console.log(`${s}s ${what}`);
};

const rec = await launch({ seed: "/tmp/bfilm/seed-buyer.json", recordDir: OUTDIR });
const { page } = rec;
await page.goto(`${SHOP}/orders/8`, { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForFunction(() => document.body.innerText.includes("FULFILLED"), null, { timeout: 60000 });
await page.waitForTimeout(1500);
mark("order 8 page — Fulfilled");
const heading = page.locator(".collect-panel");
await heading.scrollIntoViewIfNeeded();
await page.waitForTimeout(1200);
mark("delivery counter in frame — the buyer is asked to sign one note");
await page.screenshot({ path: `${OUT}/pickup-counter.png` });
await page.waitForTimeout(7000);
mark("counter hold ends");
const ev = page.getByText("Delivery evidence hash", { exact: false }).first();
await ev.scrollIntoViewIfNeeded().catch(() => {});
await page.waitForTimeout(1000);
mark("evidence block in frame");
await page.screenshot({ path: `${OUT}/pickup-evidence.png` });
await page.waitForTimeout(6000);
mark("PICKUP COMPLETE");
fs.writeFileSync(`${OUT}/pickup-marks.json`, JSON.stringify({ take: "act1-pickup", marks }, null, 1));
await closeAll(rec);
