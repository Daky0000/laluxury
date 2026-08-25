import { db } from "./db";
import { GHANA_REGIONS } from "./constants";

export { GHANA_REGIONS };



export type QuotedRate = {
  id: string;
  name: string;
  price: number;
  zoneName: string;
  estimatedDaysMin: number | null;
  estimatedDaysMax: number | null;
  isFree: boolean;
};

/**
 * Rates offered for a destination. A zone with no regions listed is the
 * catch-all, used only when no region-specific zone matches.
 */
export async function quoteShipping(args: {
  region?: string | null;
  subtotal: number;
  totalWeightGrams?: number;
}): Promise<QuotedRate[]> {
  const zones = await db.shippingZone.findMany({
    where: { isActive: true },
    include: {
      rates: { where: { isActive: true }, orderBy: { position: "asc" } },
    },
  });

  const region = args.region?.trim();
  const specific = region ? zones.filter((z) => z.regions.includes(region)) : [];
  const applicable = specific.length > 0 ? specific : zones.filter((z) => z.regions.length === 0);

  const weight = args.totalWeightGrams ?? 0;
  const quotes: QuotedRate[] = [];

  for (const zone of applicable) {
    for (const rate of zone.rates) {
      if (rate.minWeightGrams !== null && weight < rate.minWeightGrams) continue;
      if (rate.maxWeightGrams !== null && weight > rate.maxWeightGrams) continue;

      const isFree =
        rate.freeAboveSubtotal !== null && args.subtotal >= rate.freeAboveSubtotal;

      quotes.push({
        id: rate.id,
        name: rate.name,
        price: isFree ? 0 : rate.price,
        zoneName: zone.name,
        estimatedDaysMin: rate.estimatedDaysMin,
        estimatedDaysMax: rate.estimatedDaysMax,
        isFree,
      });
    }
  }

  return quotes.sort((a, b) => a.price - b.price);
}

export function describeDelivery(rate: {
  estimatedDaysMin: number | null;
  estimatedDaysMax: number | null;
}): string {
  const { estimatedDaysMin: min, estimatedDaysMax: max } = rate;
  if (min === null && max === null) return "";
  if (min !== null && max !== null) {
    return min === max ? `${min} business days` : `${min}-${max} business days`;
  }
  return `${min ?? max} business days`;
}
