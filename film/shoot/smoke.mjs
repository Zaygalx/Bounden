// Smoke test: shop pages carry live data, constitution renders the
// permission object, NearBlocks renders through the proxy, and
// recordVideo actually records.
import fs from "node:fs";
import { launch, closeAll, SHOP } from "./cap.mjs";

const OUT = "/home/hatch/workspace/bounden/film/render/smoke";
fs.mkdirSync(OUT, { recursive: true });
const rec = await launch({ recordDir: OUT + "-video" });
const { page } = rec;

async function probe(name, url, needles, waitMs = 4000) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(waitMs);
  const text = await page.evaluate(() => document.body.innerText).catch(() => "");
  const found = needles.map((n) => `${n}:${text.includes(n) ? "Y" : "N"}`).join(" ");
  console.log(`[${name}] ${found}`);
  await page.screenshot({ path: `${OUT}/${name}.png` });
}

await probe("home", SHOP + "/", ["Bounden", "orders entered", "licence"], 5000);
await probe("constitution", SHOP + "/constitution", ["fulfil_order", "issue_refund", "bounden11.testnet"], 5000);
await probe("product", SHOP + "/products/api-credit-basic", ["$10.00", "sealed"], 5000);
await probe("nearblocks", "https://testnet.nearblocks.io/txns/DWZ4Sr5CtoJG2mbDP666mws97RZkTrK7pUzfd5CSBcAp",
  ["bounden11", "Withdraw", "Success"], 12000);

const videoPathPromise = page.video()?.path();
await closeAll(rec);
if (videoPathPromise) {
  const vp = await videoPathPromise.catch(() => null);
  console.log("video file:", vp);
}
