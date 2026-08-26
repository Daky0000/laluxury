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
      options: [{ name: "Size", values: [{ value: "Double" }, { value: "King" }] }],
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
        "Breathable cotton percale in a four-piece set: fitted sheet, flat sheet and two pillowcases. Deep pockets that stay put through the night. Prints change with each delivery — the gallery is what is on the shelf now, and you can name the one you want in the order notes or on WhatsApp.",
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
      ],
      categories: ["bedding"],
      collections: ["best-sellers", "bed-set"],
      tags: ["bestseller", "bedsheet", "cotton"],
      material: "100% cotton percale",
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
        "/catalog/throw-pillow.webp",
      ],
      categories: ["living"],
      collections: [],
      tags: ["pillow", "cushion", "fur"],
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
        "/catalog/doormat.webp",
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
        "/catalog/window-curtain.webp",
      ],
      categories: ["windows"],
      collections: ["best-sellers"],
      tags: ["curtain"],
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
        "/catalog/curtain-blinds.webp",
      ],
      categories: ["windows"],
      collections: [],
      tags: ["blinds"],
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
        "A single bedsheet set cut for a standard hall mattress, in a cotton blend that survives the laundry queue. Prints rotate with each delivery — name the one you want in the order notes.",
      images: [
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
        "/catalog/student-bedsheet.webp",
      ],
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

      await db.inventoryItem.upsert({
        where: { variantId: variant.id },
        create: { variantId: variant.id, onHand: v.stock, reorderPoint: 5, reorderQuantity: 20 },
        update: { onHand: v.stock },
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
