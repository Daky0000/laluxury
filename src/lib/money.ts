/**
 * Money is an integer count of MINOR UNITS (pesewas for GHS).
 * Nothing in this codebase should ever hold a price as a float.
 */

export const CURRENCY = process.env.NEXT_PUBLIC_CURRENCY || "GHS";

const SYMBOLS: Record<string, string> = {
  GHS: "GH\u20B5",
  NGN: "\u20A6",
  USD: "$",
  ZAR: "R",
  KES: "KSh",
};

export function currencySymbol(currency: string = CURRENCY): string {
  return SYMBOLS[currency] ?? `${currency} `;
}

/** 12050 -> "GH₵120.50" */
export function formatMoney(minorUnits: number, currency: string = CURRENCY): string {
  const negative = minorUnits < 0;
  const abs = Math.abs(Math.round(minorUnits));
  const major = Math.floor(abs / 100);
  const minor = abs % 100;
  const grouped = major.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}${currencySymbol(currency)}${grouped}.${minor
    .toString()
    .padStart(2, "0")}`;
}

/** "120.50" or 120.5 -> 12050. Throws on nonsense so bad prices never persist. */
export function toMinorUnits(value: string | number): number {
  const n = typeof value === "string" ? Number(value.replace(/[^0-9.-]/g, "")) : value;
  if (!Number.isFinite(n)) throw new Error(`Invalid money value: ${value}`);
  return Math.round(n * 100);
}

/** 12050 -> 120.5, for populating number inputs in the admin. */
export function toMajorUnits(minorUnits: number): number {
  return Math.round(minorUnits) / 100;
}

/**
 * Splits `total` across `weights` so the parts always sum back to `total`.
 * Used to allocate an order-level discount onto line items without losing or
 * inventing a pesewa to rounding.
 */
export function allocateProportionally(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0 || total === 0) return weights.map(() => 0);

  const raw = weights.map((w) => (total * w) / sum);
  const floored = raw.map((v) => Math.floor(v));
  let remainder = total - floored.reduce((a, b) => a + b, 0);

  // Hand the leftover pesewas to the lines with the largest fractional part.
  const order = raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);

  for (const { i } of order) {
    if (remainder <= 0) break;
    floored[i] += 1;
    remainder -= 1;
  }
  return floored;
}
