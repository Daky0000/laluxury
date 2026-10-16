import { GHANA_REGIONS } from "./constants";
import { getCommerceSettings } from "./settings";
import { toMinorUnits } from "./money";

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
 * The id the one delivery option is quoted under. It is not a ShippingRate
 * row, so an order delivered at the fixed fee stores no `shippingRateId`
 * (see `shippingRateIdForOrder`); its `shippingTotal` is the record.
 */
export const STANDARD_DELIVERY_RATE_ID = "standard-delivery";

/** What an order stores as its rate: nothing for the fixed fee. */
export function shippingRateIdForOrder(rateId: string | null | undefined): string | null {
  return !rateId || rateId === STANDARD_DELIVERY_RATE_ID ? null : rateId;
}

/**
 * Delivery for a destination: one option at the store's fixed fee
 * (`deliveryFee`, set under Admin → Settings → Delivery), the same for every
 * region. The store-wide free-delivery threshold still applies. Pickup orders
 * never ask for a quote.
 *
 * The region and weight are kept in the signature so web and app callers stay
 * as they are; neither changes the price.
 */
export async function quoteShipping(args: {
  region?: string | null;
  subtotal: number;
  totalWeightGrams?: number;
}): Promise<QuotedRate[]> {
  // Pricing reads never fall back to defaults; see getCommerceSettings.
  const settings = await getCommerceSettings();

  const isFree =
    settings.deliveryFee === 0 ||
    (settings.freeShippingThreshold !== null && args.subtotal >= settings.freeShippingThreshold);

  return [
    {
      id: STANDARD_DELIVERY_RATE_ID,
      name: "Delivery",
      price: isFree ? 0 : settings.deliveryFee,
      zoneName: "All regions",
      estimatedDaysMin: null,
      estimatedDaysMax: null,
      isFree,
    },
  ];
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

/** Parses a fee typed in cedis ("50", "50.00") into minor units, or says why not. */
export function parseDeliveryFee(raw: unknown): { fee: number } | { error: string } {
  const text = String(raw ?? "").trim();
  if (!text) return { error: "Enter the delivery fee." };
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return { error: "Enter the fee in cedis, like 50 or 50.00." };
  const fee = toMinorUnits(text);
  if (!Number.isSafeInteger(fee) || fee < 0) return { error: "A delivery fee cannot be negative." };
  return { fee };
}
