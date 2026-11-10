// Render every cashier pose to a transparent PNG for the edit.
import fs from "node:fs";
import { launch, closeAll } from "./cap.mjs";

const OUT = "/home/hatch/workspace/bounden/film/assets/cashier";
fs.mkdirSync(OUT, { recursive: true });
const rec = await launch({});
const { page } = rec;
await page.setViewportSize({ width: 620, height: 700 });
for (const pose of ["neutral", "puzzled", "flat", "shakea", "shakeb", "speaking"]) {
  await page.goto("file:///home/hatch/workspace/bounden/film/shoot/character.html?pose=" + pose,
    { waitUntil: "load", timeout: 30000 });
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${OUT}/${pose}.png`, omitBackground: true });
  console.log("rendered", pose);
}
await closeAll(rec);
