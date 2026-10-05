import type { Combination } from "./build-variants";
import type { PricingSpec, Provenance } from "./schema";

/**
 * The price of one combination under a pricing rule, in minor units, or null
 * when the rule has no answer for it (that becomes a "Missing price" issue,
 * never a guess). `sourcePrice` is the spreadsheet/feed price for this row.
 */
export function resolveVariantPrice(
  spec: PricingSpec,
  combo: Combination,
  sourcePrice: number | null = null,
): { price: number | null; source: Provenance | null } {
  switch (spec.mode) {
    case "SAME":
      return spec.price == null ? fromSource(sourcePrice) : { price: spec.price, source: "OWNER" };
    case "BY_OPTION": {
      const value = combo.byOption[spec.option];
      const price = value != null ? spec.prices[value] : undefined;
      return price == null ? fromSource(sourcePrice) : { price, source: "OWNER" };
    }
    case "BY_OPTIONS": {
      let total = spec.base;
      for (const [option, amounts] of Object.entries(spec.adjustments)) {
        const value = combo.byOption[option];
        if (value == null) continue;
        total += amounts[value] ?? 0;
      }
      return { price: Math.max(0, total), source: "OWNER" };
    }
    case "BY_COMBINATION": {
      const price = spec.prices[combo.key];
      return price == null ? fromSource(sourcePrice) : { price, source: "OWNER" };
    }
    case "SOURCE":
      return fromSource(sourcePrice);
  }
}

function fromSource(price: number | null): { price: number | null; source: Provenance | null } {
  return price == null ? { price: null, source: null } : { price, source: "SOURCE" };
}
