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

  const downloadsDir = fs.existsSync("public/downloads") ? "public/downloads" : ".";
  const apkFiles = fs.readdirSync(downloadsDir).filter(f => f.endsWith(".apk"));
  
  if (apkFiles.length === 0) {
    console.log("No APK files found to upload.");
    return;
  }

  for (const file of apkFiles) {
    const fullPath = `${downloadsDir}/${file}`;
    const stat = fs.statSync(fullPath);
    console.log(`Uploading ${file} (${(stat.size / 1024 / 1024).toFixed(2)} MB) to Cloudflare R2...`);
    const fileBuffer = fs.readFileSync(fullPath);

    await s3.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: `downloads/${file}`,
        Body: fileBuffer,
        ContentType: "application/vnd.android.package-archive",
        ContentDisposition: `attachment; filename="${file}"`,
      })
    );
    console.log(`Uploaded: ${publicUrl}/downloads/${file}`);
  }

  console.log("All APK uploads completed successfully!");
}

uploadApk().catch((err) => {
  console.error("Upload error:", err);
  process.exit(1);
});
