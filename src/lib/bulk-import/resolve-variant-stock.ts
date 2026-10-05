import type { Combination } from "./build-variants";
import type { Provenance, StockSpec } from "./schema";

/**
 * Stock for one combination. Independent of pricing: price can follow Size
 * while stock follows Colour, or the spreadsheet.
 */
export function resolveVariantStock(
  spec: StockSpec,
  combo: Combination,
  sourceStock: number | null = null,
): { stock: number | null; source: Provenance | null; track: boolean } {
  switch (spec.mode) {
    case "UNTRACKED":
      return { stock: null, source: null, track: false };
    case "SAME":
      return { stock: spec.quantity, source: "OWNER", track: true };
    case "BY_OPTION": {
      const value = combo.byOption[spec.option];
      const q = value != null ? spec.quantities[value] : undefined;
      return q == null ? fromSource(sourceStock) : { stock: q, source: "OWNER", track: true };
    }
    case "BY_COMBINATION": {
      const q = spec.quantities[combo.key];
      return q == null ? fromSource(sourceStock) : { stock: q, source: "OWNER", track: true };
    }
    case "SOURCE":
      return fromSource(sourceStock);
  }
}

function fromSource(stock: number | null) {
  return stock == null
    ? { stock: 0, source: "SYSTEM" as Provenance, track: true }
    : { stock, source: "SOURCE" as Provenance, track: true };
}
