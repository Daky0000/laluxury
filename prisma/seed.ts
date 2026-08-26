import "dotenv/config";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import type { Prisma } from "../src/generated/prisma/client";

/**
 * Seeds a working store: staff account, catalog, shipping, discounts.
 *
 * This runs on every boot, so a catalog change reaches the shop by being
 * committed and pushed, the same as any other change. What makes that safe is
 * the revision check below.
 *
 * The catalog defined here is hashed, and the hash stored alongside it. On a
 * boot where the hash is unchanged — a restart, a redeploy of unrelated code,
 * a crash recovery — the catalog section is skipped entirely. That matters
 * because these writes are authoritative: they set titles, prices and
 * descriptions, and running them unconditionally would overwrite whatever the
 * owner had since edited in the console, every single deploy. Skipping when
 * nothing changed is what lets the console and this file coexist.
 *
 * Stock is the one figure never written twice; see the inventory upsert.
 *
 * Set RUN_SEED=1 to force a run even when the hash matches.
 *
 * Artwork comes from `public/catalog` (`npm run catalog:images`) and the
 * photography from `public/catalog/products` (`npm run catalog:photos`).
 */

/** Bump to force the catalog to re-apply without otherwise changing it. */
const CATALOG_SCHEMA_VERSION = 2;

const REVISION_KEY = "catalog.revision";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });

const cedis = (amount: number) => Math.round(amount * 100);

function searchText(p: { title: string; tags: string[]; material?: string; short?: string }) {
  return [p.title, ...p.tags, p.material ?? "", p.short ?? ""].join(" ").toLowerCase();
}

/**
 * Everything this store has ever listed that it does not actually sell.
 *
 * Two generations of it. The first eight came with the original demo. The rest
 * were stand-ins built from commissioned renders — plausible furnishings, but
 * nobody ever had one in stock, and every price on them was invented. They are
 * retired here in favour of the range that was actually photographed.
 *
 * Archived rather than deleted, deliberately. `OrderItem` points at a product,
 * so deleting one would blank that line on an order somebody really placed;
 * archiving takes it off the storefront and out of search while leaving the
 * history readable. They stay visible in the admin, which is also where they
 * can be deleted for good if that is what you want.
 */
const RETIRED_PRODUCT_SLUGS = [
  // The original demo catalog.
  "adinkra-ceramic-table-lamp",
  "kente-stripe-throw",
  "sekondi-stoneware-dinner-set",
  "woven-raffia-pendant",
  "bolga-storage-basket",
  "teak-low-stool",
  "brass-candle-holders",
  "linen-cushion-cover",
  // Render-only stand-ins, never stocked.
  "rabbit-fur-duvet",
  "king-size-duvet",
  "king-bed-topper",
  "white-king-bedsheet",
  "heavy-blanket-double",
  "waterproof-bed-cover",
  "soft-sleep-pillow",
  "coffee-table",
  "round-stool",
  "shower-curtain",
  "student-bedsheet",
  "student-white-bedsheet",
  "student-blanket",
];

/** Rooms with nothing left in them. */
const RETIRED_CATEGORY_SLUGS = [
  "lighting",
  "textiles",
  "tableware",
  "decor",
  "furniture",
  "student",
];

/** Edits that only ever held stand-ins. */
const RETIRED_COLLECTION_SLUGS = ["bed-set", "student-essentials"];

const LEGACY_ANNOUNCEMENT = "Free delivery in Accra on orders over GH₵500";

/** The bundle banner sold a four-piece bed set built entirely from stand-ins. */
const LEGACY_BUNDLE_TITLE = "The Complete Bed Set";

/**
 * A fingerprint of this file, and the whole mechanism by which a catalog change
 * reaches the shop: edit this file, push, and the hash no longer matches what
 * the database recorded, so the catalog is applied on the next boot.
 *
 * The source is hashed rather than the data structures, so that a change
 * anywhere in here counts — rooms, edits, products, delivery rates — with no
 * list of things to remember to include, and no way to change the catalog
 * without changing the hash. The cost is that editing a comment also re-applies
 * it, which is harmless: the same values get written back.
 */
function catalogRevision(): string {
  return createHash("sha256")
    .update(`v${CATALOG_SCHEMA_VERSION}\n`)
    .update(readFileSync(fileURLToPath(import.meta.url), "utf8"))
    .digest("hex")
    .slice(0, 12);
}

async function main() {
  console.log("Seeding LaLuxury...");

  // --- Staff ---------------------------------------------------------------
  const ownerEmail = (process.env.SEED_OWNER_EMAIL || "owner@laluxury.com").toLowerCase();
  const ownerPassword = process.env.SEED_OWNER_PASSWORD || "ChangeMe!2026";

  const owner = await db.user.upsert({
    where: { email: ownerEmail },
    create: {
      email: ownerEmail,
      firstName: "Store",
      lastName: "Owner",
      role: "OWNER",
      passwordHash: await bcrypt.hash(ownerPassword, 12),
      emailVerified: new Date(),
    },
    update: { role: "OWNER" },
  });
  console.log(`  owner: ${owner.email}`);


  // --- Catalog -------------------------------------------------------------
  // Applied only when this file has actually changed; see the note at the top
  // for why running it unconditionally would fight the console.
  const revision = catalogRevision();
  const stored = await db.setting.findUnique({ where: { key: REVISION_KEY } });
  const applied = (stored?.value as { revision?: string } | null)?.revision;
  const forced = process.env.RUN_SEED === "1";

  if (!forced && applied === revision) {
    console.log(`  catalog: already at ${revision}, skipped`);
  } else {
    await seedCatalog();
    await db.setting.upsert({
      where: { key: REVISION_KEY },
      create: { key: REVISION_KEY, value: { revision, appliedAt: new Date().toISOString() } },
      update: { value: { revision, appliedAt: new Date().toISOString() } },
    });
    console.log(
      `  catalog: ${applied ?? "nothing"} -> ${revision}${forced ? " (forced by RUN_SEED)" : ""}`,
    );
  }

  // --- Discounts -----------------------------------------------------------
  await db.discount.upsert({
    where: { code: "WELCOME10" },
    create: {
      code: "WELCOME10",
      description: "10% off your first order",
      type: "PERCENTAGE",
      value: 10,
      firstOrderOnly: true,
      usageLimitPerUser: 1,
      isActive: true,
    },
    update: {},
  });

  await db.discount.upsert({
    where: { code: "FREESHIP" },
    create: {
      code: "FREESHIP",
      description: "Free delivery over GHS 300",
      type: "FREE_SHIPPING",
      value: 0,
      minSubtotal: cedis(300),
      isActive: true,
    },
    update: {},
  });
  console.log("  discounts: 2");

  // --- Customer tags -------------------------------------------------------
  for (const tag of [
    { name: "VIP", color: "#C9A227" },
    { name: "Wholesale", color: "#2C3E60" },
    { name: "Repeat", color: "#6B7355" },
  ]) {
    await db.customerTag.upsert({
      where: { name: tag.name },
      create: tag,
      update: {},
    });
  }

  // --- Settings ------------------------------------------------------------
  const storeDefaults = {
    storeName: "LaLuxury",
    tagline: "Considered textiles and furnishings for Ghanaian homes.",
    supportEmail: ownerEmail,
    announcementBar:
      "Complimentary delivery over ₵300 · Cash on delivery nationwide · New arrivals in stock",
    freeShippingThreshold: cedis(300),
    agentRequiresApproval: true,
  };

  const storeRow = await db.setting.findUnique({ where: { key: "store" } });

  if (!storeRow) {
    await db.setting.create({ data: { key: "store", value: storeDefaults } });
  } else {
    // Only wording the store never chose for itself is replaced; anything the
    // owner has edited since is left exactly as they left it.
    const value = (storeRow.value ?? {}) as Record<string, unknown>;
    const patch: Record<string, unknown> = {};

    if (value.announcementBar === LEGACY_ANNOUNCEMENT) {
      patch.announcementBar = storeDefaults.announcementBar;
      patch.freeShippingThreshold = cedis(300);
    }

    // The bundle banner offered a duvet, a bedsheet, two pillows and a topper
    // for one price. Three of those four are stand-ins being retired here, so
    // the banner would be advertising something nobody can buy. Clearing the
    // title is what hides the section — the home page renders it only when a
    // title is set — and leaves the rest of the fields for whoever writes the
    // next real bundle.
    //
    // The stored row only holds keys somebody has actually saved, so a store
    // that never opened the settings screen has no `bundleTitle` at all and is
    // still showing the old copy from the code defaults. Absent therefore has
    // to count as unchanged, or exactly the stores that never touched it would
    // be the ones that keep advertising the retired bundle.
    if (value.bundleTitle === undefined || value.bundleTitle === LEGACY_BUNDLE_TITLE) {
      patch.bundleTitle = "";
      patch.bundleEyebrow = "";
      patch.bundleBody = "";
      patch.bundlePrice = null;
      patch.bundleCompareAtPrice = null;
      patch.bundleHref = "";
    }

    if (Object.keys(patch).length > 0) {
      await db.setting.update({
        where: { key: "store" },
        // Prisma types a Json column against its own input union, which an
        // open Record does not satisfy; the contents are plain JSON either way.
        data: { value: { ...value, ...patch } as Prisma.InputJsonValue },
      });
      console.log(`  settings: refreshed ${Object.keys(patch).join(", ")}`);
    }
  }

  console.log("Done.");
}


/**
 * Everything the catalog is made of: rooms, edits, products, and the delivery
 * rates that go with them. Authoritative — it overwrites what it describes —
 * which is why `main` runs it only when `catalogRevision()` has moved.
 */
async function seedCatalog() {
  // --- Categories ----------------------------------------------------------
  const categorySeed = [
    {
      name: "Bedding",
      slug: "bedding",
      position: 1,
      description: "Duvets, sheets, toppers and pillows for a bed you sink into.",
      imageUrl: "/catalog/room-bedroom.webp",
    },
    {
      name: "Living",
      slug: "living",
      position: 2,
      description: "Carpets, stools, tables and the small things that finish a room.",
      imageUrl: "/catalog/room-living.webp",
    },
    {
      name: "Windows",
      slug: "windows",
      position: 3,
      description: "Curtains, blinds and rods, measured for Ghanaian windows.",
      imageUrl: "/catalog/room-windows.webp",
    },
  ];

  const categories = new Map<string, string>();
  for (const c of categorySeed) {
    const row = await db.category.upsert({
      where: { slug: c.slug },
      create: c,
      update: {
        name: c.name,
        position: c.position,
        description: c.description,
        imageUrl: c.imageUrl,
        isActive: true,
      },
    });
    categories.set(c.slug, row.id);
  }

  // --- Collections ---------------------------------------------------------
  const collectionSeed = [
    { name: "New In", slug: "new-in", isFeatured: true, position: 1 },
    { name: "Best Sellers", slug: "best-sellers", isFeatured: true, position: 2 },
  ];

  const collections = new Map<string, string>();
  for (const c of collectionSeed) {
    const row = await db.collection.upsert({
      where: { slug: c.slug },
      create: c,
      update: { name: c.name, position: c.position, isActive: true },
    });
    collections.set(c.slug, row.id);
  }

  // --- Products ------------------------------------------------------------
  type VariantSeed = { suffix: string; options: Record<string, string>; price: number; stock: number };
  type OptionSeed = { name: string; values: { value: string; hex?: string }[] };

  /**
   * A bare string is an ordinary gallery shot. The object form pins a photograph
   * to one option value, so picking that colour swaps the gallery to the piece
   * actually photographed in it.
   */
  type ImageSeed = string | { url: string; alt?: string; swatch?: [string, string] };

  type ProductSeed = {
    title: string;
    slug: string;
    /**
     * The slug this product used to sell under. The row is renamed rather than
     * replaced, so its orders, reviews and wishlist entries all follow it.
     */
    formerSlug?: string;
    short: string;
    description: string;
    /** First entry is the grid image. */
    images: ImageSeed[];
    categories: string[];
    collections: string[];
    tags: string[];
    material: string;
    care?: string;
    compareAt?: number;
    featured?: boolean;
    options?: OptionSeed[];
    variants: VariantSeed[];
  };

  /** Photographs of the real stock, produced by `npm run catalog:photos`. */
  const photo = (name: string) => `/catalog/products/${name}.webp`;

  /**
   * Every size × colour pairing. Blinds are cut to a height and chosen in a
   * colour independently, and the cart needs one variant per combination, so
   * writing thirty of them out by hand would only invite a typo.
   */
  const sizeByColour = (
    sizes: { value: string; suffix: string; price: number }[],
    colours: { value: string; suffix: string }[],
    stock: number,
  ): VariantSeed[] =>
    sizes.flatMap((size) =>
      colours.map((colour) => ({
        suffix: `${size.suffix}${colour.suffix}`,
        options: { Size: size.value, Colour: colour.value },
        price: size.price,
        stock,
      })),
    );

  /** Blinds are quoted per foot, so the ladder is derived rather than typed. */
  const BLIND_RATE_PER_FOOT = 60;

  const BLIND_SIZES = [3, 4, 5, 6, 7].map((feet) => ({
    value: `${feet}ft`,
    suffix: `${feet}F`,
    price: feet * BLIND_RATE_PER_FOOT,
  }));

  const BLIND_COLOURS = [
    { value: "Sea Blue", suffix: "SB", hex: "#2E5F7A" },
    { value: "Black", suffix: "BK", hex: "#1C1C1C" },
    { value: "Black and White", suffix: "BW", hex: "#6E6E6E" },
    { value: "Wine", suffix: "WN", hex: "#6E1B2E" },
    { value: "Brown", suffix: "BR", hex: "#6B4A2F" },
    { value: "Ash", suffix: "AS", hex: "#9A9A96" },
  ];

  const products: ProductSeed[] = [
    // --- Bedding -----------------------------------------------------------
    {
      title: "Bedsheet Set",
      slug: "bedsheet-set",
      formerSlug: "cotton-bedsheet-set",
      short: "Fitted sheet, flat sheet and pillowcases.",
      description:
        "A four-piece set: fitted sheet, flat sheet and two pillowcases, with deep pockets that stay put through the night. The prints turn over with each delivery — the gallery is what is on the shelf now. Tell us which one you want in the order notes or on WhatsApp and we set it aside.",
      images: [
        { url: photo("bedsheet-01"), alt: "Red and tan roses on white" },
        { url: photo("bedsheet-02"), alt: "Green palm leaves over a black and white geometric ground" },
        { url: photo("bedsheet-03"), alt: "White magnolia on soft teal" },
        { url: photo("bedsheet-04"), alt: "Butterflies and blossom in cream and green" },
        { url: photo("bedsheet-05"), alt: "Butterflies and blossom, second view" },
        { url: photo("bedsheet-06"), alt: "Coral gerbera on white" },
        { url: photo("bedsheet-07"), alt: "Pale butterflies on deep green" },
        { url: photo("bedsheet-08"), alt: "Navy check with red and white lines" },
        { url: photo("bedsheet-09"), alt: "Gold ribbon lines on navy" },
        { url: photo("bedsheet-10"), alt: "Taupe and cream blocks" },
        { url: photo("bedsheet-11"), alt: "Sand check with small hearts" },
        { url: photo("bedsheet-12"), alt: "Outlined hearts on beige" },
        { url: photo("bedsheet-13"), alt: "Caramel abstract floral" },
        { url: photo("bedsheet-14"), alt: "Gold leaves on charcoal" },
        { url: photo("bedsheet-15"), alt: "Cocoa spots on a cream stripe" },
        { url: photo("bedsheet-16"), alt: "Cream and burgundy circles" },
        { url: photo("bedsheet-17"), alt: "Black and white diamond motif" },
        { url: photo("bedsheet-18"), alt: "Red hearts and butterflies on caramel" },
        { url: photo("bedsheet-19"), alt: "White hearts on red" },
        { url: photo("bedsheet-20"), alt: "Red lettering on black" },
        { url: photo("bedsheet-21"), alt: "Roses and gold on white" },
        { url: photo("bedsheet-22"), alt: "Red and white damask border" },
        { url: photo("bedsheet-23"), alt: "Red, black and grey waves" },
        { url: photo("bedsheet-24"), alt: "Grey and black geometric" },
        { url: photo("bedsheet-25"), alt: "Grey and black geometric, second view" },
        { url: photo("bedsheet-26"), alt: "Charcoal brick geometric" },
        { url: photo("bedsheet-27"), alt: "Monochrome block print" },
        { url: photo("bedsheet-28"), alt: "Grey and white spots" },
        { url: photo("bedsheet-29"), alt: "Grey rings on pale grey" },
        { url: photo("bedsheet-30"), alt: "Zebra print in black and white" },
        { url: photo("bedsheet-31"), alt: "Red lips on black" },
      ],
      categories: ["bedding"],
      collections: ["best-sellers"],
      tags: ["bestseller", "bedsheet"],
      material: "Cotton blend",
      care: "Cold machine wash, warm iron.",
      featured: true,
      options: [
        {
          name: "Size",
          values: [{ value: "Single" }, { value: "Double" }, { value: "King" }],
        },
      ],
      variants: [
        { suffix: "SGL", options: { Size: "Single" }, price: 80, stock: 40 },
        { suffix: "DBL", options: { Size: "Double" }, price: 110, stock: 32 },
        { suffix: "KNG", options: { Size: "King" }, price: 150, stock: 21 },
      ],
    },

    // --- Living ------------------------------------------------------------
    {
      title: "3D Carpet 150 × 220",
      slug: "3d-carpet",
      formerSlug: "fluffy-carpet-150-220",
      short: "150 × 220cm, printed depth, anti-slip backing.",
      description:
        "A 150 × 220cm carpet with a high-definition print that reads as depth from standing height — marble panels, gold seams and stone shading — over a dense low pile and a woven anti-slip backing. Designs change with each container. The gallery shows what is in stock now; tell us which one when you order and we set it aside.",
      images: [
        { url: photo("3d-carpet-1"), alt: "Grey, blue and gold panels in a living room" },
        { url: photo("3d-carpet-2"), alt: "Navy and gold facets in a living room" },
        { url: photo("3d-carpet-3"), alt: "Grey, clay and gold panels in a living room" },
        { url: photo("3d-carpet-4"), alt: "Black, white and grey waves in a living room" },
        { url: photo("3d-carpet-5"), alt: "Graphite and gold panels in a living room" },
        { url: photo("3d-carpet-6"), alt: "Black marble and gold seams, in stock" },
        { url: photo("3d-carpet-7"), alt: "Ivory with charcoal and amber brushwork, in stock" },
      ],
      categories: ["living"],
      collections: ["best-sellers"],
      tags: ["bestseller", "carpet", "rug", "3d"],
      material: "Printed polyester pile, anti-slip backing",
      care: "Vacuum on the lowest setting. Spot clean with a damp cloth.",
      featured: true,
      variants: [{ suffix: "STD", options: {}, price: 250, stock: 11 }],
    },
    {
      title: "Fury Heavy Throw Pillow",
      slug: "fury-heavy-throw-pillow",
      formerSlug: "throw-pillow",
      short: "Long-pile faux fur, filled and heavy in the hand.",
      description:
        "A long-pile faux-fur throw pillow, filled rather than sold as a bare cover, with enough weight that it sits into a sofa instead of perching on it. Six colours, all in the same deep pile.",
      images: [
        {
          url: photo("fury-throw-pillow-1"),
          alt: "Fury throw pillows stacked in dark ash and baby pink",
        },
      ],
      categories: ["living"],
      collections: ["best-sellers"],
      tags: ["bestseller", "pillow", "cushion", "fur"],
      material: "Long-pile faux fur, hollow-fibre fill",
      care: "Spot clean. Shake the pile back out after use.",
      options: [
        {
          name: "Colour",
          values: [
            { value: "Dark Ash", hex: "#6B6B6B" },
            { value: "Light Blue", hex: "#A8C6DC" },
            { value: "Cream", hex: "#EFE3CE" },
            { value: "Brown", hex: "#7A5638" },
            { value: "Light Green", hex: "#B7CDA6" },
            { value: "Baby Pink", hex: "#F2C4CE" },
          ],
        },
      ],
      variants: [
        { suffix: "ASH", options: { Colour: "Dark Ash" }, price: 70, stock: 18 },
        { suffix: "BLU", options: { Colour: "Light Blue" }, price: 70, stock: 14 },
        { suffix: "CRM", options: { Colour: "Cream" }, price: 70, stock: 16 },
        { suffix: "BRN", options: { Colour: "Brown" }, price: 70, stock: 12 },
        { suffix: "GRN", options: { Colour: "Light Green" }, price: 70, stock: 10 },
        { suffix: "PNK", options: { Colour: "Baby Pink" }, price: 70, stock: 15 },
      ],
    },
    {
      title: "Knotted Pillow",
      slug: "knotted-pillow",
      short: "Hand-tied knot cushion.",
      description:
        "A knot cushion, hand-tied from a stuffed velvet tube so it holds its shape on a bed or a reading chair. Sold ready-filled.",
      images: ["/catalog/throw-pillow.webp"],
      categories: ["living"],
      collections: ["new-in"],
      tags: ["new", "pillow", "cushion"],
      material: "Velvet, hollow-fibre fill",
      care: "Spot clean only.",
      variants: [{ suffix: "STD", options: {}, price: 70, stock: 20 }],
    },
    {
      title: "Doormat",
      slug: "doormat",
      short: "Plush pile face, non-slip back.",
      description:
        "A soft carved-pile doormat on a non-slip back that stays where you put it, even on a polished entry floor. Five colours, all in the same pebble carve.",
      images: [
        { url: photo("doormat-1"), alt: "Doormat in deep green", swatch: ["Colour", "Green"] },
      ],
      categories: ["living"],
      collections: [],
      tags: ["doormat", "entry"],
      material: "Carved polyester pile, non-slip backing",
      care: "Shake out and machine wash cold.",
      options: [
        {
          name: "Colour",
          values: [
            { value: "Gold", hex: "#C8A24A" },
            { value: "Brown", hex: "#6B4A2F" },
            { value: "Blue", hex: "#2F5C8A" },
            { value: "Green", hex: "#1E6B5C" },
            { value: "Purple", hex: "#6A4A8C" },
          ],
        },
      ],
      variants: [
        { suffix: "GLD", options: { Colour: "Gold" }, price: 60, stock: 12 },
        { suffix: "BRN", options: { Colour: "Brown" }, price: 60, stock: 14 },
        { suffix: "BLU", options: { Colour: "Blue" }, price: 60, stock: 10 },
        { suffix: "GRN", options: { Colour: "Green" }, price: 60, stock: 16 },
        { suffix: "PUR", options: { Colour: "Purple" }, price: 60, stock: 8 },
      ],
    },

    // --- Windows -----------------------------------------------------------
    {
      title: "Already Made Curtains",
      slug: "already-made-curtains",
      formerSlug: "window-curtain",
      short: "Ready-made eyelet panels, sold in pairs.",
      description:
        "Curtains made up and ready to hang: a heavy textured weave, hemmed, with pressed steel eyelets that run straight onto a rod. No measuring, no tailoring wait — the pair comes as photographed.",
      images: [
        { url: photo("already-made-curtain-1"), alt: "Brown eyelet curtain panel hanging" },
        { url: photo("already-made-curtain-2"), alt: "Close-up of the woven curtain fabric" },
      ],
      categories: ["windows"],
      collections: ["best-sellers"],
      tags: ["bestseller", "curtain"],
      material: "Textured polyester, steel eyelets",
      care: "Cold machine wash, warm iron on the reverse.",
      variants: [{ suffix: "STD", options: {}, price: 180, stock: 20 }],
    },
    {
      title: "Curtain Blinds",
      slug: "curtain-blinds",
      short: "Zebra blinds, cut 3ft to 7ft.",
      description:
        "Day-and-night zebra blinds: alternating sheer and solid bands that line up to close the window or offset to filter it, on a smooth roller with the bracket set in the box. Priced by the foot — pick the drop and the colour and we cut before delivery.",
      images: [
        { url: photo("curtain-blinds-1"), alt: "Zebra blind in black and white, half open" },
      ],
      categories: ["windows"],
      collections: ["new-in"],
      tags: ["new", "blinds"],
      material: "Light-filtering polyester, aluminium roller",
      care: "Dust with a dry cloth. Do not wet the bands.",
      options: [
        { name: "Size", values: BLIND_SIZES.map((s) => ({ value: s.value })) },
        {
          name: "Colour",
          values: BLIND_COLOURS.map((c) => ({ value: c.value, hex: c.hex })),
        },
      ],
      variants: sizeByColour(BLIND_SIZES, BLIND_COLOURS, 6),
    },
    {
      title: "Curtain Rod",
      slug: "curtain-rod",
      formerSlug: "curtain-pole",
      short: "Rod, brackets and fixings in the box.",
      description:
        "A steel curtain rod with the brackets, finials and wall fixings in the box. The 2 metre carries a single window or a two-in-one; the 3 metre is the one to order for a three-in-one run.",
      images: ["/catalog/curtain-pole.webp"],
      categories: ["windows"],
      collections: [],
      tags: ["rod", "hardware"],
      material: "Powder-coated steel",
      options: [
        {
          name: "Size",
          values: [{ value: "2m · single or 2-in-one" }, { value: "3m · 3-in-one" }],
        },
      ],
      variants: [
        { suffix: "2M", options: { Size: "2m · single or 2-in-one" }, price: 80, stock: 22 },
        { suffix: "3M", options: { Size: "3m · 3-in-one" }, price: 90, stock: 13 },
      ],
    },
  ];

  for (const p of products) {
    // A renamed product is moved, not replaced: the row keeps its id, and with
    // it every order line, review and wishlist entry that points at it. Only
    // when the new slug is still free — if both exist, someone has already
    // dealt with it and overwriting would be the destructive answer.
    if (p.formerSlug) {
      const [former, current] = await Promise.all([
        db.product.findUnique({ where: { slug: p.formerSlug }, select: { id: true } }),
        db.product.findUnique({ where: { slug: p.slug }, select: { id: true } }),
      ]);
      if (former && !current) {
        await db.product.update({ where: { id: former.id }, data: { slug: p.slug } });
        console.log(`  renamed ${p.formerSlug} -> ${p.slug}`);
      }
    }

    const skuStem = p.slug
      .split("-")
      .map((w) => w.slice(0, 2).toUpperCase())
      .join("")
      .slice(0, 8);

    const prices = p.variants.map((v) => cedis(v.price));

    // A renamed product is moved, not replaced. Upserting on the new slug alone
    // would leave the old row published beside it and strand the orders,
    // reviews and wishlist entries that still point at it. Skipped once the new
    // slug exists, so a second run is a no-op.
    if (p.formerSlug) {
      const [former, current] = await Promise.all([
        db.product.findUnique({ where: { slug: p.formerSlug }, select: { id: true } }),
        db.product.findUnique({ where: { slug: p.slug }, select: { id: true } }),
      ]);

      if (former && !current) {
        await db.product.update({ where: { id: former.id }, data: { slug: p.slug } });
        console.log(`  renamed: ${p.formerSlug} -> ${p.slug}`);
      }
    }

    const product = await db.product.upsert({
      where: { slug: p.slug },
      create: {
        title: p.title,
        slug: p.slug,
        shortDescription: p.short,
        description: p.description,
        status: "ACTIVE",
        publishedAt: new Date(),
        minPrice: Math.min(...prices),
        maxPrice: Math.max(...prices),
        compareAtPrice: p.compareAt ? cedis(p.compareAt) : null,
        material: p.material,
        care: p.care,
        tags: p.tags,
        isFeatured: Boolean(p.featured),
        searchText: searchText({ title: p.title, tags: p.tags, material: p.material, short: p.short }),
      },
      update: {
        title: p.title,
        shortDescription: p.short,
        description: p.description,
        status: "ACTIVE",
        minPrice: Math.min(...prices),
        maxPrice: Math.max(...prices),
        compareAtPrice: p.compareAt ? cedis(p.compareAt) : null,
        material: p.material,
        care: p.care,
        tags: p.tags,
        isFeatured: Boolean(p.featured),
        searchText: searchText({ title: p.title, tags: p.tags, material: p.material, short: p.short }),
      },
    });

    // Options first: a photograph can be pinned to one of their values, so the
    // values have to exist before the imagery is written.
    const optionSeeds = p.options ?? [];

    // Whatever the seed no longer describes is dropped, so a product that
    // changes how it is sold — blinds moved from two widths to a foot ladder —
    // does not keep the retired picker standing next to the new one. Deleting
    // an option cascades to its values and to the variant links that used them.
    await db.productOption.deleteMany({
      where: {
        productId: product.id,
        ...(optionSeeds.length ? { name: { notIn: optionSeeds.map((o) => o.name) } } : {}),
      },
    });

    // Keyed "Option:Value", so two options on one product can share a value
    // name without one shadowing the other.
    const valueIds = new Map<string, string>();

    for (const [i, optionSeed] of optionSeeds.entries()) {
      const option = await db.productOption.upsert({
        where: { productId_name: { productId: product.id, name: optionSeed.name } },
        create: { productId: product.id, name: optionSeed.name, position: i },
        update: { position: i },
      });

      await db.productOptionValue.deleteMany({
        where: { optionId: option.id, value: { notIn: optionSeed.values.map((v) => v.value) } },
      });

      for (const [j, v] of optionSeed.values.entries()) {
        const row = await db.productOptionValue.upsert({
          where: { optionId_value: { optionId: option.id, value: v.value } },
          create: { optionId: option.id, value: v.value, hexColor: v.hex ?? null, position: j },
          update: { hexColor: v.hex ?? null, position: j },
        });
        valueIds.set(`${optionSeed.name}:${v.value}`, row.id);
      }
    }

    // Imagery. The url is the natural key, so re-running reorders and retitles
    // rather than stacking duplicates.
    const imageSeeds = p.images.map((image, i) => {
      const seed = typeof image === "string" ? { url: image } : image;
      return {
        url: seed.url,
        alt: ("alt" in seed && seed.alt) || p.title,
        optionValueId:
          "swatch" in seed && seed.swatch ? (valueIds.get(seed.swatch.join(":")) ?? null) : null,
        position: i,
      };
    });

    // Only artwork the seed owns is cleared. Photographs uploaded through the
    // console are served from the CDN, so a re-seed never destroys one.
    await db.productImage.deleteMany({
      where: {
        productId: product.id,
        url: { startsWith: "/catalog/", notIn: imageSeeds.map((image) => image.url) },
      },
    });

    for (const image of imageSeeds) {
      const existing = await db.productImage.findFirst({
        where: { productId: product.id, url: image.url },
        select: { id: true },
      });
      if (existing) {
        await db.productImage.update({ where: { id: existing.id }, data: image });
      } else {
        await db.productImage.create({ data: { ...image, productId: product.id } });
      }
    }

    // Category + collections
    for (const slug of p.categories) {
      await db.productCategory.upsert({
        where: {
          productId_categoryId: { productId: product.id, categoryId: categories.get(slug)! },
        },
        create: { productId: product.id, categoryId: categories.get(slug)! },
        update: {},
      });
    }

    for (const slug of p.collections) {
      await db.productCollection.upsert({
        where: {
          productId_collectionId: {
            productId: product.id,
            collectionId: collections.get(slug)!,
          },
        },
        create: { productId: product.id, collectionId: collections.get(slug)! },
        update: {},
      });
    }

    // Variants + inventory
    const skus = p.variants.map((v) => `${skuStem}-${v.suffix}`);

    for (const [i, v] of p.variants.entries()) {
      const sku = skus[i];
      const title = Object.values(v.options).join(" / ") || "Default";

      const variant = await db.variant.upsert({
        where: { sku },
        create: {
          productId: product.id,
          title,
          sku,
          price: cedis(v.price),
          compareAtPrice: p.compareAt ? cedis(p.compareAt) : null,
          costPrice: Math.round(cedis(v.price) * 0.45),
          weightGrams: 1200,
          position: i,
        },
        update: { price: cedis(v.price), title, position: i, isActive: true },
      });

      for (const [optionName, value] of Object.entries(v.options)) {
        const optionValueId = valueIds.get(`${optionName}:${value}`);
        if (!optionValueId) continue;
        await db.variantOptionValue.upsert({
          where: { variantId_optionValueId: { variantId: variant.id, optionValueId } },
          create: { variantId: variant.id, optionValueId },
          update: {},
        });
      }

      // `onHand` is set once, when the variant first appears, and never again.
      // The number in this file is an opening figure; the real one lives in the
      // console and moves with every sale and restock. Writing it back on each
      // run would silently undo a stock take.
      await db.inventoryItem.upsert({
        where: { variantId: variant.id },
        create: { variantId: variant.id, onHand: v.stock, reorderPoint: 5, reorderQuantity: 20 },
        update: {},
      });
    }

    // A variant is never deleted — an order line points straight at one, and
    // that line has to keep reading correctly years later. One the catalog has
    // dropped is retired instead, which takes it off the storefront and out of
    // the picker while leaving the history intact.
    await db.variant.updateMany({
      where: { productId: product.id, sku: { notIn: skus }, isActive: true },
      data: { isActive: false },
    });
  }
  console.log(`  products: ${products.length}`);

  // --- Retire what the store does not sell ---------------------------------
  const archived = await db.product.updateMany({
    where: { slug: { in: RETIRED_PRODUCT_SLUGS }, status: { not: "ARCHIVED" } },
    data: { status: "ARCHIVED" },
  });
  const hiddenCategories = await db.category.updateMany({
    where: { slug: { in: RETIRED_CATEGORY_SLUGS }, isActive: true },
    data: { isActive: false },
  });
  const hiddenCollections = await db.collection.updateMany({
    where: { slug: { in: RETIRED_COLLECTION_SLUGS }, isActive: true },
    data: { isActive: false, isFeatured: false },
  });

  // Their variants go too. A product can be archived and still have live
  // variants hanging off it, which the admin inventory screen reads straight
  // from — leaving them active would keep counting stock nobody stocks.
  const retiredVariants = await db.variant.updateMany({
    where: { product: { slug: { in: RETIRED_PRODUCT_SLUGS } }, isActive: true },
    data: { isActive: false },
  });

  if (archived.count || hiddenCategories.count || hiddenCollections.count) {
    console.log(
      `  retired: ${archived.count} products, ${retiredVariants.count} variants, ` +
        `${hiddenCategories.count} categories, ${hiddenCollections.count} collections`,
    );
  }

  // --- Shipping ------------------------------------------------------------
  const accra = await db.shippingZone.findFirst({ where: { name: "Greater Accra" } });
  const accraZone =
    accra ??
    (await db.shippingZone.create({
      data: { name: "Greater Accra", regions: ["Greater Accra"] },
    }));

  const national = await db.shippingZone.findFirst({ where: { name: "Rest of Ghana" } });
  const nationalZone =
    national ?? (await db.shippingZone.create({ data: { name: "Rest of Ghana", regions: [] } }));

  const rateSeed = [
    {
      zoneId: accraZone.id,
      name: "Accra same-day",
      price: cedis(45),
      estimatedDaysMin: 0,
      estimatedDaysMax: 1,
      freeAboveSubtotal: cedis(300),
      position: 0,
    },
    {
      zoneId: accraZone.id,
      name: "Accra standard",
      price: cedis(25),
      estimatedDaysMin: 1,
      estimatedDaysMax: 2,
      freeAboveSubtotal: cedis(300),
      position: 1,
    },
    {
      zoneId: nationalZone.id,
      name: "Nationwide courier",
      price: cedis(70),
      estimatedDaysMin: 3,
      estimatedDaysMax: 5,
      freeAboveSubtotal: cedis(800),
      position: 0,
    },
  ];

  for (const r of rateSeed) {
    const existing = await db.shippingRate.findFirst({
      where: { zoneId: r.zoneId, name: r.name },
    });
    if (existing) {
      await db.shippingRate.update({ where: { id: existing.id }, data: r });
    } else {
      await db.shippingRate.create({ data: r });
    }
  }
  console.log(`  shipping rates: ${rateSeed.length}`);
}
main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
