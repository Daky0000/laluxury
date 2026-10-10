/** Eligibility for the existing manual recovery flow, evaluated on every send. */
export function cartRecoveryBlockReason(cart: {
  convertedOrderId: string | null;
  recoveryEmailSentAt: Date | null;
  user: { isActive: boolean; acceptsMarketing: boolean; marketingConsentAt: Date | null } | null;
}): string | null {
  if (cart.convertedOrderId) return "This cart has already been converted to an order.";
  if (cart.recoveryEmailSentAt) return "A recovery notice has already been accepted for this cart.";
  if (!cart.user?.isActive || !cart.user.acceptsMarketing || !cart.user.marketingConsentAt) {
    return "Cart recovery requires an active customer with recorded marketing consent.";
  }
  return null;
}
