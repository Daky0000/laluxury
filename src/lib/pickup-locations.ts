/**
 * Places a customer can collect an order from, edited under admin settings.
 *
 * Orders carry no separate "pickup" column: a pickup order is written with the
 * location as its address and "(Pickup)" in the first line, which is how the
 * app API, the admin screens and the delivery-fee logic already recognise one.
 *
 * Client-safe: no server imports.
 */

export type PickupLocation = {
  id: string;
  name: string;
  address: string;
  city: string;
  region: string;
  /** Free text, e.g. "Mon–Sat, 9am–6pm". */
  hours: string;
};

export const DEFAULT_PICKUP_LOCATIONS: PickupLocation[] = [
  {
    id: "showroom",
    name: "Noble Enclave Showroom",
    address: "Spintex Road / Airport Residential",
    city: "Accra",
    region: "Greater Accra",
    hours: "",
  },
];

function slug(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "location"
  );
}

/** A stored list, cleaned: named entries only, unique ids. */
export function normalisePickupLocations(value: unknown): PickupLocation[] {
  if (!Array.isArray(value)) return DEFAULT_PICKUP_LOCATIONS;
  const seen = new Set<string>();
  const out: PickupLocation[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as Partial<Record<keyof PickupLocation, unknown>>;
    const name = typeof entry.name === "string" ? entry.name.trim() : "";
    if (!name) continue;
    let id = typeof entry.id === "string" && entry.id.trim() ? entry.id.trim() : slug(name);
    while (seen.has(id)) id = `${id}-2`;
    seen.add(id);
    const text = (key: keyof PickupLocation) =>
      typeof entry[key] === "string" ? (entry[key] as string).trim() : "";
    out.push({
      id,
      name,
      address: text("address"),
      city: text("city") || "Accra",
      region: text("region") || "Greater Accra",
      hours: text("hours"),
    });
  }
  return out;
}

/**
 * The admin edits locations as text, one per line:
 * `Name | Address | City | Region | Hours`.
 */
export function parsePickupLocationsText(text: string): PickupLocation[] {
  return normalisePickupLocations(
    text
      .split(/\r?\n/)
      .map((line) => line.split("|").map((part) => part.trim()))
      .filter((parts) => parts[0])
      .map(([name, address, city, region, hours]) => ({ name, address, city, region, hours })),
  );
}

export function pickupLocationsToText(locations: PickupLocation[]): string {
  return locations
    .map((l) => [l.name, l.address, l.city, l.region, l.hours].join(" | ").replace(/( \| )+$/, ""))
    .join("\n");
}

/** The address an order is written with when collected from `location`. */
export function pickupAddressLines(location: PickupLocation): { line1: string; line2: string | null } {
  return {
    line1: `${location.name} (Pickup)`,
    line2: [location.address, location.hours].filter(Boolean).join(" · ") || null,
  };
}

/**
 * True for an address written for a pickup order. Uses the same wording test
 * as the app order API, so older "(Self-Pickup)" orders are caught too.
 */
export function isPickupAddress(line1: string | null | undefined): boolean {
  return /pickup|showroom/i.test(line1 ?? "");
}
