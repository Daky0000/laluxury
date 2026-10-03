import { v2 as cloudinary } from "cloudinary";
import { getIntegrations } from "./integrations";
import { isR2Configured, uploadToR2, deleteFromR2 } from "./r2";

/**
 * Image storage & delivery via Cloudflare R2 or Cloudinary.
 *
 * Prioritizes Cloudflare R2 ($0 egress fees, 10GB free tier).
 * Falls back to Cloudinary if R2 is not configured.
 * When neither is configured, the media library stores bytes in Postgres (see lib/media.ts).
 */

export class UploadError extends Error {}

export async function isCdnConfigured(): Promise<boolean> {
  if (await isR2Configured()) return true;
  const { cloudinary: config } = await getIntegrations();
  return Boolean(config.cloudName && config.apiKey && config.apiSecret);
}

export async function getActiveCdnProvider(): Promise<"r2" | "cloudinary" | null> {
  if (await isR2Configured()) return "r2";
  const { cloudinary: config } = await getIntegrations();
  if (config.cloudName && config.apiKey && config.apiSecret) return "cloudinary";
  return null;
}

export async function uploadToCdn(
  bytes: Buffer,
  options: { mimeType: string; folder: string; width?: number; height?: number },
): Promise<{ url: string; publicId: string; width: number; height: number }> {
  const provider = await getActiveCdnProvider();

  if (provider === "r2") {
    try {
      const result = await uploadToR2(bytes, options);
      return {
        url: result.url,
        publicId: result.publicId,
        width: options.width || 0,
        height: options.height || 0,
      };
    } catch (error) {
      throw new UploadError(
        error instanceof Error ? error.message : "Cloudflare R2 upload failed.",
      );
    }
  }

  if (provider === "cloudinary") {
    return uploadToCloudinary(bytes, options);
  }

  throw new UploadError("No CDN or storage provider configured.");
}

export async function deleteFromCdn(publicId: string): Promise<void> {
  if (await isR2Configured()) {
    await deleteFromR2(publicId);
  }
  await deleteFromCloudinary(publicId);
}

async function configureCloudinary(): Promise<void> {
  const { cloudinary: config } = await getIntegrations();
  cloudinary.config({
    cloud_name: config.cloudName,
    api_key: config.apiKey,
    api_secret: config.apiSecret,
    secure: true,
  });
}

/**
 * Sends bytes to Cloudinary and returns what was delivered.
 */
export async function uploadToCloudinary(
  bytes: Buffer,
  options: { mimeType: string; folder: string },
): Promise<{ url: string; publicId: string; width: number; height: number }> {
  await configureCloudinary();

  const dataUri = `data:${options.mimeType};base64,${bytes.toString("base64")}`;

  try {
    const result = await cloudinary.uploader.upload(dataUri, {
      folder: `nobleenclave/${options.folder}`,
      resource_type: "image",
      overwrite: false,
      unique_filename: true,
      transformation: [{ fetch_format: "auto", quality: "auto" }],
    });

    return {
      url: result.secure_url,
      publicId: result.public_id,
      width: result.width,
      height: result.height,
    };
  } catch (error) {
    throw new UploadError(
      error instanceof Error ? error.message : "The upload failed. Try again.",
    );
  }
}

/** Removes a Cloudinary asset. Best-effort. */
export async function deleteFromCloudinary(publicId: string): Promise<void> {
  const { cloudinary: config } = await getIntegrations();
  if (!config.cloudName || !config.apiSecret) return;
  await configureCloudinary();

  try {
    await cloudinary.uploader.destroy(publicId);
  } catch {
    // The library row is the source of truth; an orphaned CDN asset is cheap.
  }
}
