// Render the Bounden mascot to a transparent PNG frame sequence.
// Same capture plumbing as render-cashier.mjs, new art (mascot-anim.html).
// usage: node render-mascot.mjs <cues.json> <durationSec> <outDir> [fps]
import fs from "node:fs";
import path from "node:path";
import { launch, closeAll } from "./cap.mjs";

const [cuesFile, durArg, outDir, fpsArg] = process.argv.slice(2);
const dur = Number(durArg);
const fps = Number(fpsArg || 24);
const cues = JSON.parse(fs.readFileSync(cuesFile, "utf8"));
fs.mkdirSync(outDir, { recursive: true });
for (const f of fs.readdirSync(outDir)) if (f.endsWith(".png")) fs.unlinkSync(path.join(outDir, f));

const rec = await launch({});
const { page } = rec;
await page.setViewportSize({ width: 640, height: 720 });
await page.addInitScript((c) => { window.__CUES__ = c; }, cues);
await page.goto("file:///home/hatch/workspace/bounden/film/shoot/mascot-anim.html", { waitUntil: "load", timeout: 30000 });
await page.waitForTimeout(300);
const frames = Math.round(dur * fps);
for (let i = 0; i < frames; i++) {
  const t = i / fps;
  await page.evaluate((tt) => window.__setTime__(tt), t);
  await page.screenshot({ path: path.join(outDir, `f${String(i).padStart(4, "0")}.png`), omitBackground: true });
}
await closeAll(rec);
console.log(`rendered ${frames} frames @${fps}fps to ${outDir}`);
