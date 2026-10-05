import { COMBO_SEPARATOR, type OptionSpec } from "./schema";

/** "5ft / Black" for values in option order. */
export function comboKey(values: string[]): string {
  return values.length ? values.join(COMBO_SEPARATOR) : "Default";
}

export type Combination = { key: string; values: string[]; byOption: Record<string, string> };

/**
 * Every combination of the options' values, in a stable order (first option
 * slowest). Zero options yields one "Default" combination.
 */
export function buildCombinations(options: OptionSpec[]): Combination[] {
  const combos = options.reduce<string[][]>(
    (acc, option) => acc.flatMap((partial) => option.values.map((v) => [...partial, v])),
    [[]],
  );
  return combos.map((values) => ({
    key: comboKey(values),
    values,
    byOption: Object.fromEntries(options.map((o, i) => [o.name, values[i]])),
  }));
}

export function combinationCount(options: OptionSpec[]): number {
  return options.reduce((n, o) => n * Math.max(1, o.values.length), 1);
}

/** The hard cap on generated variants per product, to stop runaway matrices. */
export const MAX_VARIANTS_PER_PRODUCT = 500;

/** Builds a variant SKU from a stem and the option values. */
export function variantSku(stem: string, values: string[], index: number): string {
  if (!values.length) return `${stem}-01`;
  const part = values
    .map((v) =>
      v
        .replace(/[^a-z0-9]+/gi, "")
        .slice(0, 4)
        .toUpperCase(),
    )
    .join("-");
  return `${stem}-${part || String(index + 1).padStart(2, "0")}`;
}
