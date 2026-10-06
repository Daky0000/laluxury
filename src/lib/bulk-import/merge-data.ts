import { buildOptions } from "./build-options";
import { buildCombinations, comboKey, MAX_VARIANTS_PER_PRODUCT, variantSku } from "./build-variants";
import type { Normalizer } from "./normalize-source";
import { parseMoney, parseQuantity, splitList } from "./normalize-source";
import { resolveVariantPrice } from "./resolve-variant-price";
import { resolveVariantStock } from "./resolve-variant-stock";
import type { SourceRow } from "./group-source-products";
import type {
  BatchSetup,
  Field,
  ImageDraft,
  ItemDraft,
  ItemOverrides,
  OptionSpec,
  Provenance,
  RecipeConfig,
  VariantDraft,
} from "./schema";

/**
 * Builds one product draft from everything known about it, applying the
 * precedence rule field by field:
 *
 *   1 owner item override   2 owner batch value   3 spreadsheet/source
 *   4 saved source profile  5 Product Recipe      6 deterministic rule
 *   7 AI suggestion         8 blank
 *
 * AI never overwrites anything above it. Every field records where it came from.
 */

export type AiResult = {
  model: string;
  confidence: number;
  title?: string;
  shortDescription?: string;
  description?: string;
  tags?: string[];
  metaTitle?: string;
  metaDescription?: string;
  altText?: string;
  dominantColours?: string[];
  pattern?: string | null;
  suggestedCategoryId?: string | null;
  matchedOptionValue?: string | null;
  visibleLogo?: boolean;
  warnings?: string[];
};

export type MediaInput = {
  id: string;
  mediaId: string;
  url: string;
  filename: string;
  optionName: string | null;
  optionValue: string | null;
  position: number;
};

type Candidate<T> = [T | null | undefined, Provenance, { model?: string; confidence?: number }?];

function pick<T>(...candidates: Candidate<T>[]): Field<T> | undefined {
  for (const [value, source, meta] of candidates) {
    if (value == null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    return { value, source, ...(meta ?? {}) };
  }
  return undefined;
}

export function buildItemDraft(args: {
  setup: BatchSetup;
  recipe: RecipeConfig | null;
  profileDefaults?: { material?: string | null; care?: string | null; brand?: string | null } | null;
  rows: SourceRow[];
  media: MediaInput[];
  overrides: ItemOverrides | null;
  ai: AiResult | null;
  normalizer: Normalizer;
  categoryBySlugOrName: Map<string, string>;
  collectionBySlugOrName: Map<string, string>;
  skuStem: string;
}): ItemDraft {
  const { setup, recipe, rows, media, ai, normalizer } = args;
  const o = args.overrides ?? {};
  const first = rows[0]?.fields ?? {};
  const d = setup.defaults;
  const p = args.profileDefaults ?? {};
  const aiMeta = ai ? { model: ai.model, confidence: ai.confidence } : undefined;
  const useAi = setup.aiEnabled ? setup.aiFields : null;

  const replace = (option: string, value: string) => o.valueReplacements?.[option]?.[value] ?? value;
  const norm = (option: string, raw: string) => {
    const name = normalizer.optionName(option);
    const n = normalizer.value(name, raw);
    return { name, value: replace(name, n.value), rule: n.rule };
  };

  // --- Options and versions ------------------------------------------------
  const rowsWithOptions = rows.filter((r) => Object.keys(r.options).length > 0);
  let options: OptionSpec[];
  let combos: { key: string; values: string[]; byOption: Record<string, string>; row: SourceRow | null }[];

  if (o.options) {
    options = buildOptions(o.options);
    combos = buildCombinations(options).map((c) => ({ ...c, row: rows[0] ?? null }));
  } else if (rowsWithOptions.length) {
    // Each source row is one version; the options are what the rows contain.
    const observed = new Map<string, string[]>();
    const normalised = rowsWithOptions.map((row) => {
      const byOption: Record<string, string> = {};
      for (const [rawName, rawValue] of Object.entries(row.options)) {
        const n = norm(rawName, rawValue);
        byOption[n.name] = n.value;
        const list = observed.get(n.name) ?? [];
        if (!list.includes(n.value)) list.push(n.value);
        observed.set(n.name, list);
      }
      return { row, byOption };
    });
    // Keep the batch's option order (and its value order) where it names them.
    const order = [...setup.options.map((x) => x.name), ...observed.keys()];
    const names = [...new Set(order)].filter((n) => observed.has(n));
    options = names.map((name) => {
      const preferred = setup.options.find((x) => x.name === name)?.values ?? [];
      const seen = observed.get(name)!;
      return { name, values: [...preferred.filter((v) => seen.includes(v)), ...seen.filter((v) => !preferred.includes(v))] };
    });
    combos = normalised.map(({ row, byOption }) => {
      const values = names.map((n) => byOption[n] ?? "—");
      return { key: comboKey(values), values, byOption, row };
    });
  } else {
    options = buildOptions(setup.options.length ? setup.options : (recipe?.options ?? []));
    combos = buildCombinations(options).map((c) => ({ ...c, row: rows[0] ?? null }));
  }

  if (combos.length > MAX_VARIANTS_PER_PRODUCT) combos = combos.slice(0, MAX_VARIANTS_PER_PRODUCT);

  const pricing = o.pricing ?? setup.pricing;
  const stockSpec = o.stockSpec ?? setup.stock;
  const disabled = new Set([...(setup.disabledCombinations ?? []), ...(o.disabledCombinations ?? [])]);
  // A shared prefix (batch default or recipe) is the same for every item, so it
  // gets the item's own suffix; otherwise every product in the batch would
  // generate identical SKUs.
  const prefix = d.skuPrefix || recipe?.skuPrefix;
  const itemSuffix = args.skuStem.split("-").pop() ?? args.skuStem;
  const stem = (first.parentSku || (prefix ? `${prefix}-${itemSuffix}` : args.skuStem)).toUpperCase();

  const variants: VariantDraft[] = combos.map((combo, index) => {
    const src = combo.row?.fields ?? {};
    const ownRow = !o.options && (rowsWithOptions.length > 0 || combos.length === 1);
    const priced = o.price != null
      ? { price: o.price, source: "OWNER" as Provenance }
      : resolveVariantPrice(pricing, combo, parseMoney(src.price));
    const stocked = o.stock != null
      ? { stock: o.stock, source: "OWNER" as Provenance, track: true }
      : resolveVariantStock(stockSpec, combo, parseQuantity(src.stock));
    return {
      key: combo.key,
      values: combo.values,
      enabled: !disabled.has(combo.key),
      // A row's own SKU/barcode only belongs to a version when that row *is* the version.
      sku: (ownRow && src.sku?.trim()) || variantSku(stem, combo.values, index),
      barcode: (ownRow && src.barcode?.trim()) || null,
      price: priced.price,
      priceSource: priced.source,
      compareAtPrice: parseMoney(src.compareAtPrice),
      costPrice: parseMoney(src.costPrice),
      stock: stocked.stock,
      stockSource: stocked.source,
      trackInventory: stocked.track,
      weightGrams: parseQuantity(src.weightGrams),
    };
  });

  // --- Images --------------------------------------------------------------
  const images: ImageDraft[] = [...media]
    .sort((a, b) => a.position - b.position)
    .map((m) => ({
      importMediaId: m.id,
      mediaId: m.mediaId,
      url: m.url,
      alt: null,
      option: m.optionName,
      optionValue: m.optionValue,
    }));
  for (const row of rows) {
    for (const url of splitList(row.fields.imageUrl)) {
      if (/^https?:\/\//i.test(url) && !images.some((i) => i.url === url)) {
        images.push({ importMediaId: null, mediaId: null, url, alt: null, option: null, optionValue: null });
      }
    }
  }

  // --- Categories ----------------------------------------------------------
  const lookup = (map: Map<string, string>, raw?: string) =>
    splitList(raw)
      .map((n) => map.get(n.toLowerCase()))
      .filter((x): x is string => Boolean(x));

  const sourceTitle = first.title?.trim();
  const titleFromBatch = d.title?.trim() || null;
  const prefixed = (t: string | null | undefined) =>
    t && d.titlePrefix ? `${d.titlePrefix.trim()} ${t}`.trim() : t;

  const draft: ItemDraft = {
    title: pick<string>(
      [o.title, "OWNER"],
      [titleFromBatch, "OWNER"],
      [prefixed(sourceTitle), "SOURCE"],
      [useAi?.titles ? prefixed(ai?.title) : null, "AI", aiMeta],
    ),
    shortDescription: pick<string>(
      [o.shortDescription, "OWNER"],
      [first.shortDescription, "SOURCE"],
      [useAi?.descriptions ? ai?.shortDescription : null, "AI", aiMeta],
    ),
    description: pick<string>(
      [o.description, "OWNER"],
      [first.description, "SOURCE"],
      [useAi?.descriptions ? ai?.description : null, "AI", aiMeta],
    ),
    metaTitle: pick<string>([o.metaTitle, "OWNER"], [useAi?.seo ? ai?.metaTitle : null, "AI", aiMeta]),
    metaDescription: pick<string>(
      [o.metaDescription, "OWNER"],
      [useAi?.seo ? ai?.metaDescription : null, "AI", aiMeta],
    ),
    // Facts: never from AI.
    brand: pick<string>([o.brand, "OWNER"], [d.brand, "OWNER"], [first.brand, "SOURCE"], [p.brand, "SOURCE"]),
    material: pick<string>(
      [o.material, "OWNER"],
      [d.material, "OWNER"],
      [first.material, "SOURCE"],
      [p.material, "SOURCE"],
      [recipe?.material, "RECIPE"],
    ),
    care: pick<string>(
      [o.care, "OWNER"],
      [d.care, "OWNER"],
      [first.care, "SOURCE"],
      [p.care, "SOURCE"],
      [recipe?.care, "RECIPE"],
    ),
    tags: pick<string[]>(
      [o.tags, "OWNER"],
      [
        dedupe([...(d.tags ?? []), ...splitList(first.tags), ...(recipe?.tags ?? []), ...(o.addTags ?? [])]),
        d.tags?.length ? "OWNER" : first.tags ? "SOURCE" : "RECIPE",
      ],
      [useAi?.titles || useAi?.seo ? ai?.tags : null, "AI", aiMeta],
    ),
    colours: pick<string[]>([useAi?.visual ? ai?.dominantColours : null, "AI", aiMeta]),
    pattern: pick<string>([useAi?.visual ? ai?.pattern : null, "AI", aiMeta]),
    categoryIds: pick<string[]>(
      [o.categoryIds, "OWNER"],
      [d.categoryIds, "OWNER"],
      [lookup(args.categoryBySlugOrName, first.category), "SOURCE"],
      [recipe?.categoryIds, "RECIPE"],
      [useAi?.category && ai?.suggestedCategoryId ? [ai.suggestedCategoryId] : null, "AI", aiMeta],
    ),
    collectionIds: pick<string[]>(
      [o.collectionIds, "OWNER"],
      [d.collectionIds, "OWNER"],
      [lookup(args.collectionBySlugOrName, first.collection), "SOURCE"],
    ),
    parentSku: pick<string>([first.parentSku, "SOURCE"], [stem, "SYSTEM"]),
    options,
    variants,
    images,
  };

  // AI alt text fills images that have none; colour/pattern enrich tags only
  // when the owner asked for visual help.
  if (useAi?.altText && ai?.altText) {
    for (const img of draft.images) img.alt ??= ai.altText;
  }
  if (draft.tags && useAi?.visual) {
    const visual = [...(ai?.dominantColours ?? []), ai?.pattern ?? ""].map((t) => t.toLowerCase()).filter(Boolean);
    draft.tags = { ...draft.tags, value: dedupe([...draft.tags.value, ...visual]) };
  }
  return draft;
}

function dedupe(list: string[]): string[] {
  const seen = new Set<string>();
  return list
    .map((t) => t.trim())
    .filter((t) => {
      const k = t.toLowerCase();
      if (!t || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}
