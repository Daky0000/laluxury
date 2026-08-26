import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

/**
 * Demo customers and their orders.
 *
 * The console is hard to judge empty: an orders table with nothing in it, a
 * dashboard of zeroes, customers with no history. This fills it with a handful
 * of plausible Ghanaian orders spread across the pipeline, each attached to a
 * real customer account so the "products bought" view has something to show.
 *
 * Everything it creates is marked, so `npm run db:demo -- --clear` can take it
 * all out again once real orders start arriving.
 *
 * Safe to re-run: it does nothing if demo orders already exist.
 */

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });

const MARK = "DEMO";

const CUSTOMERS = [
  {
    email: "ama.owusu@example.com",
    firstName: "Ama",
    lastName: "Owusu",
    phone: "+233 24 111 0001",
    city: "Accra",
    region: "Greater Accra",
    line1: "12 Lagos Avenue, East Legon",
  },
  {
    email: "kwame.mensah@example.com",
    firstName: "Kwame",
    lastName: "Mensah",
    phone: "+233 24 111 0002",
    city: "Kumasi",
    region: "Ashanti",
    line1: "8 Adum High Street",
  },
  {
    email: "efua.sarpong@example.com",
    firstName: "Efua",
    lastName: "Sarpong",
    phone: "+233 24 111 0003",
    city: "Tema",
    region: "Greater Accra",
    line1: "Community 5, Block C",
  },
];

/** Spread across the pipeline so every status has something behind it. */
const PLAN = [
  { customer: 0, status: "DELIVERED", paid: true, daysAgo: 21, lines: 3 },
  { customer: 0, status: "SHIPPED", paid: true, daysAgo: 5, lines: 2 },
  { customer: 1, status: "PROCESSING", paid: true, daysAgo: 2, lines: 2 },
  { customer: 2, status: "PAID", paid: true, daysAgo: 1, lines: 1 },
  { customer: 1, status: "PENDING", paid: false, daysAgo: 0, lines: 2 },
] as const;

function orderNumber(index: number): string {
  return `DEMO-${String(1000 + index)}`;
}

async function main() {
  const clear = process.argv.includes("--clear");

  if (clear) {
    const removed = await db.order.deleteMany({ where: { staffNote: MARK } });
    const customers = await db.user.deleteMany({
      where: { email: { in: CUSTOMERS.map((c) => c.email) }, role: "CUSTOMER" },
    });
    console.log(`Removed ${removed.count} demo orders and ${customers.count} demo customers.`);
    return;
  }

  const existing = await db.order.count({ where: { staffNote: MARK } });
  if (existing > 0) {
    console.log(`${existing} demo orders already exist — nothing to do.`);
    return;
  }

  const variants = await db.variant.findMany({
    where: { isActive: true, product: { status: "ACTIVE" } },
    include: { product: { include: { images: { orderBy: { position: "asc" }, take: 1 } } } },
    orderBy: { price: "desc" },
    take: 14,
  });

  if (variants.length === 0) {
    console.log("No products to build demo orders from. Seed the catalog first.");
    return;
  }

  // Customers first: the orders attach to these so purchase history fills in.
  const people = [];
  for (const person of CUSTOMERS) {
    const user = await db.user.upsert({
      where: { email: person.email },
      create: {
        email: person.email,
        firstName: person.firstName,
        lastName: person.lastName,
        phone: person.phone,
        role: "CUSTOMER",
        notes: "Demo customer.",
      },
      update: {},
    });
    people.push({ ...person, id: user.id });
  }

  let created = 0;

  for (const [index, plan] of PLAN.entries()) {
    const person = people[plan.customer];
    const placedAt = new Date(Date.now() - plan.daysAgo * 24 * 60 * 60 * 1000);

    // Walk the catalog rather than always taking the same few pieces.
    const chosen = Array.from({ length: plan.lines }, (_, n) => variants[(index * 2 + n) % variants.length]);

    const items = chosen.map((variant, n) => {
      const quantity = n === 0 ? 1 : 2;
      return {
        variantId: variant.id,
        productId: variant.productId,
        productTitle: variant.product.title,
        variantTitle: variant.title,
        sku: variant.sku,
        imageUrl: variant.product.images[0]?.url ?? null,
        quantity,
        unitPrice: variant.price,
        discountAllocated: 0,
        total: variant.price * quantity,
      };
    });

    const subtotal = items.reduce((sum, item) => sum + item.total, 0);
    const shippingTotal = subtotal >= 30000 ? 0 : 2500;

    const address = await db.address.create({
      data: {
        userId: person.id,
        firstName: person.firstName,
        lastName: person.lastName,
        phone: person.phone,
        line1: person.line1,
        city: person.city,
        region: person.region,
        country: "GH",
      },
    });

    await db.order.create({
      data: {
        orderNumber: orderNumber(index),
        userId: person.id,
        email: person.email,
        phone: person.phone,
        status: plan.status,
        paymentStatus: plan.paid ? "SUCCESS" : "PENDING",
        subtotal,
        discountTotal: 0,
        shippingTotal,
        taxTotal: 0,
        total: subtotal + shippingTotal,
        shippingAddressId: address.id,
        billingAddressId: address.id,
        staffNote: MARK,
        placedAt,
        paidAt: plan.paid ? placedAt : null,
        shippedAt: plan.status === "SHIPPED" || plan.status === "DELIVERED" ? placedAt : null,
        deliveredAt: plan.status === "DELIVERED" ? placedAt : null,
        // Deliberately left unset: demo orders never touch real stock levels.
        inventoryAppliedAt: null,
        items: { create: items },
        events: {
          create: {
            type: "note",
            message: "Demo order, created to populate the console.",
          },
        },
      },
    });

    created += 1;
  }

  console.log(`Created ${created} demo orders across ${people.length} demo customers.`);
  console.log("Remove them later with: npm run db:demo -- --clear");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
