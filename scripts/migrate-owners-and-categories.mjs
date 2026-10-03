import dotenv from "dotenv";
dotenv.config();
import bcrypt from "bcryptjs";
import pg from "pg";
const { Client } = pg;

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  console.log("Connected to PostgreSQL database.");

  try {
    await client.query("BEGIN;");

    // 1. Wipe previous users and dependent references
    console.log("Purging all previous users and associated session data...");
    await client.query('DELETE FROM "VerificationToken";');
    await client.query('DELETE FROM "CartItem";');
    await client.query('DELETE FROM "Cart";');
    await client.query('DELETE FROM "WishlistItem";');
    await client.query('DELETE FROM "Review";');
    await client.query('DELETE FROM "CustomerInteraction";');
    await client.query('DELETE FROM "CustomerTagOnUser";');
    await client.query('DELETE FROM "AgentThread";');
    await client.query('UPDATE "Order" SET "userId" = NULL;');
    await client.query('DELETE FROM "Address";');
    await client.query('DELETE FROM "AuditLog";');
    await client.query('DELETE FROM "User";');
    console.log("All previous users removed.");

    // 2. Create the two owner accounts
    const passwordHash = await bcrypt.hash("NobleEnclave2026!", 12);

    const owners = [
      {
        id: "owner_lois_" + Date.now().toString(36),
        phone: "233555979409",
        email: "lois@nobleenclave.com",
        firstName: "Lois",
        lastName: "Ayipah",
        role: "OWNER",
      },
      {
        id: "owner_dan_" + (Date.now() + 1).toString(36),
        phone: "233545950611",
        email: "dan@nobleenclave.com",
        firstName: "Dan",
        lastName: "Ayipah",
        role: "OWNER",
      },
    ];

    for (const o of owners) {
      await client.query(
        `INSERT INTO "User" ("id", "phone", "email", "firstName", "lastName", "role", "passwordHash", "phoneVerified", "isActive", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), true, NOW(), NOW())`,
        [o.id, o.phone, o.email, o.firstName, o.lastName, o.role, passwordHash]
      );
      console.log(`Created Owner: ${o.firstName} ${o.lastName} (${o.phone})`);
    }

    // 3. Ensure the 4 primary categories exist: Bedding, Curtains, Carpets, Cushions
    const categories = [
      {
        slug: "bedding",
        name: "Bedding",
        position: 1,
        imageUrl: "/catalog/room-bedroom.webp",
        description: "Duvets, sheets, toppers and pillows for a bed you sink into.",
      },
      {
        slug: "curtains",
        name: "Curtains",
        position: 2,
        imageUrl: "/catalog/window-curtain.webp",
        description: "Curtains, drapes, blinds and rods, measured for Ghanaian windows.",
      },
      {
        slug: "carpets",
        name: "Carpets",
        position: 3,
        imageUrl: "/catalog/fluffy-carpet.webp",
        description: "Plush area rugs, living carpets, and doormats that ground any room.",
      },
      {
        slug: "cushions",
        name: "Cushions",
        position: 4,
        imageUrl: "/catalog/throw-pillow.webp",
        description: "Accent cushions, throw pillows, and covers to complete your seating.",
      },
    ];

    // Deactivate all older categories
    await client.query('UPDATE "Category" SET "isActive" = false;');

    const catMap = new Map();
    for (const cat of categories) {
      const existing = await client.query('SELECT id FROM "Category" WHERE slug = $1;', [cat.slug]);
      let catId;
      if (existing.rows.length > 0) {
        catId = existing.rows[0].id;
        await client.query(
          `UPDATE "Category" SET "name" = $1, "position" = $2, "imageUrl" = $3, "description" = $4, "isActive" = true, "updatedAt" = NOW()
           WHERE "id" = $5;`,
          [cat.name, cat.position, cat.imageUrl, cat.description, catId]
        );
      } else {
        catId = "cat_" + cat.slug;
        await client.query(
          `INSERT INTO "Category" ("id", "slug", "name", "position", "imageUrl", "description", "isActive", "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, $5, $6, true, NOW(), NOW());`,
          [catId, cat.slug, cat.name, cat.position, cat.imageUrl, cat.description]
        );
      }
      catMap.set(cat.slug, catId);
      console.log(`Category ready: ${cat.name} (${cat.slug} -> ${catId})`);
    }

    // 4. Map products to the 4 categories
    const allProducts = await client.query('SELECT id, slug, title FROM "Product";');
    for (const prod of allProducts.rows) {
      const s = (prod.slug + " " + prod.title).toLowerCase();
      let targetCatSlug = "bedding";
      if (s.includes("curtain") || s.includes("blind") || s.includes("rod") || s.includes("pole")) {
        targetCatSlug = "curtains";
      } else if (s.includes("carpet") || s.includes("rug") || s.includes("doormat")) {
        targetCatSlug = "carpets";
      } else if (s.includes("cushion") || (s.includes("pillow") && !s.includes("bed") && !s.includes("soft-sleep") && !s.includes("sleep"))) {
        targetCatSlug = "cushions";
      } else {
        targetCatSlug = "bedding";
      }

      const targetCatId = catMap.get(targetCatSlug);
      if (targetCatId) {
        await client.query(
          `INSERT INTO "ProductCategory" ("productId", "categoryId")
           VALUES ($1, $2)
           ON CONFLICT DO NOTHING;`,
          [prod.id, targetCatId]
        );
      }
    }
    console.log(`Mapped ${allProducts.rows.length} products into the 4 primary categories.`);

    await client.query("COMMIT;");
    console.log("Migration successfully completed and committed!");
  } catch (err) {
    await client.query("ROLLBACK;");
    console.error("Migration error, rolled back:", err);
    throw err;
  } finally {
    await client.end();
  }
}

run();
