import { v2 as cloudinary } from "cloudinary";
import { getIntegrations } from "./integrations";

/**
 * The Cloudinary side of image storage.
 *
 * Nothing here is required: when no CDN is configured the media library keeps
 * the bytes in Postgres instead (see lib/media.ts). What used to live here —
 * writing uploads to public/uploads — is gone, because a container filesystem
 * loses them on the next deploy and Next never served them in production.
 */

export class UploadError extends Error {}

export async function isCdnConfigured(): Promise<boolean> {
  const { cloudinary: config } = await getIntegrations();
  return Boolean(config.cloudName && config.apiKey && config.apiSecret);
}

async function configure(): Promise<void> {
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
 *
 * `f_auto,q_auto` rides along as an eager transform so the CDN serves WebP or
 * AVIF to browsers that take it.
 */
export async function uploadToCloudinary(
  bytes: Buffer,
  options: { mimeType: string; folder: string },
): Promise<{ url: string; publicId: string; width: number; height: number }> {
  await configure();

  const dataUri = `data:${options.mimeType};base64,${bytes.toString("base64")}`;

  try {
    const result = await cloudinary.uploader.upload(dataUri, {
      folder: `laluxury/${options.folder}`,
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

/** Removes a CDN asset. Best-effort: a failure never blocks a delete. */
export async function deleteFromCloudinary(publicId: string): Promise<void> {
  if (!(await isCdnConfigured())) return;
  await configure();

  try {
    await cloudinary.uploader.destroy(publicId);
  } catch {
    // The library row is the source of truth; an orphaned CDN asset is cheap.
  }
}
