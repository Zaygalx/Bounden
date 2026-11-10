// The constitution page — wall 3's "why" and the climax's allowlist
// hold. The cashier is OFF screen for these beats by design.
import fs from "node:fs";
import { launch, closeAll, SHOP } from "./cap.mjs";
const OUTDIR = "/home/hatch/workspace/bounden/film/render/constitution";
const OUT = "/home/hatch/workspace/bounden/film/shoot/out";
fs.mkdirSync(OUTDIR, { recursive: true });
const rec = await launch({ recordDir: OUTDIR });
const { page } = rec;
await page.goto(`${SHOP}/constitution`, { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForTimeout(3500);
console.log("landed:", page.url());
const text = await page.evaluate(() => document.body.innerText);
console.log("has fulfil_order:", text.includes("fulfil_order"), "| has issue_refund:", text.includes("issue_refund"), "| has 0.25:", /0\.25/.test(text));
await page.screenshot({ path: `${OUT}/constitution-top.png` });
const panel = page.getByText("fulfil_order", { exact: false }).first();
await panel.scrollIntoViewIfNeeded().catch(() => {});
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/constitution-key.png` });
console.log("key panel in frame");
await page.waitForTimeout(12000);
await closeAll(rec);
console.log("CONSTITUTION CAPTURE COMPLETE");
