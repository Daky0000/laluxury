import { v2 as cloudinary } from "cloudinary";
import { getIntegrations } from "./integrations";

/**
 * Product image uploads.
 *
 * Railway containers are ephemeral, so anything written to disk disappears on
 * the next deploy — uploads have to go somewhere durable. Cloudinary is that
 * somewhere, configured from the console rather than the environment.
 */

export class UploadError extends Error {}

/** 8 MB, comfortably under Cloudinary's free-tier limit and Next's body cap. */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"]);

export async function isCdnConfigured(): Promise<boolean> {
  const { cloudinary: config } = await getIntegrations();
  return Boolean(config.cloudName && config.apiKey && config.apiSecret);
}

/**
 * Uploads one image and returns its delivered URL.
 *
 * `f_auto,q_auto` is applied through the eager transform so the CDN serves
 * WebP or AVIF to browsers that take it, without the caller thinking about it.
 */
export async function uploadImage(
  file: File,
  options: { folder?: string } = {},
): Promise<{ url: string; publicId: string; width: number; height: number }> {
  const { cloudinary: config } = await getIntegrations();

  if (!config.cloudName || !config.apiKey || !config.apiSecret) {
    throw new UploadError(
      "The image CDN is not configured. Add Cloudinary details under Settings → Integrations, or paste an image URL instead.",
    );
  }

  if (!ALLOWED.has(file.type)) {
    throw new UploadError(`${file.type || "That file"} is not an image we can upload.`);
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    throw new UploadError(
      `That image is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`,
    );
  }

  cloudinary.config({
    cloud_name: config.cloudName,
    api_key: config.apiKey,
    api_secret: config.apiSecret,
    secure: true,
  });

  const buffer = Buffer.from(await file.arrayBuffer());
  const dataUri = `data:${file.type};base64,${buffer.toString("base64")}`;

  try {
    const result = await cloudinary.uploader.upload(dataUri, {
      folder: options.folder ?? "laluxury/products",
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

/** Removes an image from the CDN. Best-effort: a failure never blocks a delete. */
export async function deleteImage(publicId: string): Promise<void> {
  const { cloudinary: config } = await getIntegrations();
  if (!config.cloudName || !config.apiSecret) return;

  cloudinary.config({
    cloud_name: config.cloudName,
    api_key: config.apiKey,
    api_secret: config.apiSecret,
    secure: true,
  });

  try {
    await cloudinary.uploader.destroy(publicId);
  } catch {
    // The product row is the source of truth; an orphaned CDN asset is cheap.
  }
}
