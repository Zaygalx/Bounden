/** Display formatting. All money maths is BigInt on base-unit strings. */

/** Stablecoin base units (6 decimals) → "$25.00". */
export function formatUsd(baseUnits: string): string {
  let v: bigint;
  try {
    v = BigInt(baseUnits);
  } catch {
    return baseUnits;
  }
  const negative = v < 0n;
  const abs = negative ? -v : v;
  const whole = abs / 1_000_000n;
  const cents = ((abs % 1_000_000n) / 10_000n).toString().padStart(2, "0");
  return `${negative ? "-" : ""}$${whole.toString()}.${cents}`;
}

/** YoctoNEAR decimal string → "0.25 NEAR". */
export function formatNear(yocto: string | null): string {
  if (yocto === null) return "unlimited";
  let v: bigint;
  try {
    v = BigInt(yocto);
  } catch {
    return yocto;
  }
  const whole = v / 10n ** 24n;
  const frac = (v % 10n ** 24n)
    .toString()
    .padStart(24, "0")
    .slice(0, 6)
    .replace(/0+$/, "");
  return `${whole.toString()}${frac ? `.${frac}` : ""} NEAR`;
}

/** Nanosecond duration → "1 hour", "30 minutes", "2 days". */
export function humaniseNs(ns: number): string {
  const seconds = Math.floor(ns / 1e9);
  if (seconds < 60) return `${seconds} seconds`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
}

/** Nanosecond block timestamp → readable UTC date/time. */
export function formatTimestampNs(ns: number | null): string {
  if (ns === null) return "—";
  const ms = Math.floor(ns / 1e6);
  return new Date(ms).toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC");
}

/** Basis points → "±10% per update". */
export function formatBandBps(bps: number): string {
  const pct = bps / 100;
  return `${Number.isInteger(pct) ? pct.toString() : pct.toFixed(2)}%`;
}
