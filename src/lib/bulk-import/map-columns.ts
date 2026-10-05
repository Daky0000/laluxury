import { runBulkAiTask } from "@/lib/bulk-ai/router";
import { mapColumnsPrompt } from "@/lib/bulk-ai/prompts";
import { columnMappingSchema } from "@/lib/bulk-ai/schemas";
import { TARGET_FIELDS, type ColumnMapping } from "./schema";

/**
 * Column mapping: deterministic header matching first, AI only for what is
 * left, and the owner confirms either way.
 */

const SYNONYMS: Record<string, string[]> = {
  externalKey: ["external id", "supplier id", "item id", "product id", "style id", "ref"],
  parentSku: ["parent sku", "style code", "style", "parent", "group", "model"],
  sku: ["sku", "item code", "code", "product code", "variant sku", "article"],
  barcode: ["barcode", "ean", "upc", "gtin"],
  title: ["title", "name", "item name", "product name", "product", "description short"],
  shortDescription: ["short description", "summary", "subtitle"],
  description: ["description", "details", "long description"],
  price: ["price", "retail", "retail price", "selling price", "rrp", "sale price"],
  compareAtPrice: ["compare at", "was price", "old price", "compare at price"],
  costPrice: ["cost", "cost price", "wholesale", "buy price", "unit cost"],
  stock: ["stock", "qty", "quantity", "on hand", "inventory", "available"],
  category: ["category", "type", "department"],
  collection: ["collection", "range"],
  brand: ["brand", "maker", "manufacturer"],
  material: ["material", "fabric", "composition"],
  care: ["care", "care instructions", "washing"],
  tags: ["tags", "keywords"],
  imageFile: ["image", "image file", "photo", "picture", "filename", "image name"],
  imageUrl: ["image url", "photo url", "picture url", "image link"],
  weightGrams: ["weight", "weight g", "grams"],
};

const OPTION_HEADERS = ["size", "colour", "color", "drop", "length", "width", "finish", "pattern", "pack size", "shape", "scent"];

function norm(s: string): string {
  return s.toLowerCase().replace(/[_\-./]+/g, " ").replace(/\s+/g, " ").trim();
}

export function suggestMappingDeterministic(headers: string[], knownOptions: string[] = []): ColumnMapping {
  const mapping: ColumnMapping = {};
  const used = new Set<string>();
  const optionNames = [...new Set([...knownOptions, ...OPTION_HEADERS])];

  for (const header of headers) {
    const h = norm(header);
    const option = optionNames.find((o) => norm(o) === h);
    if (option) {
      const name = option === "color" ? "Colour" : option.replace(/\b\w/g, (c) => c.toUpperCase());
      mapping[header] = `option:${name}`;
      continue;
    }
    const field = Object.entries(SYNONYMS).find(([f, words]) => !used.has(f) && words.some((w) => w === h));
    if (field) {
      mapping[header] = field[0];
      used.add(field[0]);
    }
  }
  // Second pass: contains-matches for anything still open.
  for (const header of headers) {
    if (mapping[header]) continue;
    const h = norm(header);
    const field = Object.entries(SYNONYMS).find(
      ([f, words]) => !used.has(f) && words.some((w) => w.length > 3 && h.includes(w)),
    );
    mapping[header] = field ? field[0] : "ignore";
    if (field) used.add(field[0]);
  }
  return mapping;
}

/** Deterministic mapping, with AI filling in columns left as "ignore". */
export async function suggestMapping(
  headers: string[],
  sample: Record<string, string>[],
  knownOptions: string[],
  useAi: boolean,
  batchId?: string,
): Promise<{ mapping: ColumnMapping; aiUsed: boolean }> {
  const mapping = suggestMappingDeterministic(headers, knownOptions);
  const open = headers.filter((h) => mapping[h] === "ignore");
  if (!useAi || !open.length) return { mapping, aiUsed: false };

  try {
    const prompt = mapColumnsPrompt(headers, sample, [...TARGET_FIELDS]);
    const { value } = await runBulkAiTask({
      task: "MAP_SPREADSHEET_COLUMNS",
      schema: columnMappingSchema,
      system: prompt.system,
      user: prompt.user,
      batchId,
      cacheKey: JSON.stringify(headers),
    });
    const taken = new Set(Object.values(mapping));
    for (const m of value.mappings) {
      if (!open.includes(m.column) || m.confidence < 0.6) continue;
      const valid =
        m.field === "ignore" ||
        m.field.startsWith("option:") ||
        (TARGET_FIELDS as readonly string[]).includes(m.field);
      if (!valid || (!m.field.startsWith("option:") && taken.has(m.field))) continue;
      mapping[m.column] = m.field;
      taken.add(m.field);
    }
    return { mapping, aiUsed: true };
  } catch {
    return { mapping, aiUsed: false };
  }
}

/** Turns a raw row into { field: value } and { optionName: value }. */
export function applyMapping(headers: string[], row: string[], mapping: ColumnMapping) {
  const fields: Partial<Record<string, string>> = {};
  const options: Record<string, string> = {};
  headers.forEach((header, i) => {
    const target = mapping[header];
    const value = row[i]?.trim();
    if (!target || target === "ignore" || !value) return;
    if (target.startsWith("option:")) options[target.slice(7).trim()] = value;
    else fields[target] = value;
  });
  return { fields, options };
}
