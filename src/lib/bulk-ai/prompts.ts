/**
 * Prompts for Bulk Product AI. Each one states the hard rule: the model may
 * describe what it can see or read, never invent commercial facts.
 */

export const NO_INVENTION_RULE = `Never invent commercial facts. Do not state or guess: price, stock, exact dimensions, size, material, weight, thread count, brand, barcode, supplier SKU, care instructions, origin or warranty. Describe only what is visible or given. If unsure, leave the field empty or null.`;

const JSON_ONLY = "Reply with a single JSON object that matches the requested shape, and nothing else.";

export function shapeHint(schema: Record<string, unknown>): string {
  return `JSON shape (JSON Schema):\n${JSON.stringify(schema)}`;
}

export function parseInstructionPrompt(text: string, knownRecipes: string[], knownOptions: string[]) {
  return {
    system: `You turn a shop owner's note about a batch of new home-decor products into structured setup. ${JSON_ONLY}
Rules:
- Extract only what the note says. Do not add values that are not in the note.
- price is in Ghana cedis (GHS) as a plain number, or null. stock is a whole number, or null.
- imageRole: SEPARATE_PRODUCTS when each photo is a different product/design, SAME_PRODUCT when several photos show one product, OPTION when photos show different colours/patterns of one product; null if not said.
- recipeName: pick from the known recipes only when the note clearly matches one, else null.
Known recipes: ${knownRecipes.join(", ") || "none"}
Known option names: ${knownOptions.join(", ") || "Size, Colour"}`,
    user: text,
  };
}

export function mapColumnsPrompt(headers: string[], sample: Record<string, string>[], fields: string[]) {
  return {
    system: `You map spreadsheet columns to catalog fields. ${JSON_ONLY}
Allowed fields: ${fields.join(", ")}, or "option:<Option Name>" for a column that holds a customer choice such as size or colour, or "ignore".
Only map a column when its header or sample values make the meaning clear. confidence is 0..1.`,
    user: `Headers: ${JSON.stringify(headers)}\nSample rows: ${JSON.stringify(sample.slice(0, 5))}`,
  };
}

export function normalizeValuesPrompt(field: string, unknown: string[], canonical: string[]) {
  return {
    system: `You map supplier spellings to a shop's canonical option values. ${JSON_ONLY}
Only suggest a mapping when the value is clearly the same thing (abbreviation, spelling, synonym). Never map to a value outside the canonical list.`,
    user: `Option: ${field}\nCanonical values: ${JSON.stringify(canonical)}\nSupplier values: ${JSON.stringify(unknown)}`,
  };
}

export function productCopyPrompt(facts: Record<string, unknown>) {
  return {
    system: `You write product listings for Noble Enclave, a Ghanaian home-decor and soft-furnishing store. Warm, concise, premium British English. ${JSON_ONLY}
${NO_INVENTION_RULE}
Use only the facts provided. Keep metaTitle ≤ 60 chars and metaDescription ≤ 155 chars.`,
    user: `Product facts: ${JSON.stringify(facts)}`,
  };
}

export function imageAnalysisPrompt(context: {
  recipe?: string | null;
  category?: string | null;
  knownFacts: Record<string, unknown>;
  option?: { name: string; values: string[] } | null;
  categories: string[];
}) {
  const optionLine = context.option
    ? `This photo represents one value of the option "${context.option.name}". Set matchedOptionValue to exactly one of: ${JSON.stringify(context.option.values)}, or null if none clearly matches.`
    : "Set matchedOptionValue to null.";
  return {
    system: `You look at a product photo for Noble Enclave, a Ghanaian home-decor store, and write the listing in one pass. ${JSON_ONLY}
${NO_INVENTION_RULE}
- title: short, descriptive, based on what is visible plus the known facts (e.g. "Grey Botanical Bedsheet Set").
- dominantColours: plain colour names visible in the product (not the background).
- suggestedCategorySlug: one of ${JSON.stringify(context.categories)} or null.
- visibleLogo: true if a third-party brand logo or watermark is visible.
- ${optionLine}
- confidence 0..1. Put anything uncertain in warnings.`,
    user: `Product family: ${context.recipe ?? "unknown"}. Category: ${context.category ?? "unknown"}. Known facts: ${JSON.stringify(context.knownFacts)}`,
  };
}

export function recipeSuggestionPrompt(recipes: string[], sample: Record<string, unknown>) {
  return {
    system: `Pick which product recipe best fits these products. ${JSON_ONLY} recipeName must be one of ${JSON.stringify(recipes)} or null.`,
    user: JSON.stringify(sample),
  };
}

export function groupingPrompt(rows: { key: string; text: string }[]) {
  return {
    system: `Some supplier rows are variants of the same product (same design in different sizes or colours). Group row keys that are the same product. ${JSON_ONLY} Only group when it is clear; leave others as their own group.`,
    user: JSON.stringify(rows),
  };
}
