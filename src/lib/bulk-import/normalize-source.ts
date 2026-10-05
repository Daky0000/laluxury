import { db } from "@/lib/db";

/**
 * Deterministic normalisation: saved catalog rules, built-in aliases, and the
 * Option Library's canonical spelling. AI only ever *suggests* new rules.
 */

/** Built-in aliases that hold for any shop selling soft furnishings. */
const BUILT_IN: Record<string, Record<string, string>> = {
  size: {
    "s-king": "Superking",
    "s king": "Superking",
    "super king": "Superking",
    "super-king": "Superking",
    "super-k": "Superking",
    sk: "Superking",
    superking: "Superking",
    "k/s": "King",
    king: "King",
    dbl: "Double",
    double: "Double",
    sgl: "Single",
    single: "Single",
    queen: "Queen",
  },
  colour: { grey: "Grey", gray: "Grey", "off white": "Off-White", "off-white": "Off-White" },
};

export type Normalizer = {
  value: (field: string, raw: string) => { value: string; rule: boolean };
  optionName: (raw: string) => string;
};

export async function loadNormalizer(sourceId?: string | null): Promise<Normalizer> {
  const [rules, library] = await Promise.all([
    db.catalogNormalizationRule.findMany({
      where: { sourceKey: { in: ["", sourceId ?? ""] } },
      select: { field: true, fromValue: true, toValue: true, sourceKey: true },
    }),
    db.catalogOptionDefinition.findMany({
      select: { name: true, values: { select: { value: true } } },
    }),
  ]);
  return buildNormalizer(rules, library);
}

export function buildNormalizer(
  rules: { field: string; fromValue: string; toValue: string; sourceKey: string }[],
  library: { name: string; values: { value: string }[] }[],
): Normalizer {
  const key = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  // Source-specific rules beat catalog-wide ones: apply them last.
  const ruleMap = new Map<string, string>();
  for (const r of [...rules].sort((a, b) => (a.sourceKey ? 1 : 0) - (b.sourceKey ? 1 : 0))) {
    ruleMap.set(`${key(r.field)}|${key(r.fromValue)}`, r.toValue);
  }
  const canonicalNames = new Map(library.map((o) => [key(o.name), o.name]));
  canonicalNames.set("color", canonicalNames.get("colour") ?? "Colour");
  const canonicalValues = new Map<string, Map<string, string>>();
  for (const o of library) {
    canonicalValues.set(key(o.name), new Map(o.values.map((v) => [key(v.value), v.value])));
  }

  const optionName = (raw: string) => {
    const k = key(raw);
    return canonicalNames.get(k) ?? raw.trim().replace(/\b\w/g, (c) => c.toUpperCase());
  };

  return {
    optionName,
    value(field, raw) {
      const f = key(optionName(field));
      const v = key(raw);
      const ruled = ruleMap.get(`${f}|${v}`) ?? ruleMap.get(`*|${v}`);
      if (ruled) return { value: ruled, rule: true };
      const builtIn = BUILT_IN[f === "color" ? "colour" : f]?.[v];
      if (builtIn) return { value: builtIn, rule: builtIn !== raw.trim() };
      const canonical = canonicalValues.get(f)?.get(v);
      if (canonical) return { value: canonical, rule: canonical !== raw.trim() };
      return { value: raw.trim(), rule: false };
    },
  };
}

/** True when the value is already a saved library value or covered by a rule. */
export function isKnownValue(
  library: Map<string, Set<string>>,
  field: string,
  value: string,
): boolean {
  const values = library.get(field.toLowerCase());
  return !values || values.size === 0 || values.has(value.toLowerCase());
}

/** "GHS 1,200.50", "₵120", "120" → minor units. Null when not a number. */
export function parseMoney(raw: string | undefined | null): number | null {
  if (raw == null) return null;
  const cleaned = String(raw).replace(/[^0-9.,-]/g, "").replace(/,(?=\d{3}\b)/g, "").replace(",", ".");
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export function parseQuantity(raw: string | undefined | null): number | null {
  if (raw == null || String(raw).trim() === "") return null;
  const n = Number(String(raw).replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.floor(n));
}

export function splitList(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return String(raw)
    .split(/[,;|]/)
    .map((s) => s.trim())
    .filter(Boolean);
}
