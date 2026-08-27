import { v2 as cloudinary } from "cloudinary";
import { getIntegrations } from "./integrations";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

/**
 * Product image uploads.
 *
 * Cloudinary is the preferred durable store, but when it is not configured
 * images fall back to local storage under public/uploads — so uploads work
 * anywhere, including local dev and hosts with persistent disks.
 */

export class UploadError extends Error {}

/** 8 MB, comfortably under Cloudinary's free-tier limit and Next's body cap. */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"]);

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
};

export async function isCdnConfigured(): Promise<boolean> {
  const { cloudinary: config } = await getIntegrations();
  return Boolean(config.cloudName && config.apiKey && config.apiSecret);
}

function publicUploadsPath(...parts: string[]): string {
  return join(process.cwd(), "public", "uploads", ...parts);
}

async function saveImageLocally(
  file: File,
  folder: string,
): Promise<{ url: string; publicId: string; width: number; height: number }> {
  const ext = EXT[file.type] ?? "bin";
  const publicId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const dir = publicUploadsPath(folder);
  await mkdir(dir, { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(join(dir, `${publicId}.${ext}`), buffer);

  return {
    url: `/uploads/${folder}/${publicId}.${ext}`,
    publicId: `${folder}/${publicId}`,
    width: 0,
    height: 0,
  };
}

/**
 * Uploads one image and returns its delivered URL.
 *
 * Uses Cloudinary when configured; otherwise saves locally under
 * public/uploads. `f_auto,q_auto` is applied through the eager transform
 * so the CDN serves WebP or AVIF to browsers that take it.
 */
export async function uploadImage(
  file: File,
  options: { folder?: string } = {},
): Promise<{ url: string; publicId: string; width: number; height: number }> {
  if (!ALLOWED.has(file.type)) {
    throw new UploadError(`${file.type || "That file"} is not an image we can upload.`);
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    throw new UploadError(
      `That image is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`,
    );
  }

  const folder = options.folder ?? "products";

  if (await isCdnConfigured()) {
    return uploadToCloudinary(file, folder);
  }

  return saveImageLocally(file, folder);
}

async function uploadToCloudinary(
  file: File,
  folder: string,
): Promise<{ url: string; publicId: string; width: number; height: number }> {
  const { cloudinary: config } = await getIntegrations();

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
      folder: `laluxury/${folder}`,
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

/** Removes an image. Best-effort: a failure never blocks a delete. */
export async function deleteImage(publicId: string): Promise<void> {
  if (await isCdnConfigured()) {
    const { cloudinary: config } = await getIntegrations();
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
    return;
  }

  // Local file: publicId is the path under public/uploads.
  try {
    const { unlink } = await import("node:fs/promises");
    await unlink(publicUploadsPath(publicId));
  } catch {
    // Already gone — nothing to do.
  }
}
