import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";
import "dotenv/config";

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucketName = process.env.R2_BUCKET_NAME || "laluxurys-media";
const publicUrl = (process.env.R2_PUBLIC_URL || "").replace(/\/$/, "");

if (!accountId || !accessKeyId || !secretAccessKey || !publicUrl) {
  console.error("Missing R2 credentials in environment.");
  process.exit(1);
}

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
});

const MIMES = {
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".json": "application/json",
};

function getAllFiles(dir, fileList = []) {
  const files = readdirSync(dir);
  for (const file of files) {
    const fullPath = join(dir, file);
    if (statSync(fullPath).isDirectory()) {
      getAllFiles(fullPath, fileList);
    } else {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

async function uploadCatalog() {
  const catalogDir = join(process.cwd(), "public", "catalog");
  const files = getAllFiles(catalogDir);

  console.log(`Uploading ${files.length} catalog files to Cloudflare R2...`);

  let count = 0;
  for (const filePath of files) {
    const rel = relative(join(process.cwd(), "public"), filePath).replace(/\\/g, "/");
    const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
    const mime = MIMES[ext] || "application/octet-stream";
    const bytes = readFileSync(filePath);

    process.stdout.write(`[${count + 1}/${files.length}] Uploading ${rel} (${(bytes.length / 1024).toFixed(1)} KB)... `);

    try {
      await s3.send(
        new PutObjectCommand({
          Bucket: bucketName,
          Key: rel,
          Body: bytes,
          ContentType: mime,
          CacheControl: "public, max-age=31536000, immutable",
        })
      );
      const delivered = await fetch(`${publicUrl}/${rel}`, {
        method: "HEAD",
        signal: AbortSignal.timeout(20_000),
      });
      if (!delivered.ok || Number(delivered.headers.get("content-length")) !== bytes.length) {
        throw new Error(`Public object verification failed for ${rel}`);
      }
      console.log("OK!");
      count++;
    } catch (err) {
      console.error(`FAILED: ${err.message}`);
    }
  }

  console.log(`\nSuccessfully uploaded ${count}/${files.length} files to Cloudflare R2!`);
  console.log(`Base URL: ${publicUrl}/catalog/`);
  if (count !== files.length) {
    throw new Error("Catalog upload incomplete; do not enable CATALOG_CDN_URL.");
  }
}

uploadCatalog().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
