import "dotenv/config";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function check() {
  try {
    console.log("R2 Config present in env:", {
      hasAccountId: !!process.env.R2_ACCOUNT_ID,
      hasAccessKey: !!process.env.R2_ACCESS_KEY_ID,
      hasSecretKey: !!process.env.R2_SECRET_ACCESS_KEY,
      r2PublicUrl: process.env.R2_PUBLIC_URL,
      catalogCdnUrl: process.env.CATALOG_CDN_URL,
      apkDownloadUrl: process.env.APK_DOWNLOAD_URL,
    });

    const assetSummary = await pool.query(`
      SELECT source, 
             count(*)::int AS count, 
             count(data)::int AS with_binary,
             coalesce(sum(length(data)), 0)::bigint AS binary_bytes
      FROM "MediaAsset"
      GROUP BY source;
    `);
    console.log("\nMediaAsset breakdown:");
    console.table(assetSummary.rows);

    const piSummary = await pool.query(`
      SELECT 
        CASE 
          WHEN url LIKE 'https://%' THEN 'EXTERNAL_OR_R2_URL'
          WHEN url LIKE '/api/media/%' THEN 'API_MEDIA_ROUTE'
          WHEN url LIKE '/catalog/%' THEN 'LOCAL_CATALOG'
          ELSE 'OTHER'
        END AS url_type,
        count(*)::int AS count
      FROM "ProductImage"
      GROUP BY 1;
    `);
    console.log("\nProductImage breakdown:");
    console.table(piSummary.rows);

  } catch (err) {
    console.error("Check failed:", err);
  } finally {
    await pool.end();
  }
}

check();
