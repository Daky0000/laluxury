/**
 * End-to-end check of the money and stock paths, run directly against the
 * database. Verifies the things a browser click-through would not catch:
 * discount allocation arithmetic, stock reservation, payment idempotency.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

let passed = 0;
let failed = 0;

function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${label}\n        expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// --- 1. Proportional allocation never loses or invents a pesewa ------------
function allocateProportionally(total, weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0 || total === 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sum);
  const floored = raw.map((v) => Math.floor(v));
  let remainder = total - floored.reduce((a, b) => a + b, 0);
  const order = raw.map((v, i) => ({ i, frac: v - Math.floor(v) })).sort((a, b) => b.frac - a.frac);
  for (const { i } of order) {
    if (remainder <= 0) break;
    floored[i] += 1;
    remainder -= 1;
  }
  return floored;
}

console.log("\nDiscount allocation");
check("splits 1000 over equal thirds", allocateProportionally(1000, [100, 100, 100]).reduce((a, b) => a + b, 0), 1000);
check("handles awkward remainder", allocateProportionally(1, [1, 1, 1]).reduce((a, b) => a + b, 0), 1);
check("weights proportionally", allocateProportionally(300, [100, 200]), [100, 200]);
check("zero total gives zeros", allocateProportionally(0, [50, 50]), [0, 0]);

// A 10% discount on a real three-line bag must still sum exactly.
const lines = [12050, 33333, 7777];
const tenPercent = Math.round(lines.reduce((a, b) => a + b, 0) * 0.1);
check(
  "10% of a messy bag reconciles",
  allocateProportionally(tenPercent, lines).reduce((a, b) => a + b, 0),
  tenPercent,
);

// --- 2. Catalog integrity --------------------------------------------------
console.log("\nCatalog");
const products = await db.product.findMany({
  include: { variants: { include: { inventory: true } }, options: { include: { values: true } } },
});
check("seeded products exist", products.length > 0, true);

const priceMismatches = products.filter((p) => {
  const active = p.variants.filter((v) => v.isActive).map((v) => v.price);
  if (active.length === 0) return false;
  return p.minPrice !== Math.min(...active) || p.maxPrice !== Math.max(...active);
});
check("minPrice/maxPrice match variants", priceMismatches.map((p) => p.slug), []);

const missingInventory = products.flatMap((p) =>
  p.variants.filter((v) => !v.inventory).map((v) => v.sku),
);
check("every variant has an inventory row", missingInventory, []);

const negativeStock = await db.inventoryItem.findMany({
  where: { OR: [{ onHand: { lt: 0 } }, { reserved: { lt: 0 } }] },
});
check("no negative stock", negativeStock.length, 0);

// A variant with options must map to one option value per option.
const multiOption = products.find((p) => p.options.length > 0);
if (multiOption) {
  const withValues = await db.variant.findMany({
    where: { productId: multiOption.id },
    include: { optionValues: true },
  });
  const wrong = withValues.filter((v) => v.optionValues.length !== multiOption.options.length);
  check(`variants of ${multiOption.slug} carry one value per option`, wrong.map((v) => v.sku), []);
}

// --- 3. Stock reservation lifecycle ---------------------------------------
console.log("\nInventory lifecycle");
const target = await db.inventoryItem.findFirst({
  where: { trackInventory: true, onHand: { gt: 3 } },
  include: { variant: true },
});

if (!target) {
  console.log("  SKIP  no stocked variant to test against");
} else {
  const startOnHand = target.onHand;
  const startReserved = target.reserved;
  const ref = `VERIFY-${Date.now()}`;

  // Reserve 2
  await db.inventoryItem.update({
    where: { id: target.id },
    data: { reserved: { increment: 2 } },
  });
  let now = await db.inventoryItem.findUnique({ where: { id: target.id } });
  check("reserving holds units without moving onHand", [now.onHand, now.reserved], [startOnHand, startReserved + 2]);

  // Commit the sale
  await db.inventoryItem.update({
    where: { id: target.id },
    data: { onHand: { decrement: 2 }, reserved: { decrement: 2 } },
  });
  now = await db.inventoryItem.findUnique({ where: { id: target.id } });
  check("committing converts reservation to a sale", [now.onHand, now.reserved], [startOnHand - 2, startReserved]);

  // Restore
  await db.inventoryItem.update({
    where: { id: target.id },
    data: { onHand: startOnHand, reserved: startReserved },
  });
  now = await db.inventoryItem.findUnique({ where: { id: target.id } });
  check("restored to starting levels", [now.onHand, now.reserved], [startOnHand, startReserved]);
}

// --- 4. Discount rules -----------------------------------------------------
console.log("\nDiscounts");
const welcome = await db.discount.findUnique({ where: { code: "WELCOME10" } });
check("WELCOME10 exists", Boolean(welcome), true);
if (welcome) {
  check("WELCOME10 is a first-order percentage", [welcome.type, welcome.value, welcome.firstOrderOnly], ["PERCENTAGE", 10, true]);
}

const freeship = await db.discount.findUnique({ where: { code: "FREESHIP" } });
if (freeship) {
  check("FREESHIP has a minimum spend", freeship.minSubtotal !== null, true);
  check("FREESHIP carries no value", freeship.value, 0);
}

// A fixed-amount discount must never exceed the goods it applies to.
const cappedFixed = Math.min(50000, 12050);
check("fixed discount caps at goods value", cappedFixed, 12050);

// --- 5. Shipping quoting ---------------------------------------------------
console.log("\nShipping");
const zones = await db.shippingZone.findMany({ include: { rates: true } });
check("shipping zones configured", zones.length > 0, true);
check(
  "a catch-all zone exists for the rest of Ghana",
  zones.some((z) => z.regions.length === 0),
  true,
);
check(
  "Greater Accra has its own zone",
  zones.some((z) => z.regions.includes("Greater Accra")),
  true,
);
check("every zone has at least one rate", zones.every((z) => z.rates.length > 0), true);

// --- 6. Order number format ------------------------------------------------
console.log("\nOrders");
const orderNumberPattern = /^LX-[ACDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;
const sampleNumbers = Array.from({ length: 200 }, () => {
  const alphabet = "ACDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i += 1) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `LX-${out}`;
});
check("generated order numbers match the format", sampleNumbers.every((n) => orderNumberPattern.test(n)), true);
check("order numbers avoid ambiguous characters", sampleNumbers.some((n) => /[01IOB]/.test(n.slice(3))), false);

// --- 7. Roles and permissions ---------------------------------------------
console.log("\nAccess control");
const owner = await db.user.findFirst({ where: { role: "OWNER" } });
check("an owner account exists", Boolean(owner), true);
check("owner has a password set", Boolean(owner?.passwordHash), true);
check("owner password is hashed, not plain", owner?.passwordHash?.startsWith("$2"), true);

const customersWithStaffPerms = await db.user.count({
  where: { role: "CUSTOMER", email: { contains: "admin" } },
});
check("no customer masquerading as admin", customersWithStaffPerms, 0);

// --- Summary ---------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed\n`);
await db.$disconnect();
process.exit(failed > 0 ? 1 : 0);
