/**
 * Phone numbers, stored in one canonical form: E.164 digits, no plus, no
 * spaces. `233240000000`, `447700900123`, `12125550123`.
 *
 * The same number is written half a dozen ways — 024 000 0000, +233 24 000 0000,
 * 00233 24 000 0000 — and an account keyed on the raw string would let one
 * person register three times and then fail to sign in as any of them.
 *
 * Ghana is the assumed country and the only one whose *national* format is
 * understood, because "0244..." is a Ghanaian number here and a completely
 * different subscriber in Nigeria or the UK. Everyone else writes their country
 * code, which is what the international prefix is for; guessing a country from a
 * national number is how you text a stranger.
 */

/** Ghana. Bare national numbers are resolved against this. */
export const DEFAULT_DIAL_CODE = "233";

/** E.164 allows fifteen digits, and nothing real is shorter than eight. */
const MIN_DIGITS = 8;
const MAX_DIGITS = 15;

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

/** A canonical number that belongs to the default country. */
export function isGhanaian(phone: string): boolean {
  return /^233[0-9]{9}$/.test(phone);
}

/**
 * Reduces any of the accepted spellings to canonical E.164 digits.
 * Returns null when it is not a usable number.
 */
export function normalisePhone(input: string): string | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;

  const digits = raw.replace(/[^0-9]/g, "");
  if (!digits) return null;

  // Written internationally: "+233 24 000 0000", or "00233 24 000 0000" as it
  // is dialled from a landline. Both mean "the country code follows".
  const international = raw.startsWith("+")
    ? digits
    : digits.startsWith("00")
      ? digits.slice(2)
      : null;

  if (international !== null) {
    return international.length >= MIN_DIGITS && international.length <= MAX_DIGITS
      ? international
      : null;
  }

  // Ghanaian national forms.
  if (/^0[0-9]{9}$/.test(digits)) return `${DEFAULT_DIAL_CODE}${digits.slice(1)}`;
  if (/^233[0-9]{9}$/.test(digits)) return digits;
  // The leading zero dropped, as a phone's own contact list often shows it.
  if (/^[2-5][0-9]{8}$/.test(digits)) return `${DEFAULT_DIAL_CODE}${digits}`;

  // A country code typed without the plus — "447700900123". A leading zero
  // rules this out: that is a national number for a country we cannot guess.
  if (!digits.startsWith("0") && digits.length >= 10 && digits.length <= MAX_DIGITS) {
    return digits;
  }

  return null;
}

export function isValidPhone(input: string): boolean {
  return normalisePhone(input) !== null;
}

/**
 * Which Ghanaian network a number belongs to.
 *
 * Null for a number outside Ghana as well as for an unrecognised prefix — the
 * caller wants to name a network, and there is no table here for anywhere else.
 */
export function networkOf(phone: string): Network | null {
  const canonical = normalisePhone(phone);
  if (!canonical || !isGhanaian(canonical)) return null;

  const prefix = canonical.slice(3, 5);
  for (const [network, prefixes] of Object.entries(NETWORKS)) {
    if (prefixes.includes(prefix)) return network as Network;
  }
  return null;
}

/**
 * `233240000000` → `024 000 0000`, which is how a Ghanaian reads it back.
 *
 * Everywhere else is shown as `+` and the digits. Grouping those correctly
 * needs a per-country table of number plans, and a number grouped wrongly is
 * harder to check than one not grouped at all.
 */
export function formatPhone(phone: string): string {
  const canonical = normalisePhone(phone);
  if (!canonical) return phone;
  if (!isGhanaian(canonical)) return `+${canonical}`;

  const local = `0${canonical.slice(3)}`;
  return `${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
}

/** Enough to recognise your own number on a code screen, not enough to read it out. */
export function maskPhone(phone: string): string {
  const canonical = normalisePhone(phone);
  if (!canonical) return phone;

  if (isGhanaian(canonical)) {
    const local = `0${canonical.slice(3)}`;
    return `${local.slice(0, 3)} ${local.slice(3, 6)} ••••`;
  }

  return `+${canonical.slice(0, -4)}••••`;
}

/**
 * A `tel:` link for whatever spelling of a number is stored.
 *
 * Orders placed before numbers were canonicalised hold them as typed — spaces,
 * a leading plus, a national zero — and `tel:` needs one of them: the digits,
 * with a plus in front. A number that cannot be read is linked as its own
 * digits, which is still a better guess than nothing.
 */
export function telHref(phone: string): string {
  const canonical = normalisePhone(phone);
  if (canonical) return `tel:+${canonical}`;
  return `tel:${phone.replace(/[^0-9+]/g, "")}`;
}
