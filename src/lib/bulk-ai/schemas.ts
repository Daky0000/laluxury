import { z } from "zod";

/**
 * Output contracts for every Bulk Product AI task. Nothing a model returns is
 * used until it passes one of these. Prices here are always in major units
 * (cedis) because that is how the owner writes them.
 */

const str = z.string().trim();
const nullableStr = str.nullable();

export const batchInstructionSchema = z.object({
  recipeName: nullableStr,
  imageRole: z.enum(["SEPARATE_PRODUCTS", "SAME_PRODUCT", "OPTION"]).nullable(),
  imageOption: nullableStr,
  options: z.array(z.object({ name: str.min(1), values: z.array(str.min(1)) })),
  price: z.number().nonnegative().nullable(),
  stock: z.number().int().nonnegative().nullable(),
  category: nullableStr,
  material: nullableStr,
  notes: z.array(str),
});
export type BatchInstruction = z.infer<typeof batchInstructionSchema>;

export const columnMappingSchema = z.object({
  mappings: z.array(
    z.object({ column: str, field: str, confidence: z.number().min(0).max(1) }),
  ),
});
export type ColumnMappingSuggestion = z.infer<typeof columnMappingSchema>;

export const normalizeValueSchema = z.object({
  suggestions: z.array(
    z.object({ field: str, from: str, to: str, confidence: z.number().min(0).max(1) }),
  ),
});

export const productCopySchema = z.object({
  title: str.min(2).max(120),
  shortDescription: str.max(300),
  description: str.max(2000),
  tags: z.array(str.max(40)).max(15),
  metaTitle: str.max(70),
  metaDescription: str.max(170),
  confidence: z.number().min(0).max(1),
});
export type ProductCopy = z.infer<typeof productCopySchema>;

export const imageAnalysisSchema = z.object({
  title: str.min(2).max(120),
  shortDescription: str.max(300),
  description: str.max(2000),
  dominantColours: z.array(str).max(6),
  pattern: nullableStr,
  style: nullableStr,
  tags: z.array(str.max(40)).max(15),
  altText: str.max(200),
  metaTitle: str.max(70),
  metaDescription: str.max(170),
  suggestedCategorySlug: nullableStr,
  /** When the photo stands for an option, the listed value it shows. */
  matchedOptionValue: nullableStr,
  visibleLogo: z.boolean(),
  confidence: z.number().min(0).max(1),
  warnings: z.array(str),
});
export type ImageAnalysis = z.infer<typeof imageAnalysisSchema>;

export const recipeSuggestionSchema = z.object({
  recipeName: nullableStr,
  confidence: z.number().min(0).max(1),
  reason: str,
});

export const groupingSchema = z.object({
  groups: z.array(z.object({ key: str, members: z.array(str) })),
});

export const optionMatchSchema = z.object({
  value: nullableStr,
  confidence: z.number().min(0).max(1),
});

/** JSON Schema for OpenRouter's response_format, generated from the Zod contract. */
export function toJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const out = z.toJSONSchema(schema, { target: "draft-7" }) as Record<string, unknown>;
  delete out.$schema;
  return out;
}
