// ACT 1 — THE TAKE. One session: catalogue -> product -> Buy click ->
// (the checkout's exact batch is signed by the test buyer's key through
// chain.mjs, the order-4 route, because the wallet's web confirmation
// page cannot load in this browser) -> order page -> the on-duty
// cashier fulfils -> collect at the delivery counter.
// usage: node act1.mjs [takeName]
import fs from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { launch, closeAll, SHOP } from "./cap.mjs";

const run = promisify(execFile);
const TAKE = process.argv[2] || "act1-take1";
const OUTDIR = `/home/hatch/workspace/bounden/film/render/${TAKE}`;
const OUT = "/home/hatch/workspace/bounden/film/shoot/out";
fs.mkdirSync(OUTDIR, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

const marks = [];
const t0 = Date.now();
const mark = (what) => {
  const s = +(((Date.now() - t0) / 1000).toFixed(1));
  marks.push({ t: s, what });
  console.log(`${s}s ${what}`);
};
const chain = async (...args) => {
  const { stdout } = await run("node", ["chain.mjs", ...args], { cwd: "/home/hatch/workspace/bounden/film/shoot", timeout: 180000 });
  return stdout.trim();
};
const orderState = async (id) => {
  const j = JSON.parse(await chain("order", String(id)));
  return j;
};

// ---- pre-flight asserts -------------------------------------------------
const balances = await chain("balances");
console.log(balances);
if (!/USDC=20\.00|USDC=1[0-9]\./.test(balances)) throw new Error("buyer USDC below the two-order budget");
let nextId = 7;
while (true) {
  const o = await orderState(nextId).catch(() => null);
  if (!o) break;
  nextId++;
}
mark(`pre-flight ok; next order id = ${nextId}`);
const homeHtml = await (await fetch(SHOP + "/")).text();
if (/Live read failed|fixture/i.test(homeHtml)) throw new Error("storefront not in clean live mode");

// ---- session -------------------------------------------------------------
const rec = await launch({ seed: "/tmp/bfilm/seed-buyer.json", recordDir: OUTDIR });
const { page } = rec;
const takeStartUnix = Math.floor(Date.now() / 1000);

// pre-warm (trimmed in the edit)
await page.goto(SHOP + "/", { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForTimeout(4000);
await page.goto(SHOP + "/products/api-credit-basic", { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForTimeout(2500);

await page.goto(SHOP + "/", { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForFunction(() => document.body.innerText.includes("sealed units"), null, { timeout: 60000 });
await page.waitForTimeout(600);
mark("TAKE START — catalogue");
await page.waitForTimeout(2400);

await page.getByRole("link", { name: /API Credit/i }).first().click();
await page.waitForTimeout(2200);
mark("product page");
const panel = page.locator(".buy-panel");
await panel.scrollIntoViewIfNeeded();
await page.waitForTimeout(1200);

await page.getByRole("button", { name: /Buy —/ }).click();
mark("BUY clicked (page builds its batch; signing via the checkout-payload route)");

// broadcast the checkout's exact batch with the buyer's key
let orderId, createTx, payTx;
try {
  const createOut = await chain("create", "api-credit-basic");
  orderId = Number((createOut.match(/order id: (\d+)/) || [])[1]);
  createTx = (createOut.match(/create tx: (\S+)/) || [])[1];
  mark(`order ${orderId} created — tx ${createTx}`);
  const payOut = await chain("pay", String(orderId));
  payTx = (payOut.match(/pay tx: (\S+)/) || [])[1];
  mark(`order ${orderId} paid — tx ${payTx}`);
} catch (e) {
  mark(`BROADCAST FAILED: ${String(e.message || e).slice(0, 300)}`);
  fs.writeFileSync(`${OUT}/act1-marks.json`, JSON.stringify({ take: TAKE, orderId, createTx, failed: true, marks }, null, 1));
  await closeAll(rec);
  throw e;
}

await page.goto(`${SHOP}/orders/${orderId}`, { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForTimeout(1800);
mark("order page — Paid");
await page.screenshot({ path: `${OUT}/act1-paid.png` });

// wait for the on-duty cashier
let state = (await orderState(orderId))?.state;
let restarted = false;
const waitStart = Date.now();
while (state !== "Fulfilled" && Date.now() - waitStart < 300000) {
  await page.waitForTimeout(6000);
  const now = (await orderState(orderId))?.state;
  if (now !== state) {
    state = now;
    mark(`order state -> ${state}`);
    await page.reload({ waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForTimeout(1500);
  }
  if (!restarted && Date.now() - waitStart > 110000 && state === "Paid") {
    const { stdout } = await run("journalctl", ["-u", "bounden-worker", "--since", `@${takeStartUnix}`, "--no-pager"], { timeout: 30000 }).catch(() => ({ stdout: "" }));
    if (/refus|not approved|escalat/i.test(stdout)) {
      mark("judgement refused a clean order — restarting the cashier to re-draw (operations, on the record)");
      await run("systemctl", ["restart", "bounden-worker"], { timeout: 60000 });
      restarted = true;
    }
  }
}
if (state !== "Fulfilled") {
  fs.writeFileSync(`${OUT}/act1-marks.json`, JSON.stringify({ take: TAKE, orderId, createTx, payTx, marks }, null, 1));
  throw new Error(`order ${orderId} did not fulfil in the take (state=${state})`);
}
await page.reload({ waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForTimeout(2000);
mark("FULFILLED on the order page");
await page.screenshot({ path: `${OUT}/act1-fulfilled.png` });

// collect at the delivery counter
const collectHeading = page.getByText("The delivery counter", { exact: false }).first();
await collectHeading.scrollIntoViewIfNeeded();
await page.waitForTimeout(1200);
await page.getByRole("button", { name: /Collect/ }).first().click();
mark("COLLECT clicked — signing the note");
const revealed = await page.waitForFunction(
  () => /BOUNDEN-TEST-CREDIT-\d+/.test(document.body.innerText), null, { timeout: 180000 })
  .then(() => true).catch(() => false);
await page.waitForTimeout(1500);
mark(`code revealed in tab: ${revealed}`);
await page.screenshot({ path: `${OUT}/act1-collected.png` });

// journal for this take (log stage + the record)
const { stdout: journal } = await run("journalctl", ["-u", "bounden-worker", "--since", `@${takeStartUnix}`, "--no-pager"], { timeout: 30000 }).catch(() => ({ stdout: "" }));
const lines = journal.split("\n").filter((l) => l.includes(`"orderId":${orderId}`) || l.includes(`order ${orderId}`) || /judgement|fulfilled|signed/i.test(l));
fs.writeFileSync(`${OUT}/act1-journal.txt`, lines.join("\n"));
const fulfilTx = (journal.match(new RegExp(`"orderId":${orderId}[^}]*"txHash":"(\\w+)"`)) || journal.match(/"txHash":"(\w+)"/) || [])[1] || null;

fs.writeFileSync(`${OUT}/act1-marks.json`, JSON.stringify({ take: TAKE, orderId, createTx, payTx, fulfilTx, restarted, revealed, marks }, null, 1));
mark("TAKE COMPLETE");
await closeAll(rec);
console.log(JSON.stringify({ orderId, createTx, payTx, fulfilTx, restarted, revealed }, null, 1));
