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
      `SELECT id, filename, "mimeType", folder, size FROM "MediaAsset" WHERE source = 'DATABASE' AND data IS NOT NULL`
    );

    const assets = res.rows;
    console.log(`Found ${assets.length} binary image(s) remaining in PostgreSQL.`);

    let totalBytesFreed = 0;
    let successCount = 0;
    let failureCount = 0;

    for (let i = 0; i < assets.length; i++) {
      const asset = assets[i];
      const ext = EXTENSIONS[asset.mimeType] || "jpg";
      const key = `${asset.folder || "products"}/${asset.id}.${ext}`;
      const destinationUrl = `${publicUrl}/${key}`;

      process.stdout.write(
        `[${i + 1}/${assets.length}] Uploading ${asset.id} (${(asset.size / 1024).toFixed(1)} KB) to R2... `
      );

      try {
        // Fetch only one binary at a time; metadata lists do not retain every image buffer.
        const binary = await pool.query(`SELECT data FROM "MediaAsset" WHERE id = $1 AND source = 'DATABASE' AND data IS NOT NULL`, [asset.id]);
        asset.data = binary.rows[0]?.data;
        if (!asset.data) continue;
        await s3.send(
          new PutObjectCommand({
            Bucket: bucketName,
            Key: key,
            Body: asset.data,
            ContentType: asset.mimeType,
            CacheControl: "public, max-age=31536000, immutable",
          })
        );

        const delivered = await fetch(destinationUrl, { method: "HEAD", signal: AbortSignal.timeout(20_000) });
        if (!delivered.ok || Number(delivered.headers.get("content-length")) !== asset.data.length) {
          throw new Error("Public R2 object verification failed; database bytes retained.");
        }
        await pool.query(
          `UPDATE "MediaAsset" SET source = 'CDN', url = $1, "publicId" = $2, data = NULL WHERE id = $3`,
          [destinationUrl, key, asset.id]
        );

        totalBytesFreed += asset.size || (asset.data ? asset.data.length : 0);
        successCount++;
        console.log("OK!");
      } catch (err) {
        failureCount++;
        console.error(`FAILED: ${err.message}`);
      } finally {
        asset.data = null;
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

    // Catalog references must not be rewritten until those objects have been uploaded
    // and verified separately. A URL prefix change alone can break every catalog image.
    const remaining = await pool.query(`SELECT count(*)::int AS count FROM "MediaAsset" WHERE source = 'DATABASE' AND data IS NOT NULL`);
    console.log(`Database-backed images remaining: ${remaining.rows[0].count}`);
    if (failureCount || remaining.rows[0].count) throw new Error("Image migration incomplete; inspect failed assets.");

    console.log("\nAll database image references have been migrated to Cloudflare R2!");
  } catch (err) {
    console.error("Migration check encountered error:", err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

migrate().catch((error) => { console.error(error.message); process.exitCode = 1; });
