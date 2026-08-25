import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

/**
 * Seeds a working store: staff account, catalog, shipping, discounts.
 * Safe to re-run - everything is upserted by a natural key.
 *
 * The catalog mirrors the "Efie Home Storefront v2 Light" artboard: four
 * rooms, the bestseller edit and the student range. Artwork comes from
 * `public/catalog`, produced by `node scripts/fetch-catalog-images.mjs`.
 */

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });

const cedis = (amount: number) => Math.round(amount * 100);

function searchText(p: { title: string; tags: string[]; material?: string; short?: string }) {
  return [p.title, ...p.tags, p.material ?? "", p.short ?? ""].join(" ").toLowerCase();
}

/** The demo catalog this store shipped with, retired in favour of the real one. */
const LEGACY_PRODUCT_SLUGS = [
  "adinkra-ceramic-table-lamp",
  "kente-stripe-throw",
  "sekondi-stoneware-dinner-set",
  "woven-raffia-pendant",
  "bolga-storage-basket",
  "teak-low-stool",
  "brass-candle-holders",
  "linen-cushion-cover",
];

const LEGACY_CATEGORY_SLUGS = ["lighting", "textiles", "tableware", "decor", "furniture"];

const LEGACY_ANNOUNCEMENT = "Free delivery in Accra on orders over GH₵500";

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
      description: "Curtains, blinds and poles, measured for Ghanaian windows.",
      imageUrl: "/catalog/room-windows.webp",
    },
    {
      name: "Student",
      slug: "student",
      position: 4,
      description: "Hall-ready essentials from ₵50.",
      imageUrl: "/catalog/room-student.webp",
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
    { name: "The Complete Bed Set", slug: "bed-set", isFeatured: true, position: 3 },
    { name: "Student Essentials", slug: "student-essentials", isFeatured: false, position: 4 },
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
  type ProductSeed = {
    title: string;
    slug: string;
    short: string;
    description: string;
    /** First entry is the grid image. */
    images: string[];
    categories: string[];
    collections: string[];
    tags: string[];
    material: string;
    care?: string;
    compareAt?: number;
    featured?: boolean;
    options?: { name: string; values: { value: string; hex?: string }[] };
    variants: VariantSeed[];
  };

  const products: ProductSeed[] = [
    // --- Bedding -----------------------------------------------------------
    {
      title: "Rabbit Fur Duvet",
      slug: "rabbit-fur-duvet",
      short: "Deep-pile faux fur, quilted through.",
      description:
        "A dense faux-fur duvet quilted so the pile never shifts, backed in brushed microfibre. Warm without weight, and the piece most of our customers come back for.",
      images: ["/catalog/rabbit-fur-duvet.webp"],
      categories: ["bedding"],
      collections: ["best-sellers", "bed-set"],
      tags: ["bestseller", "duvet", "fur"],
      material: "Faux fur, brushed microfibre",
      care: "Cold machine wash, dry flat.",
      compareAt: 420,
      featured: true,
      options: { name: "Size", values: [{ value: "Double" }, { value: "King" }] },
      variants: [
        { suffix: "DBL", options: { Size: "Double" }, price: 350, stock: 12 },
        { suffix: "KNG", options: { Size: "King" }, price: 430, stock: 7 },
      ],
    },
    {
      title: "King Size Duvet",
      slug: "king-size-duvet",
      short: "Hotel-weight, four-season fill.",
      description:
        "A generous king duvet with a 300gsm hollow-fibre fill and a piped edge, so it drapes over the sides of the bed rather than perching on top.",
      images: ["/catalog/king-size-duvet.webp"],
      categories: ["bedding"],
      collections: ["bed-set"],
      tags: ["duvet", "king"],
      material: "Cotton-blend shell, hollow-fibre fill",
      variants: [{ suffix: "STD", options: {}, price: 280, stock: 15 }],
    },
    {
      title: "King Bed Topper",
      slug: "king-bed-topper",
      short: "Plush topper with elastic corner straps.",
      description:
        "Eight centimetres of quilted loft with elasticated corner straps, for tired mattresses and guest rooms you want people to remember.",
      images: ["/catalog/king-bed-topper.webp"],
      categories: ["bedding"],
      collections: ["bed-set", "new-in"],
      tags: ["luxe", "topper"],
      material: "Microfibre",
      variants: [{ suffix: "STD", options: {}, price: 450, stock: 6 }],
    },
    {
      title: "Cotton Bedsheet Set",
      slug: "cotton-bedsheet-set",
      short: "Fitted sheet, flat sheet and pillowcases.",
      description:
        "Breathable cotton percale in a four-piece set: fitted sheet, flat sheet and two pillowcases. Deep pockets that stay put through the night.",
      images: ["/catalog/cotton-bedsheet-set.webp"],
      categories: ["bedding"],
      collections: ["best-sellers", "bed-set"],
      tags: ["bestseller", "bedsheet", "cotton"],
      material: "100% cotton percale",
      options: {
        name: "Size",
        values: [{ value: "Single" }, { value: "Double" }, { value: "King" }],
      },
      variants: [
        { suffix: "SGL", options: { Size: "Single" }, price: 80, stock: 40 },
        { suffix: "DBL", options: { Size: "Double" }, price: 110, stock: 32 },
        { suffix: "KNG", options: { Size: "King" }, price: 150, stock: 21 },
      ],
    },
    {
      title: "White King Bedsheet",
      slug: "white-king-bedsheet",
      short: "Crisp white, hotel finish.",
      description:
        "The plain white king set we keep restocking: tight weave, square corners, and a finish that survives a hot wash every week.",
      images: ["/catalog/white-king-bedsheet.webp"],
      categories: ["bedding"],
      collections: ["bed-set"],
      tags: ["bedsheet", "white"],
      material: "Cotton blend",
      variants: [{ suffix: "STD", options: {}, price: 180, stock: 18 }],
    },
    {
      title: "Heavy Blanket · Double",
      slug: "heavy-blanket-double",
      short: "Weighted mink-touch blanket.",
      description:
        "A heavy mink-touch blanket with a satin trim. Warm enough for a harmattan night in Kumasi, soft enough to leave folded at the foot of the bed.",
      images: ["/catalog/heavy-blanket-double.webp"],
      categories: ["bedding"],
      collections: [],
      tags: ["blanket", "warm"],
      material: "Mink-touch polyester",
      variants: [{ suffix: "STD", options: {}, price: 160, stock: 24 }],
    },
    {
      title: "Waterproof Bed Cover",
      slug: "waterproof-bed-cover",
      short: "Quiet membrane, cotton face.",
      description:
        "A cotton-faced mattress protector with a breathable waterproof membrane. No crinkle, no plastic feel, and it keeps a new mattress new.",
      images: ["/catalog/waterproof-bed-cover.webp"],
      categories: ["bedding"],
      collections: ["new-in"],
      tags: ["new", "protector"],
      material: "Cotton, TPU membrane",
      variants: [{ suffix: "STD", options: {}, price: 250, stock: 14 }],
    },
    {
      title: "Soft Sleep Pillow",
      slug: "soft-sleep-pillow",
      short: "Medium loft, holds its shape.",
      description:
        "A medium-loft pillow with a siliconised fibre fill that recovers overnight instead of flattening by month three.",
      images: ["/catalog/soft-sleep-pillow.webp"],
      categories: ["bedding", "student"],
      collections: ["bed-set", "student-essentials"],
      tags: ["pillow"],
      material: "Siliconised hollow fibre",
      variants: [{ suffix: "STD", options: {}, price: 70, stock: 60 }],
    },

    // --- Living ------------------------------------------------------------
    {
      title: "Fluffy Carpet 150×220",
      slug: "fluffy-carpet-150-220",
      short: "Deep shag pile, anti-slip backing.",
      description:
        "A 150 × 220cm shag carpet with a woven anti-slip backing. Vacuum on the lowest setting and it stays as it arrived.",
      images: ["/catalog/fluffy-carpet.webp"],
      categories: ["living"],
      collections: ["best-sellers"],
      tags: ["bestseller", "carpet", "rug"],
      material: "Polyester shag",
      variants: [{ suffix: "STD", options: {}, price: 250, stock: 11 }],
    },
    {
      title: "Coffee Table",
      slug: "coffee-table",
      short: "Solid frame, warm timber top.",
      description:
        "A low table sized for a three-seater, with a warm timber top and a slim frame that keeps the floor visible underneath.",
      images: ["/catalog/coffee-table.webp"],
      categories: ["living"],
      collections: ["new-in"],
      tags: ["table", "furniture"],
      material: "Engineered timber, steel",
      variants: [{ suffix: "STD", options: {}, price: 350, stock: 5 }],
    },
    {
      title: "Round Stool",
      slug: "round-stool",
      short: "Upholstered, works as a side table.",
      description:
        "An upholstered round stool that doubles as a side table or an extra seat when the room fills up.",
      images: ["/catalog/round-stool.webp"],
      categories: ["living"],
      collections: [],
      tags: ["stool", "seating"],
      material: "Upholstered foam, timber legs",
      variants: [{ suffix: "STD", options: {}, price: 120, stock: 16 }],
    },
    {
      title: "Throw Pillow",
      slug: "throw-pillow",
      short: "45 × 45cm, cover and inner.",
      description:
        "A 45 × 45cm throw pillow supplied with its inner, in a textured weave that holds a corner rather than slumping.",
      images: ["/catalog/throw-pillow.webp"],
      categories: ["living"],
      collections: [],
      tags: ["pillow", "cushion"],
      material: "Textured polyester",
      variants: [{ suffix: "STD", options: {}, price: 80, stock: 45 }],
    },
    {
      title: "Doormat",
      slug: "doormat",
      short: "Coir face, rubber back.",
      description:
        "A dense coir doormat on a rubber back that stays where you put it, even on a polished entry floor.",
      images: ["/catalog/doormat.webp"],
      categories: ["living"],
      collections: [],
      tags: ["doormat", "entry"],
      material: "Coir, rubber",
      variants: [{ suffix: "STD", options: {}, price: 60, stock: 38 }],
    },

    // --- Windows -----------------------------------------------------------
    {
      title: "Window Curtain",
      slug: "window-curtain",
      short: "Lined panels, sold in pairs.",
      description:
        "A lined pair of curtain panels with a pencil-pleat header. Heavy enough to soften afternoon light without darkening the room.",
      images: ["/catalog/window-curtain.webp"],
      categories: ["windows"],
      collections: ["best-sellers"],
      tags: ["curtain"],
      material: "Lined polyester",
      variants: [{ suffix: "STD", options: {}, price: 180, stock: 20 }],
    },
    {
      title: "Curtain Blinds",
      slug: "curtain-blinds",
      short: "Roller blinds, cut to width.",
      description:
        "Roller blinds in a light-filtering weave, supplied with the bracket set. Tell us the width at checkout and we cut before delivery.",
      images: ["/catalog/curtain-blinds.webp"],
      categories: ["windows"],
      collections: [],
      tags: ["blinds"],
      material: "Light-filtering polyester",
      options: { name: "Width", values: [{ value: "90cm" }, { value: "150cm" }] },
      variants: [
        { suffix: "W90", options: { Width: "90cm" }, price: 120, stock: 14 },
        { suffix: "W150", options: { Width: "150cm" }, price: 180, stock: 9 },
      ],
    },
    {
      title: "Curtain Pole",
      slug: "curtain-pole",
      short: "Steel pole with finials and brackets.",
      description:
        "A 25mm steel pole with finials, brackets and fixings in the box. Two lengths, both matt black.",
      images: ["/catalog/curtain-pole.webp"],
      categories: ["windows"],
      collections: [],
      tags: ["pole", "hardware"],
      material: "Powder-coated steel",
      options: { name: "Length", values: [{ value: "1.5m" }, { value: "2.4m" }] },
      variants: [
        { suffix: "L15", options: { Length: "1.5m" }, price: 80, stock: 22 },
        { suffix: "L24", options: { Length: "2.4m" }, price: 120, stock: 13 },
      ],
    },
    {
      title: "Shower Curtain",
      slug: "shower-curtain",
      short: "Mould-resistant, rings included.",
      description:
        "A weighted-hem shower curtain in a mould-resistant fabric, with twelve rings in the pack.",
      images: ["/catalog/shower-curtain.webp"],
      categories: ["windows"],
      collections: [],
      tags: ["deal", "bathroom"],
      material: "Coated polyester",
      compareAt: 70,
      variants: [{ suffix: "STD", options: {}, price: 50, stock: 33 }],
    },

    // --- Student -----------------------------------------------------------
    {
      title: "Student Bedsheet",
      slug: "student-bedsheet",
      short: "Single set sized for a hall bed.",
      description:
        "A single bedsheet set cut for a standard hall mattress, in a cotton blend that survives the laundry queue.",
      images: ["/catalog/student-bedsheet.webp"],
      categories: ["student"],
      collections: ["student-essentials"],
      tags: ["student", "bedsheet"],
      material: "Cotton blend",
      variants: [{ suffix: "STD", options: {}, price: 50, stock: 70 }],
    },
    {
      title: "Student White Bedsheet",
      slug: "student-white-bedsheet",
      short: "Plain white single set.",
      description:
        "The plain white version of our student set, for halls that ask for white linen.",
      images: ["/catalog/student-white-bedsheet.webp"],
      categories: ["student"],
      collections: ["student-essentials"],
      tags: ["student", "bedsheet", "white"],
      material: "Cotton blend",
      variants: [{ suffix: "STD", options: {}, price: 50, stock: 54 }],
    },
    {
      title: "Student Blanket",
      slug: "student-blanket",
      short: "Light fleece, single size.",
      description:
        "A light single-size fleece blanket that packs down small enough for a trotro trip home at the end of term.",
      images: ["/catalog/student-blanket.webp"],
      categories: ["student"],
      collections: ["student-essentials"],
      tags: ["student", "blanket"],
      material: "Polar fleece",
      variants: [{ suffix: "STD", options: {}, price: 60, stock: 48 }],
    },
  ];

  for (const p of products) {
    const skuStem = p.slug
      .split("-")
      .map((w) => w.slice(0, 2).toUpperCase())
      .join("")
      .slice(0, 8);

    const prices = p.variants.map((v) => cedis(v.price));

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

    // Imagery. Position is the natural key so re-running swaps the artwork
    // rather than stacking duplicates.
    for (const [i, url] of p.images.entries()) {
      const existing = await db.productImage.findFirst({
        where: { productId: product.id, position: i },
      });
      if (existing) {
        await db.productImage.update({
          where: { id: existing.id },
          data: { url, alt: p.title },
        });
      } else {
        await db.productImage.create({
          data: { productId: product.id, url, alt: p.title, position: i },
        });
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

    // Options and their values
    const valueIds = new Map<string, string>();
    if (p.options) {
      const option = await db.productOption.upsert({
        where: { productId_name: { productId: product.id, name: p.options.name } },
        create: { productId: product.id, name: p.options.name, position: 0 },
        update: {},
      });

      for (const [i, v] of p.options.values.entries()) {
        const row = await db.productOptionValue.upsert({
          where: { optionId_value: { optionId: option.id, value: v.value } },
          create: { optionId: option.id, value: v.value, hexColor: v.hex ?? null, position: i },
          update: { hexColor: v.hex ?? null, position: i },
        });
        valueIds.set(v.value, row.id);
      }
    }

    // Variants + inventory
    for (const [i, v] of p.variants.entries()) {
      const sku = `${skuStem}-${v.suffix}`;
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
        update: { price: cedis(v.price), title, isActive: true },
      });

      for (const value of Object.values(v.options)) {
        const optionValueId = valueIds.get(value);
        if (!optionValueId) continue;
        await db.variantOptionValue.upsert({
          where: { variantId_optionValueId: { variantId: variant.id, optionValueId } },
          create: { variantId: variant.id, optionValueId },
          update: {},
        });
      }

      await db.inventoryItem.upsert({
        where: { variantId: variant.id },
        create: { variantId: variant.id, onHand: v.stock, reorderPoint: 5, reorderQuantity: 20 },
        update: { onHand: v.stock },
      });
    }
  }
  console.log(`  products: ${products.length}`);

  // --- Retire the demo catalog --------------------------------------------
  // Archived rather than deleted: it stays visible in the admin, and any order
  // that referenced it still reads correctly.
  const archived = await db.product.updateMany({
    where: { slug: { in: LEGACY_PRODUCT_SLUGS }, status: { not: "ARCHIVED" } },
    data: { status: "ARCHIVED" },
  });
  const hidden = await db.category.updateMany({
    where: { slug: { in: LEGACY_CATEGORY_SLUGS }, isActive: true },
    data: { isActive: false },
  });
  if (archived.count || hidden.count) {
    console.log(`  retired demo catalog: ${archived.count} products, ${hidden.count} categories`);
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
    // Only the demo announcement is replaced; anything the owner has edited
    // since is left alone.
    const value = (storeRow.value ?? {}) as Record<string, unknown>;
    if (value.announcementBar === LEGACY_ANNOUNCEMENT) {
      await db.setting.update({
        where: { key: "store" },
        data: {
          value: {
            ...value,
            announcementBar: storeDefaults.announcementBar,
            freeShippingThreshold: cedis(300),
          },
        },
      });
      console.log("  settings: refreshed the announcement bar");
    }
  }

  console.log("Done.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
