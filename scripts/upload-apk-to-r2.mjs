import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { createReadStream, statSync } from "node:fs";
import { basename } from "node:path";
import { createHash } from "node:crypto";
import "dotenv/config";

async function uploadApk() {
  const file = process.argv[2];
  if (!file || !/[-_]v\d+\.\d+\.\d+(?:[-.][a-zA-Z0-9]+)?\.apk$/.test(basename(file))) {
    throw new Error("Usage: node scripts/upload-apk-to-r2.mjs <path/App-v1.2.6.apk>. Use a versioned filename.");
  }
  const { R2_ACCOUNT_ID: accountId, R2_ACCESS_KEY_ID: accessKeyId, R2_SECRET_ACCESS_KEY: secretAccessKey,
    R2_BUCKET_NAME: bucketName, R2_PUBLIC_URL: rawPublicUrl } = process.env;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName || !rawPublicUrl) throw new Error("R2 configuration missing.");
  const publicUrl = new URL(rawPublicUrl);
  if (publicUrl.protocol !== "https:") throw new Error("R2_PUBLIC_URL must use HTTPS.");
  const size = statSync(file).size;
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  const checksum = hash.digest("hex");
  const key = `downloads/${basename(file)}`;
  const destination = `${rawPublicUrl.replace(/\/+$/, "")}/${key}`;
  const s3 = new S3Client({ region: "auto", endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey } });
  try {
    let existing;
    try { existing = await s3.send(new HeadObjectCommand({ Bucket: bucketName, Key: key })); }
    catch (error) { if (error.$metadata?.httpStatusCode !== 404) throw error; }
    if (existing && (existing.Metadata?.sha256 !== checksum || existing.ContentLength !== size)) {
      throw new Error("The versioned release already exists. Never overwrite immutable release objects; use a new version.");
    }
    if (!existing) await s3.send(new PutObjectCommand({
      Bucket: bucketName, Key: key, Body: createReadStream(file), ContentLength: size,
      ContentType: "application/vnd.android.package-archive",
      ContentDisposition: `attachment; filename="${basename(file)}"`,
      CacheControl: "public, max-age=31536000, immutable", Metadata: { sha256: checksum }, IfNoneMatch: "*",
    }));
    const response = await fetch(destination, { method: "HEAD", signal: AbortSignal.timeout(30000) });
    if (!response.ok || Number(response.headers.get("content-length")) !== size) {
      throw new Error("Public APK verification failed. Do not update APK_DOWNLOAD_URL.");
    }
    console.log(`Verified ${size} bytes: ${destination}`);
    console.log("Set APK_DOWNLOAD_URL to this verified URL after the custom media domain is ready.");
  } finally { s3.destroy(); }
}
uploadApk().catch((error) => { console.error(error.message); process.exitCode = 1; });
