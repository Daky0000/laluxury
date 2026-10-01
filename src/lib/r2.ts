import { S3Client, PutObjectCommand, DeleteObjectCommand, HeadBucketCommand } from "@aws-sdk/client-s3";
import { env } from "./env";
import { getIntegrations } from "./integrations";
import crypto from "crypto";

export type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicUrl: string;
};

export async function getR2Config(): Promise<R2Config | null> {
  const integrations = await getIntegrations();
  const stored = integrations.r2;

  const accountId = stored?.accountId || env.r2.accountId();
  const accessKeyId = stored?.accessKeyId || env.r2.accessKeyId();
  const secretAccessKey = stored?.secretAccessKey || env.r2.secretAccessKey();
  const bucketName = stored?.bucketName || env.r2.bucketName();
  const publicUrl = (stored?.publicUrl || env.r2.publicUrl()).replace(/\/$/, "");

  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
    return null;
  }

  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucketName,
    publicUrl,
  };
}

export async function isR2Configured(): Promise<boolean> {
  const config = await getR2Config();
  return Boolean(config && config.publicUrl);
}

let cachedS3: S3Client | null = null;
let cachedKey = "";

export async function getR2Client(): Promise<{ s3: S3Client; bucketName: string; publicUrl: string } | null> {
  const config = await getR2Config();
  if (!config) return null;

  const cacheKey = `${config.accountId}:${config.accessKeyId}`;
  if (!cachedS3 || cachedKey !== cacheKey) {
    cachedS3 = new S3Client({
      region: "auto",
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
    cachedKey = cacheKey;
  }

  return {
    s3: cachedS3,
    bucketName: config.bucketName,
    publicUrl: config.publicUrl,
  };
}

/**
 * Uploads an image buffer to Cloudflare R2 and returns its public URL and object key.
 */
export async function uploadToR2(
  bytes: Buffer,
  options: { mimeType: string; folder: string; filename?: string },
): Promise<{ url: string; publicId: string }> {
  const clientInfo = await getR2Client();
  if (!clientInfo) {
    throw new Error("Cloudflare R2 is not fully configured.");
  }
  const { s3, bucketName, publicUrl } = clientInfo;

  const ext = options.mimeType.split("/")[1]?.replace("+xml", "") || "jpg";
  const uniqueId = crypto.randomUUID();
  const key = `${options.folder}/${uniqueId}.${ext}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: bytes,
      ContentType: options.mimeType,
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );

  return {
    url: `${publicUrl}/${key}`,
    publicId: key,
  };
}

/**
 * Deletes an asset from Cloudflare R2. Best-effort.
 */
export async function deleteFromR2(key: string): Promise<void> {
  const clientInfo = await getR2Client();
  if (!clientInfo) return;
  const { s3, bucketName } = clientInfo;

  try {
    await s3.send(
      new DeleteObjectCommand({
        Bucket: bucketName,
        Key: key,
      }),
    );
  } catch {
    // Best-effort delete; failures do not break the caller
  }
}
