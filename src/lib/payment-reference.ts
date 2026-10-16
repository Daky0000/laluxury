import { randomBytes } from "node:crypto";

/** Unambiguous upper-case letters and digits, as order numbers use. */
const ALPHABET = "ACDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomToken(length: number): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i += 1) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

/**
 * A payment reference for one attempt: the order number, an optional tag
 * ("BAL", "MANUAL", "POS"...) and 14 random characters (about 69 bits).
 *
 * The reference opens the confirmation page and the payment status checks, so
 * it must not be guessable from the order number and the time, as the old
 * `Date.now()` suffixes were. Paystack allows letters, digits and dashes.
 */
export function newPaymentReference(orderNumber: string, tag?: string): string {
  return [orderNumber, tag, randomToken(14)].filter(Boolean).join("-");
}
