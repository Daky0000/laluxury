import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

/**
 * Seeds a working store: staff account, catalog, shipping, discounts.
 * Safe to re-run - everything is upserted by a natural key.
 */

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });

const cedis = (amount: number) => Math.round(amount * 100);

function searchText(p: { title: string; tags: string[]; material?: string; short?: string }) {
  return [p.title, ...p.tags, p.material ?? "", p.short ?? ""].join(" ").toLowerCase();
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

  // --- Categories ----------------------------------------------------------
  const categorySeed = [
    { name: "Lighting", slug: "lighting", position: 1 },
    { name: "Textiles", slug: "textiles", position: 2 },
    { name: "Tableware", slug: "tableware", position: 3 },
    { name: "Decor", slug: "decor", position: 4 },
    { name: "Furniture", slug: "furniture", position: 5 },
  ];

  const categories = new Map<string, string>();
  for (const c of categorySeed) {
    const row = await db.category.upsert({
      where: { slug: c.slug },
      create: c,
      update: { name: c.name, position: c.position },
    });
    categories.set(c.slug, row.id);
  }

  // --- Collections ---------------------------------------------------------
  const collectionSeed = [
    { name: "New In", slug: "new-in", isFeatured: true, position: 1 },
    { name: "Best Sellers", slug: "best-sellers", isFeatured: true, position: 2 },
    { name: "The Accra Edit", slug: "accra-edit", isFeatured: false, position: 3 },
  ];

  const collections = new Map<string, string>();
  for (const c of collectionSeed) {
    const row = await db.collection.upsert({
      where: { slug: c.slug },
      create: c,
      update: { name: c.name },
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
    category: string;
    collections: string[];
    tags: string[];
    material: string;
    basePrice: number;
    compareAt?: number;
    featured?: boolean;
    options?: { name: string; values: { value: string; hex?: string }[] };
    variants: VariantSeed[];
  };

  const products: ProductSeed[] = [
    {
      title: "Adinkra Ceramic Table Lamp",
      slug: "adinkra-ceramic-table-lamp",
      short: "Hand-thrown stoneware with a linen shade.",
      description:
        "A hand-thrown stoneware base carrying a subtle Adinkra relief, finished with a natural linen shade. Each piece is turned individually in Accra, so no two are identical.",
      category: "lighting",
      collections: ["new-in", "best-sellers"],
      tags: ["handmade", "ceramic", "lamp"],
      material: "Stoneware, linen",
      basePrice: 890,
      compareAt: 1050,
      featured: true,
      options: {
        name: "Colour",
        values: [
          { value: "Ivory", hex: "#EFE9DD" },
          { value: "Clay", hex: "#B4785C" },
          { value: "Obsidian", hex: "#22201E" },
        ],
      },
      variants: [
        { suffix: "IVR", options: { Colour: "Ivory" }, price: 890, stock: 14 },
        { suffix: "CLY", options: { Colour: "Clay" }, price: 890, stock: 8 },
        { suffix: "OBS", options: { Colour: "Obsidian" }, price: 940, stock: 3 },
      ],
    },
    {
      title: "Kente Stripe Throw",
      slug: "kente-stripe-throw",
      short: "Handwoven cotton, fringed edge.",
      description:
        "Woven on traditional narrow looms and finished with a hand-knotted fringe. Warm enough for harmattan evenings, light enough to leave out all year.",
      category: "textiles",
      collections: ["best-sellers", "accra-edit"],
      tags: ["handwoven", "cotton", "throw"],
      material: "100% cotton",
      basePrice: 520,
      featured: true,
      options: {
        name: "Colourway",
        values: [
          { value: "Gold", hex: "#C9A227" },
          { value: "Indigo", hex: "#2C3E60" },
        ],
      },
      variants: [
        { suffix: "GLD", options: { Colourway: "Gold" }, price: 520, stock: 22 },
        { suffix: "IND", options: { Colourway: "Indigo" }, price: 520, stock: 11 },
      ],
    },
    {
      title: "Sekondi Stoneware Dinner Set",
      slug: "sekondi-stoneware-dinner-set",
      short: "Four-place setting, reactive glaze.",
      description:
        "Sixteen pieces across four settings, finished in a reactive glaze that pools differently on every plate. Dishwasher and microwave safe.",
      category: "tableware",
      collections: ["new-in"],
      tags: ["stoneware", "dinnerware", "set"],
      material: "Reactive-glaze stoneware",
      basePrice: 1450,
      options: {
        name: "Size",
        values: [{ value: "4 place" }, { value: "8 place" }],
      },
      variants: [
        { suffix: "4P", options: { Size: "4 place" }, price: 1450, stock: 6 },
        { suffix: "8P", options: { Size: "8 place" }, price: 2680, stock: 2 },
      ],
    },
    {
      title: "Woven Raffia Pendant",
      slug: "woven-raffia-pendant",
      short: "Open-weave shade, cast in warm light.",
      description:
        "An open raffia weave that throws a soft dappled light across the ceiling. Supplied with a 2m braided cord and brass fitting.",
      category: "lighting",
      collections: ["accra-edit"],
      tags: ["raffia", "pendant", "handmade"],
      material: "Raffia, brass",
      basePrice: 680,
      featured: true,
      options: {
        name: "Size",
        values: [{ value: "Small" }, { value: "Large" }],
      },
      variants: [
        { suffix: "SM", options: { Size: "Small" }, price: 680, stock: 9 },
        { suffix: "LG", options: { Size: "Large" }, price: 940, stock: 4 },
      ],
    },
    {
      title: "Bolga Storage Basket",
      slug: "bolga-storage-basket",
      short: "Elephant grass, leather-bound handles.",
      description:
        "Hand-coiled from elephant grass in the Upper East, with vegetable-tanned leather binding on the handles. Holds firewood, laundry or a very large plant.",
      category: "decor",
      collections: ["best-sellers"],
      tags: ["basket", "storage", "handwoven"],
      material: "Elephant grass, leather",
      basePrice: 340,
      variants: [{ suffix: "STD", options: {}, price: 340, stock: 31 }],
    },
    {
      title: "Teak Low Stool",
      slug: "teak-low-stool",
      short: "Solid teak, oiled finish.",
      description:
        "Carved from a single block of reclaimed teak and finished with a hand-rubbed oil. Works as a seat, a side table, or a plinth for something you love.",
      category: "furniture",
      collections: ["new-in", "accra-edit"],
      tags: ["teak", "stool", "solid wood"],
      material: "Reclaimed teak",
      basePrice: 1180,
      variants: [{ suffix: "STD", options: {}, price: 1180, stock: 5 }],
    },
    {
      title: "Brass Candle Holders",
      slug: "brass-candle-holders",
      short: "Set of three, graduated heights.",
      description:
        "Cast and hand-polished in a small Accra foundry. The brass will patina gently with use, which is the point.",
      category: "decor",
      collections: ["best-sellers"],
      tags: ["brass", "candles", "set"],
      material: "Solid brass",
      basePrice: 420,
      compareAt: 490,
      variants: [{ suffix: "SET3", options: {}, price: 420, stock: 18 }],
    },
    {
      title: "Linen Cushion Cover",
      slug: "linen-cushion-cover",
      short: "Stonewashed linen, hidden zip.",
      description:
        "Heavyweight stonewashed linen with a concealed zip and a neat mitred corner. Cover only; inners sold separately.",
      category: "textiles",
      collections: ["new-in"],
      tags: ["linen", "cushion", "washable"],
      material: "Stonewashed linen",
      basePrice: 180,
      options: {
        name: "Colour",
        values: [
          { value: "Sand", hex: "#D8C9B0" },
          { value: "Olive", hex: "#6B7355" },
          { value: "Charcoal", hex: "#3A3A38" },
        ],
      },
      variants: [
        { suffix: "SND", options: { Colour: "Sand" }, price: 180, stock: 40 },
        { suffix: "OLV", options: { Colour: "Olive" }, price: 180, stock: 26 },
        { suffix: "CHR", options: { Colour: "Charcoal" }, price: 180, stock: 0 },
      ],
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
        tags: p.tags,
        isFeatured: Boolean(p.featured),
        searchText: searchText({ title: p.title, tags: p.tags, material: p.material, short: p.short }),
      },
      update: {
        shortDescription: p.short,
        description: p.description,
        minPrice: Math.min(...prices),
        maxPrice: Math.max(...prices),
        isFeatured: Boolean(p.featured),
      },
    });

    // Category + collections
    await db.productCategory.upsert({
      where: {
        productId_categoryId: { productId: product.id, categoryId: categories.get(p.category)! },
      },
      create: { productId: product.id, categoryId: categories.get(p.category)! },
      update: {},
    });

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
        update: { price: cedis(v.price), title },
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
      freeAboveSubtotal: cedis(500),
      position: 0,
    },
    {
      zoneId: accraZone.id,
      name: "Accra standard",
      price: cedis(25),
      estimatedDaysMin: 1,
      estimatedDaysMax: 2,
      freeAboveSubtotal: cedis(500),
      position: 1,
    },
    {
      zoneId: nationalZone.id,
      name: "Nationwide courier",
      price: cedis(70),
      estimatedDaysMin: 3,
      estimatedDaysMax: 5,
      freeAboveSubtotal: cedis(1500),
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
  await db.setting.upsert({
    where: { key: "store" },
    create: {
      key: "store",
      value: {
        storeName: "LaLuxury",
        tagline: "Considered pieces for the modern Ghanaian home",
        supportEmail: ownerEmail,
        announcementBar: "Free delivery in Accra on orders over GH₵500",
        agentRequiresApproval: true,
      },
    },
    update: {},
  });

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
