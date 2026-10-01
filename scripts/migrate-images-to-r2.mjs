import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import "dotenv/config";

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucketName = process.env.R2_BUCKET_NAME || "laluxurys-media";
const publicUrl = (process.env.R2_PUBLIC_URL || "").replace(/\/$/, "");

if (!accountId || !accessKeyId || !secretAccessKey || !publicUrl) {
  console.log("R2 environment variables are not fully configured. Skipping image migration.");
  process.exit(0);
}

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
});

const EXTENSIONS = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
};

async function migrate() {
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  try {
    console.log("Searching for image assets stored in PostgreSQL...");
    const res = await pool.query(
      `SELECT id, filename, "mimeType", folder, data, size FROM "MediaAsset" WHERE source = 'DATABASE' AND data IS NOT NULL`
    );

    const assets = res.rows;
    console.log(`Found ${assets.length} binary image(s) remaining in PostgreSQL.`);

    let totalBytesFreed = 0;
    let successCount = 0;

    for (let i = 0; i < assets.length; i++) {
      const asset = assets[i];
      const ext = EXTENSIONS[asset.mimeType] || "jpg";
      const key = `${asset.folder || "products"}/${asset.id}.${ext}`;
      const destinationUrl = `${publicUrl}/${key}`;

      process.stdout.write(
        `[${i + 1}/${assets.length}] Uploading ${asset.id} (${(asset.size / 1024).toFixed(1)} KB) to R2... `
      );

      try {
        await s3.send(
          new PutObjectCommand({
            Bucket: bucketName,
            Key: key,
            Body: asset.data,
            ContentType: asset.mimeType,
            CacheControl: "public, max-age=31536000, immutable",
          })
        );

        await pool.query(
          `UPDATE "MediaAsset" SET source = 'CDN', url = $1, "publicId" = $2, data = NULL WHERE id = $3`,
          [destinationUrl, key, asset.id]
        );

        totalBytesFreed += asset.size || (asset.data ? asset.data.length : 0);
        successCount++;
        console.log("OK!");
      } catch (err) {
        console.error(`FAILED: ${err.message}`);
      }
    }

    if (assets.length > 0) {
      console.log(`Successfully migrated ${successCount}/${assets.length} binary images to R2. Freed ~${(totalBytesFreed / 1024 / 1024).toFixed(2)} MB.`);
    }

    // 1. Update ProductImage linked to MediaAsset
    console.log("Updating ProductImage rows to Cloudflare R2 URLs...");
    const piMediaRes = await pool.query(`
      UPDATE "ProductImage" pi
      SET url = ma.url
      FROM "MediaAsset" ma
      WHERE pi."mediaId" = ma.id AND ma.url != '' AND pi.url != ma.url
    `);
    console.log(`Updated ${piMediaRes.rowCount ?? 0} ProductImage row(s) from MediaAsset.`);

    // 2. Update ProductImage with /api/media/ URLs
    const piApiRes = await pool.query(`
      UPDATE "ProductImage" pi
      SET url = ma.url
      FROM "MediaAsset" ma
      WHERE (pi.url = '/api/media/' || ma.id OR pi.url LIKE '/api/media/' || ma.id || '.%') AND ma.url != '' AND pi.url != ma.url
    `);
    console.log(`Updated ${piApiRes.rowCount ?? 0} ProductImage row(s) with /api/media/ URLs.`);

    // 3. Update ProductImage with /catalog/ URLs
    const piCatRes = await pool.query(`
      UPDATE "ProductImage"
      SET url = $1 || url
      WHERE url LIKE '/catalog/%'
    `, [publicUrl]);
    console.log(`Updated ${piCatRes.rowCount ?? 0} ProductImage row(s) pointing to /catalog/.`);

    // 4. Update Category image URLs
    const catRes = await pool.query(`
      UPDATE "Category"
      SET "imageUrl" = $1 || "imageUrl"
      WHERE "imageUrl" LIKE '/catalog/%'
    `, [publicUrl]);
    console.log(`Updated ${catRes.rowCount ?? 0} Category row(s) pointing to /catalog/.`);

    // 5. Update Collection image URLs
    const colRes = await pool.query(`
      UPDATE "Collection"
      SET "imageUrl" = $1 || "imageUrl"
      WHERE "imageUrl" LIKE '/catalog/%'
    `, [publicUrl]);
    console.log(`Updated ${colRes.rowCount ?? 0} Collection row(s) pointing to /catalog/.`);

    // 6. Update Setting JSON references to /catalog/
    const setCatRes = await pool.query(`
      UPDATE "Setting"
      SET value = replace(value::text, '"/catalog/', '"' || $1 || '/catalog/')::jsonb
      WHERE value::text LIKE '%"/catalog/%'
    `, [publicUrl]);
    console.log(`Updated ${setCatRes.rowCount ?? 0} Setting row(s) containing /catalog/ references.`);

    console.log("\nAll database image references have been migrated to Cloudflare R2!");
  } catch (err) {
    console.error("Migration check encountered error:", err.message);
  } finally {
    await pool.end();
  }
}

migrate().catch(console.error);
