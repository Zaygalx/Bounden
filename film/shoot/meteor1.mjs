// Meteor web wallet exploration, step 1: land and report what the
// wallet offers (create/import paths), screenshot for the record.
import fs from "node:fs";
import { launch, closeAll } from "./cap.mjs";

const OUT = "/tmp/bfilm/meteor";
fs.mkdirSync(OUT, { recursive: true });
const rec = await launch({ userDataDir: "/tmp/bfilm/profile" });
const { page } = rec;
await page.goto("https://wallet.meteorwallet.app/", { waitUntil: "domcontentloaded", timeout: 90000 }).catch((e) => console.log("goto err:", String(e).slice(0, 200)));
await page.waitForTimeout(9000);
console.log("URL:", page.url());
const text = await page.evaluate(() => document.body.innerText).catch(() => "");
console.log("TEXT:", text.slice(0, 1200).replace(/\n+/g, " | "));
const clickables = await page.evaluate(() =>
  [...document.querySelectorAll("button, a")].map((el) => (el.innerText || el.textContent || "").trim()).filter(Boolean).slice(0, 40));
console.log("CLICKABLES:", JSON.stringify(clickables));
await page.screenshot({ path: `${OUT}/01-landing.png` });
await closeAll(rec);
