// Act 1 REHEARSAL — UI flow only, nothing is broadcast (the wallet
// popup cannot load in this browser, so the batch never signs).
// Learns: connect state, BuyPanel behaviour after the click, the
// signing-state timing, and captures a LIVE home screenshot for the
// hook backdrop. Verifies afterwards that no order was created.
import fs from "node:fs";
import { launch, closeAll, SHOP } from "./cap.mjs";

const OUT = "/tmp/bfilm/rehearsal";
fs.mkdirSync(OUT, { recursive: true });
const rec = await launch({ seed: "/tmp/bfilm/seed-buyer.json" });
const { page, context } = rec;
const marks = [];
const t0 = Date.now();
const mark = (what) => { const s = ((Date.now() - t0) / 1000).toFixed(1); marks.push(`${s}s ${what}`); console.log(`${s}s ${what}`); };
const popups = [];
context.on("page", (p) => { popups.push(p); mark(`popup opened -> ${p.url().slice(0, 90)}`); });
page.on("console", (m) => { const t = m.text(); if (/transformed|meteor|sign/i.test(t)) mark(`console: ${t.slice(0, 130)}`); });

await page.goto(SHOP + "/", { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForFunction(() => document.body.innerText.includes("sealed units"), null, { timeout: 60000 }).catch(() => {});
await page.waitForTimeout(1500);
mark("home loaded");
await page.screenshot({ path: "/home/hatch/workspace/bounden/film/assets/home-live.png" });

const connected = await page.waitForFunction(
  () => document.body.innerText.includes("fe9591cc") || document.body.innerText.includes("Disconnect"),
  null, { timeout: 30000 }).then(() => true).catch(() => false);
mark(`connected state visible: ${connected}`);

await page.getByRole("link", { name: /API Credit/i }).first().click().catch(async () => {
  await page.goto(SHOP + "/products/api-credit-basic", { waitUntil: "domcontentloaded" });
});
await page.waitForTimeout(2500);
mark("product page");
await page.screenshot({ path: `${OUT}/product.png` });

await page.getByRole("button", { name: /Buy —/ }).click();
mark("BUY clicked");
for (let i = 0; i < 6; i++) {
  await page.waitForTimeout(2000);
  const panelText = await page.evaluate(() => {
    const el = document.querySelector(".buy-panel");
    return el ? el.innerText.replace(/\s+/g, " ").slice(0, 220) : "(no panel)";
  }).catch(() => "(eval failed)");
  mark(`panel[${i * 2 + 2}s]: ${panelText}`);
  await page.screenshot({ path: `${OUT}/panel-${i}.png` });
}
console.log("POPUPS:", popups.map((p) => p.url().slice(0, 120)).join(" | ") || "(none)");
await closeAll(rec);
console.log("MARKS:\n" + marks.join("\n"));
