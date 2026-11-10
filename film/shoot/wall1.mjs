// WALL 1 — the poisoned note, paid live, dies at the worker.
// create order -> pay with the poisoned memo (the hook's exact
// string) -> the on-duty cashier fulfils it like any other order.
// Filmed: explorer glance at the memo, the worker's journal for the
// cycle (saved for the terminal segment), the fulfilled order page.
import fs from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { launch, closeAll, SHOP } from "./cap.mjs";

const run = promisify(execFile);
const OUTDIR = "/home/hatch/workspace/bounden/film/render/wall1";
const OUT = "/home/hatch/workspace/bounden/film/shoot/out";
fs.mkdirSync(OUTDIR, { recursive: true });
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
const orderState = async (id) => JSON.parse(await chain("order", String(id)));

let nextId = 9;
while (true) { const o = await orderState(nextId).catch(() => null); if (!o) break; nextId++; }
mark(`pre-flight ok; next order id = ${nextId}`);
const takeStartUnix = Math.floor(Date.now() / 1000);

const createOut = await chain("create", "api-credit-basic");
const orderId = Number((createOut.match(/order id: (\d+)/) || [])[1]);
const createTx = (createOut.match(/create tx: (\S+)/) || [])[1];
mark(`order ${orderId} created — tx ${createTx}`);
const payOut = await chain("pay-poison", String(orderId));
const payTx = (payOut.match(/pay-poison tx: (\S+)/) || [])[1];
mark(`order ${orderId} paid WITH THE POISONED MEMO — tx ${payTx}`);

// wait for the on-duty cashier; one re-draw restart if the gate refuses
let state = (await orderState(orderId))?.state;
let restarted = false;
const waitStart = Date.now();
while (state !== "Fulfilled" && Date.now() - waitStart < 420000) {
  await new Promise((r) => setTimeout(r, 6000));
  const now = (await orderState(orderId))?.state;
  if (now !== state) { state = now; mark(`order state -> ${state}`); }
  if (!restarted && Date.now() - waitStart > 110000 && state === "Paid") {
    const { stdout } = await run("journalctl", ["-u", "bounden-worker", "--since", `@${takeStartUnix}`, "--no-pager"], { timeout: 30000 }).catch(() => ({ stdout: "" }));
    if (/refus|not approved|escalat/i.test(stdout)) {
      mark("judgement refused a clean order — restarting the cashier to re-draw (operations, on the record)");
      await run("systemctl", ["restart", "bounden-worker"], { timeout: 60000 });
      restarted = true;
    }
  }
}
if (state !== "Fulfilled") throw new Error(`order ${orderId} did not fulfil (state=${state})`);
mark(`order ${orderId} FULFILLED — the note changed nothing`);

const { stdout: journal } = await run("journalctl", ["-u", "bounden-worker", "--since", `@${takeStartUnix}`, "--no-pager"], { timeout: 30000 }).catch(() => ({ stdout: "" }));
const jLines = journal.split("\n").filter((l) => l.includes(`"orderId":${orderId}`) || l.includes(`order ${orderId}`));
fs.writeFileSync(`${OUT}/wall1-journal.txt`, jLines.join("\n"));
const fulfilTx = (journal.match(new RegExp(`"orderId":${orderId}[^}]*"txHash":"(\\w+)"`)) || [])[1] || null;
mark(`fulfil tx: ${fulfilTx}`);

// ---- filmed browser beats -------------------------------------------------
const rec = await launch({ seed: "/tmp/bfilm/seed-buyer.json", recordDir: OUTDIR });
const { page } = rec;
await page.goto(`https://testnet.nearblocks.io/txns/${payTx}`, { waitUntil: "domcontentloaded", timeout: 90000 }).catch(() => {});
const memoSeen = await page.waitForFunction(
  () => document.body.innerText.includes("SYSTEM OVERRIDE"), null, { timeout: 120000 }).then(() => true).catch(() => false);
await page.waitForTimeout(1500);
mark(`explorer: poisoned memo visible = ${memoSeen}`);
await page.screenshot({ path: `${OUT}/wall1-memo.png` });
await page.waitForTimeout(5000);

await page.goto(`${SHOP}/orders/${orderId}`, { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForFunction(() => document.body.innerText.includes("FULFILLED"), null, { timeout: 60000 }).catch(() => {});
await page.waitForTimeout(2000);
mark(`order ${orderId} page — Fulfilled`);
await page.screenshot({ path: `${OUT}/wall1-fulfilled.png` });
await page.waitForTimeout(6000);
mark("WALL 1 COMPLETE");
fs.writeFileSync(`${OUT}/wall1-out.json`, JSON.stringify({ orderId, createTx, payTx, fulfilTx, restarted, memoSeen, marks }, null, 1));
await closeAll(rec);
console.log(JSON.stringify({ orderId, createTx, payTx, fulfilTx, restarted, memoSeen }, null, 1));
