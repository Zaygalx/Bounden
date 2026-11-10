// Record a stage page for N seconds.
// usage: node record.mjs <stage-data.js> <seconds> <outDir>
import fs from "node:fs";
import path from "node:path";
import { launch, closeAll } from "./cap.mjs";

const [dataFile, seconds, outDir] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
fs.copyFileSync(dataFile, "/home/hatch/workspace/bounden/film/shoot/stage-data.js");
const rec = await launch({ recordDir: outDir });
const { page } = rec;
await page.goto("file:///home/hatch/workspace/bounden/film/shoot/stage.html", { waitUntil: "load", timeout: 30000 });
await page.waitForTimeout(Number(seconds) * 1000);
const vp = page.video()?.path();
await closeAll(rec);
const files = fs.readdirSync(outDir).filter((f) => f.endsWith(".webm"));
console.log("recorded:", files.map((f) => path.join(outDir, f)).join(" "), (await vp) ? "" : "");
