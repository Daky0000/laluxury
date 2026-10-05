import { z } from "zod";

/**
 * The shapes Bulk Product Add works with.
 *
 * All money is integer minor units (pesewas), as everywhere else in the shop.
 * A "combination key" is the option values in option order joined by " / ",
 * e.g. "5ft / Black" — the same label Variant.title uses.
 */

export const COMBO_SEPARATOR = " / ";

export const optionSpecSchema = z.object({
  name: z.string().trim().min(1).max(60),
  values: z.array(z.string().trim().min(1).max(80)).max(200),
});
export type OptionSpec = z.infer<typeof optionSpecSchema>;

const money = z.number().int().nonnegative();
const qty = z.number().int().nonnegative();

export const pricingSpecSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("SAME"), price: money.nullable() }),
  z.object({ mode: z.literal("BY_OPTION"), option: z.string(), prices: z.record(z.string(), money) }),
  /** Base price plus an amount per value of each listed option. */
  z.object({
    mode: z.literal("BY_OPTIONS"),
    base: money,
    adjustments: z.record(z.string(), z.record(z.string(), z.number().int())),
  }),
  z.object({ mode: z.literal("BY_COMBINATION"), prices: z.record(z.string(), money) }),
  z.object({ mode: z.literal("SOURCE") }),
]);
export type PricingSpec = z.infer<typeof pricingSpecSchema>;

export const stockSpecSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("SAME"), quantity: qty }),
  z.object({ mode: z.literal("BY_OPTION"), option: z.string(), quantities: z.record(z.string(), qty) }),
  z.object({ mode: z.literal("BY_COMBINATION"), quantities: z.record(z.string(), qty) }),
  z.object({ mode: z.literal("SOURCE") }),
  z.object({ mode: z.literal("UNTRACKED") }),
]);
export type StockSpec = z.infer<typeof stockSpecSchema>;

export const imageRoleSchema = z.object({
  mode: z.enum(["SEPARATE_PRODUCTS", "SAME_PRODUCT", "OPTION"]),
  option: z.string().nullable().optional(),
});
export type ImageRole = z.infer<typeof imageRoleSchema>;

export const aiFieldsSchema = z.object({
  titles: z.boolean(),
  descriptions: z.boolean(),
  seo: z.boolean(),
  altText: z.boolean(),
  visual: z.boolean(),
  category: z.boolean(),
  optionDetection: z.boolean(),
});
export type AiFields = z.infer<typeof aiFieldsSchema>;

export const DEFAULT_AI_FIELDS: AiFields = {
  titles: true,
  descriptions: true,
  seo: true,
  altText: true,
  visual: true,
  category: false,
  optionDetection: false,
};

export const batchDefaultsSchema = z.object({
  categoryIds: z.array(z.string()).default([]),
  collectionIds: z.array(z.string()).default([]),
  material: z.string().nullable().optional(),
  care: z.string().nullable().optional(),
  brand: z.string().nullable().optional(),
  tags: z.array(z.string()).default([]),
  skuPrefix: z.string().nullable().optional(),
  titlePrefix: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
});
export type BatchDefaults = z.infer<typeof batchDefaultsSchema>;

/** Field authority on updates: who may overwrite what on an existing product. */
export const FIELD_AUTHORITY_DEFAULTS = {
  stock: "SOURCE",
  cost: "SOURCE",
  price: "OWNER",
  title: "OWNER",
  description: "OWNER",
  seo: "OWNER",
  images: "MERGE",
  featured: "OWNER",
} as const;
export type FieldAuthority = Record<keyof typeof FIELD_AUTHORITY_DEFAULTS, "SOURCE" | "OWNER" | "MERGE">;

export const batchSetupSchema = z.object({
  recipeId: z.string().nullable().optional(),
  recipeVersion: z.number().int().optional(),
  options: z.array(optionSpecSchema).max(10).default([]),
  disabledCombinations: z.array(z.string()).default([]),
  pricing: pricingSpecSchema.default({ mode: "SAME", price: null }),
  stock: stockSpecSchema.default({ mode: "SAME", quantity: 0 }),
  imageRole: imageRoleSchema.default({ mode: "SEPARATE_PRODUCTS" }),
  aiEnabled: z.boolean().default(true),
  aiFields: aiFieldsSchema.default(DEFAULT_AI_FIELDS),
  defaults: batchDefaultsSchema.default({ categoryIds: [], collectionIds: [], tags: [] }),
  instruction: z.string().max(2000).nullable().optional(),
  /** Allow supplier data to overwrite owner-controlled fields on updates. */
  fieldAuthority: z.record(z.string(), z.enum(["SOURCE", "OWNER", "MERGE"])).optional(),
  sourceId: z.string().nullable().optional(),
});
export type BatchSetup = z.infer<typeof batchSetupSchema>;

/** What a Product Recipe stores. Defaults, never restrictions. */
export const recipeConfigSchema = z.object({
  categoryIds: z.array(z.string()).default([]),
  options: z.array(optionSpecSchema).default([]),
  pricing: pricingSpecSchema.default({ mode: "SAME", price: null }),
  inventory: stockSpecSchema.default({ mode: "SAME", quantity: 0 }),
  imageRole: imageRoleSchema.default({ mode: "SEPARATE_PRODUCTS" }),
  material: z.string().nullable().optional(),
  care: z.string().nullable().optional(),
  tags: z.array(z.string()).default([]),
  skuPrefix: z.string().nullable().optional(),
});
export type RecipeConfig = z.infer<typeof recipeConfigSchema>;

// --- Spreadsheet mapping -----------------------------------------------------

export const TARGET_FIELDS = [
  "externalKey",
  "parentSku",
  "sku",
  "barcode",
  "title",
  "shortDescription",
  "description",
  "price",
  "compareAtPrice",
  "costPrice",
  "stock",
  "category",
  "collection",
  "brand",
  "material",
  "care",
  "tags",
  "imageFile",
  "imageUrl",
  "weightGrams",
] as const;
export type TargetField = (typeof TARGET_FIELDS)[number];

/** column header → target field, "option:<Name>", or "ignore". */
export type ColumnMapping = Record<string, string>;

// --- Item draft ---------------------------------------------------------------

export type Provenance = "OWNER" | "SOURCE" | "RECIPE" | "RULE" | "SYSTEM" | "AI";

export type Field<T> = {
  value: T;
  source: Provenance;
  model?: string;
  confidence?: number;
};

export type VariantDraft = {
  key: string;
  values: string[];
  enabled: boolean;
  sku: string | null;
  barcode: string | null;
  price: number | null;
  priceSource: Provenance | null;
  compareAtPrice: number | null;
  costPrice: number | null;
  stock: number | null;
  stockSource: Provenance | null;
  trackInventory: boolean;
  weightGrams: number | null;
};

export type ImageDraft = {
  importMediaId: string | null;
  mediaId: string | null;
  url: string;
  alt: string | null;
  option: string | null;
  optionValue: string | null;
};

export type ItemDraft = {
  title?: Field<string>;
  shortDescription?: Field<string>;
  description?: Field<string>;
  metaTitle?: Field<string>;
  metaDescription?: Field<string>;
  brand?: Field<string>;
  material?: Field<string>;
  care?: Field<string>;
  tags?: Field<string[]>;
  colours?: Field<string[]>;
  pattern?: Field<string>;
  categoryIds?: Field<string[]>;
  collectionIds?: Field<string[]>;
  parentSku?: Field<string>;
  options: OptionSpec[];
  variants: VariantDraft[];
  images: ImageDraft[];
};

export type Issue = { code: IssueCode; message: string; severity: "BLOCK" | "REVIEW" | "INFO" };

export const ISSUE_CODES = {
  MISSING_TITLE: "Missing title",
  MISSING_PRICE: "Missing price",
  MISSING_IMAGE: "Missing image",
  POSSIBLE_DUPLICATE: "Possible duplicate",
  AI_FAILED: "AI failed",
  UNKNOWN_OPTION_VALUE: "Unknown option value",
  NO_ACTIVE_VARIANTS: "No sellable versions",
  SKU_CONFLICT: "SKU already used",
  VISIBLE_LOGO: "Visible logo",
  LOW_AI_CONFIDENCE: "Low AI confidence",
  UPDATE_MATCH: "Matches existing product",
  INVALID_VALUE: "Invalid value",
} as const;
export type IssueCode = keyof typeof ISSUE_CODES;

/** Item-level owner edits: plain values, applied on top of everything. */
export type ItemOverrides = {
  title?: string;
  shortDescription?: string;
  description?: string;
  metaTitle?: string;
  metaDescription?: string;
  material?: string;
  care?: string;
  brand?: string;
  tags?: string[];
  addTags?: string[];
  categoryIds?: string[];
  collectionIds?: string[];
  price?: number;
  stock?: number;
  options?: OptionSpec[];
  pricing?: PricingSpec;
  stockSpec?: StockSpec;
  disabledCombinations?: string[];
  /** option name → replacement map for values, e.g. Colour: { Grey: "Ash" } */
  valueReplacements?: Record<string, Record<string, string>>;
  acceptDuplicate?: boolean;
  /** The owner has looked at the review issues and accepts the item. */
  reviewed?: boolean;
  skip?: boolean;
  forceCreate?: boolean;
};
