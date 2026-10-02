/**
 * Nobel Enclave Currency & Date Formatter
 * Standard currency is GHS (GH₵). Amounts in the database are minor units (pesewas).
 */

const SYMBOLS: Record<string, string> = {
  GHS: "GH₵ ",
  NGN: "₦",
  USD: "$",
  EUR: "€",
  GBP: "£",
};

export function formatCurrency(
  minorUnits: number = 0,
  currency: string = "GHS",
): string {
  const code = (currency || "GHS").toUpperCase();
  const symbol = SYMBOLS[code] ?? `${code} `;

  const negative = minorUnits < 0;
  const abs = Math.abs(Math.round(minorUnits));
  const major = Math.floor(abs / 100);
  const minor = abs % 100;
  const grouped = major.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const fraction = `.${minor.toString().padStart(2, "0")}`;

  return `${negative ? "-" : ""}${symbol}${grouped}${fraction}`;
}

export function formatDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return isoString;
  }
}
