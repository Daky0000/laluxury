import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import fs from "fs";
import "dotenv/config";

async function uploadApk() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucketName = process.env.R2_BUCKET_NAME || "laluxurys-media";
  const publicUrl = (process.env.R2_PUBLIC_URL || "").replace(/\/$/, "");

  if (!accountId || !accessKeyId || !secretAccessKey || !publicUrl) {
    console.error("R2 configuration missing.");
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

  const apkPath = "LaLuxury-Management.apk";
  if (!fs.existsSync(apkPath)) {
    console.error(`APK not found at ${apkPath}`);
    process.exit(1);
  }

  const stat = fs.statSync(apkPath);
  console.log(`Uploading ${apkPath} (${(stat.size / 1024 / 1024).toFixed(2)} MB) to Cloudflare R2...`);

  const fileBuffer = fs.readFileSync(apkPath);

  await s3.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: "downloads/LaLuxury-Management.apk",
      Body: fileBuffer,
      ContentType: "application/vnd.android.package-archive",
      ContentDisposition: 'attachment; filename="LaLuxury-Management.apk"',
    })
  );

  await s3.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: "downloads/LaLuxury-v1.2.2.apk",
      Body: fileBuffer,
      ContentType: "application/vnd.android.package-archive",
      ContentDisposition: 'attachment; filename="LaLuxury-v1.2.2.apk"',
    })
  );

  console.log("Upload completed successfully!");
  console.log(`Download link 1: ${publicUrl}/downloads/LaLuxury-Management.apk`);
  console.log(`Download link 2: ${publicUrl}/downloads/LaLuxury-v1.2.2.apk`);
}

uploadApk().catch((err) => {
  console.error("Upload error:", err);
  process.exit(1);
});
