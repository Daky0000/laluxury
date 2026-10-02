import "dotenv/config";
import pg from "pg";

const publicUrl = (process.env.R2_PUBLIC_URL || "https://pub-1a69b11766fc4280aadbd18a8e923f34.r2.dev").replace(/\/$/, "");

async function migrateCatalogUrls() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  try {
    console.log("Checking ProductImage URLs pointing to /catalog/...");
    const catalogImages = await pool.query(
      `SELECT id, url FROM "ProductImage" WHERE url LIKE '/catalog/%'`
    );

    console.log(`Found ${catalogImages.rows.length} ProductImage rows with /catalog/ URLs.`);

    if (catalogImages.rows.length > 0) {
      const updateRes = await pool.query(`
        UPDATE "ProductImage"
        SET url = '${publicUrl}' || url
        WHERE url LIKE '/catalog/%'
      `);
      console.log(`Updated ${updateRes.rowCount} ProductImage rows to Cloudflare R2.`);
    }

    // Check Setting table
    const settingsRes = await pool.query(`SELECT key, value FROM "Setting" WHERE value::text LIKE '%/catalog/%'`);
    console.log(`Found ${settingsRes.rows.length} Setting rows referencing /catalog/.`);
    for (const row of settingsRes.rows) {
      let strVal = typeof row.value === "string" ? row.value : JSON.stringify(row.value);
      let updatedVal = strVal.replaceAll("/catalog/", `${publicUrl}/catalog/`);
      try {
        const parsed = JSON.parse(updatedVal);
        await pool.query(`UPDATE "Setting" SET value = $1 WHERE key = $2`, [JSON.stringify(parsed), row.key]);
      } catch {
        await pool.query(`UPDATE "Setting" SET value = $1 WHERE key = $2`, [updatedVal, row.key]);
      }
      console.log(`Updated Setting "${row.key}" to R2 URL.`);
    }

    // Check Category table for image URLs
    const catRes = await pool.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'Category' AND column_name IN ('image', 'imageUrl')
    `);
    if (catRes.rows.length > 0) {
      const col = catRes.rows[0].column_name;
      const catImages = await pool.query(`SELECT id, "${col}" FROM "Category" WHERE "${col}" LIKE '/catalog/%'`);
      console.log(`Found ${catImages.rows.length} Category rows referencing /catalog/.`);
      if (catImages.rows.length > 0) {
        await pool.query(`UPDATE "Category" SET "${col}" = '${publicUrl}' || "${col}" WHERE "${col}" LIKE '/catalog/%'`);
        console.log(`Updated Category rows to R2.`);
      }
    }

    // Verify
    const remaining = await pool.query(`SELECT count(*)::int FROM "ProductImage" WHERE url LIKE '/catalog/%'`);
    console.log(`Remaining /catalog/ ProductImages: ${remaining.rows[0].count}`);

    console.log("Catalog URL migration completed successfully!");
  } catch (err) {
    console.error("Migration failed:", err);
  } finally {
    await pool.end();
  }
}

migrateCatalogUrls();
