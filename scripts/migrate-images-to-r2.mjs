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
    console.log(`Found ${assets.length} image(s) stored in PostgreSQL.`);
    if (assets.length === 0) {
      console.log("No images to migrate! All images are already on CDN/external.");
      await pool.end();
      return;
    }

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

    console.log("\nMigration completed!");
    console.log(`Successfully migrated: ${successCount}/${assets.length} images.`);
    console.log(`Freed ~${(totalBytesFreed / 1024 / 1024).toFixed(2)} MB of binary data from PostgreSQL.`);
    console.log("Future views will load directly from Cloudflare R2 edge with $0 Railway egress!");
  } catch (err) {
    console.error("Migration check encountered error:", err.message);
  } finally {
    await pool.end();
  }
}

migrate().catch(console.error);
