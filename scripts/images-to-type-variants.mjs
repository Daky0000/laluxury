// Turns each gallery image of a product into its own variation under a single
// "Type" option (values 1..n, n = image count). Image k becomes the swatch for
// Type k, so picking a type swaps the gallery to that picture.
//
// Any existing options (e.g. Size) are removed. The first variant is kept as
// "Type 1" (so carts and orders pointing at it stay valid) and copied for
// types 2..n with the same price, cost, weight and stock settings. Other old
// variants are deleted, or deactivated when orders still reference them.
//
// Products are matched by slug or exact title (case-insensitive).
// Dry run by default. Locally:  node -r dotenv/config scripts/images-to-type-variants.mjs bedsheet-set
//                    apply:     APPLY=1 node -r dotenv/config scripts/images-to-type-variants.mjs bedsheet-set
// Production (stdin has no argv, so products/APPLY are read from env, "|"-separated):
//   railway ssh --service laluxury "PRODUCTS='Bedsheet Set|Queen size bedsheet' APPLY=1 node" < scripts/images-to-type-variants.mjs
import pg from "pg";
import { randomBytes } from "crypto";

const products = (process.argv.slice(2).length ? process.argv.slice(2) : (process.env.PRODUCTS ?? "").split("|"))
  .map((s) => s.trim())
  .filter(Boolean);
const apply = process.env.APPLY === "1";
const OPTION = "Type";

if (!products.length) {
  console.error("Pass product slugs/titles as arguments or PRODUCTS='a|b'");
  process.exit(1);
}

const id = () => "c" + Date.now().toString(36) + randomBytes(8).toString("hex");

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

for (const key of products) {
  await c.query("BEGIN");
  try {
    const { rows: found } = await c.query(
      `SELECT id, title, slug FROM "Product" WHERE slug = $1 OR lower(title) = lower($1)`, [key]);
    if (!found.length) throw new Error("no matching product");
    if (found.length > 1) throw new Error(`ambiguous: ${found.map((p) => p.slug).join(", ")} — pass a slug`);
    const [product] = found;

    const { rows: options } = await c.query(
      `SELECT id, name FROM "ProductOption" WHERE "productId" = $1`, [product.id]);
    if (options.some((o) => o.name.toLowerCase() === OPTION.toLowerCase())) {
      throw new Error(`already has a "${OPTION}" option — skipped`);
    }

    const { rows: images } = await c.query(
      `SELECT id FROM "ProductImage" WHERE "productId" = $1 ORDER BY position, "createdAt"`, [product.id]);
    if (images.length < 2) throw new Error(`only ${images.length} image(s) — nothing to split`);

    const { rows: variants } = await c.query(
      `SELECT v.*, i."onHand", i."trackInventory", i."allowBackorder", i."reorderPoint",
              i."reorderQuantity", i.location
         FROM "Variant" v LEFT JOIN "InventoryItem" i ON i."variantId" = v.id
        WHERE v."productId" = $1 ORDER BY v."isActive" DESC, v.position`, [product.id]);
    if (!variants.length) throw new Error("no variants");
    const [base, ...rest] = variants;

    console.log(`\n${product.title} (${product.slug}): ${images.length} images -> ${images.length} variants; ` +
      `removing options [${options.map((o) => o.name).join(", ")}] and ${rest.length} old variant(s)`);

    await c.query(`DELETE FROM "ProductOption" WHERE "productId" = $1`, [product.id]);
    for (const v of rest) {
      const { rows: [{ n }] } = await c.query(
        `SELECT count(*)::int n FROM "OrderItem" WHERE "variantId" = $1`, [v.id]);
      if (n) {
        await c.query(`UPDATE "Variant" SET "isActive" = false, "updatedAt" = now() WHERE id = $1`, [v.id]);
        await c.query(`DELETE FROM "CartItem" WHERE "variantId" = $1`, [v.id]);
      } else {
        await c.query(`DELETE FROM "Variant" WHERE id = $1`, [v.id]);
      }
    }

    const optionId = id();
    await c.query(
      `INSERT INTO "ProductOption" (id, "productId", name, position) VALUES ($1, $2, $3, 0)`,
      [optionId, product.id, OPTION]);

    const valueIds = [];
    for (let k = 0; k < images.length; k++) {
      const valueId = id();
      valueIds.push(valueId);
      await c.query(
        `INSERT INTO "ProductOptionValue" (id, "optionId", value, position) VALUES ($1, $2, $3, $4)`,
        [valueId, optionId, String(k + 1), k]);
      await c.query(`UPDATE "ProductImage" SET "optionValueId" = $1 WHERE id = $2`, [valueId, images[k].id]);
    }

    await c.query(
      `UPDATE "Variant" SET title = '1', position = 0, "isActive" = true, "updatedAt" = now() WHERE id = $1`,
      [base.id]);
    await c.query(`INSERT INTO "VariantOptionValue" ("variantId", "optionValueId") VALUES ($1, $2)`,
      [base.id, valueIds[0]]);

    for (let k = 1; k < images.length; k++) {
      const variantId = id();
      await c.query(
        `INSERT INTO "Variant" (id, "productId", title, sku, barcode, price, "compareAtPrice", "costPrice",
           "weightGrams", "isActive", position, "createdAt", "updatedAt")
         VALUES ($1,$2,$3,$4,NULL,$5,$6,$7,$8,true,$9,now(),now())`,
        [variantId, product.id, String(k + 1), `${base.sku}-T${k + 1}`, base.price, base.compareAtPrice,
          base.costPrice, base.weightGrams, k]);
      await c.query(`INSERT INTO "VariantOptionValue" ("variantId", "optionValueId") VALUES ($1, $2)`,
        [variantId, valueIds[k]]);
      if (base.onHand !== null) {
        await c.query(
          `INSERT INTO "InventoryItem" (id, "variantId", "onHand", reserved, "reorderPoint", "reorderQuantity",
             "trackInventory", "allowBackorder", location, "updatedAt")
           VALUES ($1,$2,$3,0,$4,$5,$6,$7,$8,now())`,
          [id(), variantId, base.onHand, base.reorderPoint, base.reorderQuantity, base.trackInventory,
            base.allowBackorder, base.location]);
      }
    }

    await c.query(
      `UPDATE "Product" SET "minPrice" = $1, "maxPrice" = $1, "updatedAt" = now() WHERE id = $2`,
      [base.price, product.id]);

    if (apply) {
      await c.query("COMMIT");
      console.log("  applied");
    } else {
      await c.query("ROLLBACK");
      console.log("  dry run — rolled back (set APPLY=1 to write)");
    }
  } catch (err) {
    await c.query("ROLLBACK");
    console.error(`  ${key}: ${err.message}`);
  }
}

await c.end();
