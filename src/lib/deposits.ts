/**
 * Pre-order deposits.
 *
 * The owner sets a reservation deposit per pre-order product (Admin →
 * Products, "Reservation deposit (%)"). When a bag holds pre-order pieces and
 * the shopper chooses to pay a deposit, the order's deposit is the highest
 * percentage among those pieces, so no piece is reserved for less than its
 * owner asked. Products without a figure use the standard 50%.
 *
 * Client-safe: no server imports. The app mirrors this in
 * `mobile/src/screens/StorefrontCartScreen.tsx`.
 */

export const DEFAULT_DEPOSIT_PERCENT = 50;

export function depositPercentFor(
  products: readonly { isPreorder?: boolean | null; preorderDepositPercent?: number | null }[],
): number | null {
  const preorder = products.filter((product) => product.isPreorder);
  if (preorder.length === 0) return null;
  const percents = preorder.map((product) =>
    Number.isFinite(product.preorderDepositPercent) && product.preorderDepositPercent
      ? Math.min(100, Math.max(10, Math.round(product.preorderDepositPercent)))
      : DEFAULT_DEPOSIT_PERCENT,
  );
  return Math.max(...percents);
}

/** The deposit due now on `total` (minor units), or null when there is no split. */
export function depositAmountFor(total: number, percent: number | null): number | null {
  if (!percent || percent >= 100 || total <= 0) return null;
  return Math.round((total * percent) / 100);
}
