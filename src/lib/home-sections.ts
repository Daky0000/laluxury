/**
 * The home page as a list of sections the owner controls.
 *
 * The storefront home page used to be a fixed run of hard-coded blocks. It now
 * renders whatever this list says, in this order, so the owner can add a second
 * room grid, hide the bundle for a season, or point a product row at a
 * different set of pieces — all from /admin/settings/home, with no deploy.
 *
 * Copy that already had a home in store settings (the hero, the bundle banner,
 * the newsletter) is still edited there; those sections carry only their place
 * in the order and whether they show. Everything else a section needs lives on
 * the section itself.
 */

export type HomeSectionType = "hero" | "perks" | "rooms" | "products" | "bundle" | "newsletter";

/** Where a product section gets its pieces. */
export type ProductSource =
  /** Whatever is on sale, newest curated first. */
  | "auto"
  /** Everything in the chosen categories. */
  | "category"
  /** Exactly these products, in this order. */
  | "picked";

export type HomeSection = {
  id: string;
  type: HomeSectionType;
  /** Off keeps the section on the list but leaves it out of the page. */
  visible: boolean;
  eyebrow: string;
  title: string;
  /**
   * Rooms: the cards, in the order they appear — an empty list means every
   * active room. Products: the categories to draw from, and the tabs above a
   * tabbed grid.
   */
  categorySlugs: string[];
  /** Products, hand-picked, in the order they appear. Used when source is "picked". */
  productIds: string[];
  source: ProductSource;
  /** How many to show when the pieces are not hand-picked. */
  limit: number;
  /** Where the section's "shop all" link goes. Blank hides the link. */
  href: string;
  /** Products: a grid with room tabs above it, or one plain row. */
  layout: "tabs" | "row";
  /** Products: the page's own paper, or the tinted sage panel. */
  tone: "paper" | "sage";
};

/**
 * What each kind of section is, and which of the fields above it actually
 * reads — the admin editor shows only those, so a hero never asks for a
 * product limit.
 */
export const SECTION_KINDS: Record<
  HomeSectionType,
  {
    label: string;
    description: string;
    /** Only one of these may sit on the page. */
    unique: boolean;
    /** Copy comes from store settings, not from the section. */
    copyFromSettings: boolean;
    fields: {
      heading: boolean;
      categories: boolean;
      products: boolean;
      layout: boolean;
    };
  }
> = {
  hero: {
    label: "Hero",
    description: "The full-height opening image, headline and buttons.",
    unique: true,
    copyFromSettings: true,
    fields: { heading: false, categories: false, products: false, layout: false },
  },
  perks: {
    label: "Promise strip",
    description: "The four delivery, payment and quality notes under the hero.",
    unique: true,
    copyFromSettings: true,
    fields: { heading: false, categories: false, products: false, layout: false },
  },
  rooms: {
    label: "Category cards",
    description: "A row of picture cards, one per room, each linking into the shop.",
    unique: false,
    copyFromSettings: false,
    fields: { heading: true, categories: true, products: false, layout: false },
  },
  products: {
    label: "Product row",
    description: "A grid or row of products, chosen automatically, by room, or one by one.",
    unique: false,
    copyFromSettings: false,
    fields: { heading: true, categories: true, products: true, layout: true },
  },
  bundle: {
    label: "Bundle banner",
    description: "The wide offer banner. Its copy and price live in store settings.",
    unique: true,
    copyFromSettings: true,
    fields: { heading: false, categories: false, products: false, layout: false },
  },
  newsletter: {
    label: "Newsletter",
    description: "The email sign-up at the foot of the page.",
    unique: true,
    copyFromSettings: true,
    fields: { heading: false, categories: false, products: false, layout: false },
  },
};

export const SECTION_TYPES = Object.keys(SECTION_KINDS) as HomeSectionType[];

/** A blank section of the given kind, ready to be filled in. */
export function newSection(type: HomeSectionType, id: string): HomeSection {
  return {
    id,
    type,
    visible: true,
    eyebrow: "",
    title: SECTION_KINDS[type].label,
    categorySlugs: [],
    productIds: [],
    source: "auto",
    limit: type === "rooms" ? 4 : 8,
    href: "",
    layout: "row",
    tone: "paper",
  };
}

/**
 * The page as it shipped. A store that has never opened the section editor
 * renders exactly this, so switching the home page over to sections changed
 * nothing anybody could see.
 */
export const DEFAULT_HOME_SECTIONS: HomeSection[] = [
  { ...newSection("hero", "hero"), title: "Hero" },
  { ...newSection("perks", "perks"), title: "Promise strip" },
  {
    ...newSection("rooms", "rooms"),
    eyebrow: "Curated spaces",
    title: "Shop by room",
    limit: 4,
  },
  {
    ...newSection("products", "edit"),
    eyebrow: "Most desired",
    title: "The edit",
    source: "auto",
    limit: 20,
    layout: "tabs",
  },
  { ...newSection("bundle", "bundle"), title: "Bundle banner" },
  {
    ...newSection("products", "students"),
    eyebrow: "Back to campus",
    title: "Student essentials from ₵50",
    source: "category",
    categorySlugs: ["student"],
    limit: 4,
    href: "/shop?category=student",
    layout: "row",
    tone: "sage",
  },
  { ...newSection("newsletter", "newsletter"), title: "Newsletter" },
];

const SOURCES: ProductSource[] = ["auto", "category", "picked"];

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function slugList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

/**
 * Settings arrive as loose JSON, so every read runs through here: unknown
 * section types are dropped, missing fields take the blank-section value, and
 * a list that ends up empty falls back to the shipped page rather than
 * rendering nothing at all.
 */
export function normaliseSections(raw: unknown): HomeSection[] {
  if (!Array.isArray(raw)) return DEFAULT_HOME_SECTIONS;

  const seen = new Set<string>();
  const sections: HomeSection[] = [];

  for (const [index, item] of raw.entries()) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;

    const type = row.type as HomeSectionType;
    if (!SECTION_KINDS[type]) continue;
    if (SECTION_KINDS[type].unique && sections.some((section) => section.type === type)) continue;

    // Ids address a section in the admin editor, so two sections must never
    // share one. A duplicate or missing id is replaced by its position.
    let id = str(row.id).trim() || `${type}-${index}`;
    if (seen.has(id)) id = `${type}-${index}`;
    seen.add(id);

    const blank = newSection(type, id);
    const source = SOURCES.includes(row.source as ProductSource)
      ? (row.source as ProductSource)
      : blank.source;

    sections.push({
      id,
      type,
      visible: row.visible !== false,
      eyebrow: str(row.eyebrow),
      title: str(row.title, blank.title),
      categorySlugs: slugList(row.categorySlugs),
      productIds: slugList(row.productIds),
      source,
      limit: Math.min(48, Math.max(1, Number(row.limit) || blank.limit)),
      href: str(row.href),
      layout: row.layout === "tabs" ? "tabs" : "row",
      tone: row.tone === "sage" ? "sage" : "paper",
    });
  }

  return sections.length > 0 ? sections : DEFAULT_HOME_SECTIONS;
}
