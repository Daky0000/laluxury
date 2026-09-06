/**
 * Ghanaian mobile numbers.
 *
 * One canonical form is stored — `233XXXXXXXXX`, no plus, no spaces — because
 * the same number is written half a dozen ways (024 000 0000, +233 24 000 0000,
 * 233240000000) and an account keyed on the raw string would let the same
 * person register three times and then fail to sign in as any of them.
 *
 * Vynfy accepts `233XXXXXXXXX`, `+233XXXXXXXXX` and `0XXXXXXXXX`, so the stored
 * form goes to the API unchanged.
 */

export type Network = "MTN" | "Telecel" | "AirtelTigo" | "Glo";

/**
 * NCA prefix allocations, by the national `0XX` form. Kept here rather than in
 * the UI because both the sign-up hint and the checkout copy need it.
 */
const NETWORKS: Record<Network, string[]> = {
  MTN: ["24", "54", "55", "59", "25", "53"],
  Telecel: ["20", "50"],
  AirtelTigo: ["27", "57", "26", "56"],
  Glo: ["23"],
};

/** The three the shop takes Mobile Money on, in the order the checkout lists them. */
export const MOMO_NETWORKS: Network[] = ["MTN", "Telecel", "AirtelTigo"];

/**
 * Reduces any of the accepted spellings to `233XXXXXXXXX`.
 * Returns null when it is not a Ghanaian mobile number at all.
 */
export function normalisePhone(input: string): string | null {
  const digits = (input ?? "").replace(/\D/g, "");
  if (!digits) return null;

  // 0XXXXXXXXX — the way it is written on a shop front.
  if (/^0[0-9]{9}$/.test(digits)) return `233${digits.slice(1)}`;
  // 233XXXXXXXXX — already canonical, or typed with the plus.
  if (/^233[0-9]{9}$/.test(digits)) return digits;
  // XXXXXXXXX — the leading zero dropped, as phones often show it.
  if (/^[2-5][0-9]{8}$/.test(digits)) return `233${digits}`;

  return null;
}

export function isValidPhone(input: string): boolean {
  return normalisePhone(input) !== null;
}

/** Which network a stored number belongs to, or null if the prefix is unknown. */
export function networkOf(phone: string): Network | null {
  const canonical = normalisePhone(phone);
  if (!canonical) return null;

  const prefix = canonical.slice(3, 5);
  for (const [network, prefixes] of Object.entries(NETWORKS)) {
    if (prefixes.includes(prefix)) return network as Network;
  }
  return null;
}

/** `233240000000` → `024 000 0000`, which is how a Ghanaian reads it back. */
export function formatPhone(phone: string): string {
  const canonical = normalisePhone(phone);
  if (!canonical) return phone;
  const local = `0${canonical.slice(3)}`;
  return `${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
}

/** `024 000 ••••` — enough to recognise your own number on a code screen. */
export function maskPhone(phone: string): string {
  const canonical = normalisePhone(phone);
  if (!canonical) return phone;
  const local = `0${canonical.slice(3)}`;
  return `${local.slice(0, 3)} ${local.slice(3, 6)} ${"•".repeat(4)}`;
}
