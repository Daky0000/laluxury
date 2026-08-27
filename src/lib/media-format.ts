/**
 * The parts of the media library that both sides need.
 *
 * Kept apart from lib/media.ts on purpose: that module reaches for Postgres and
 * the Cloudinary SDK, and the console's upload widgets are client components.
 */

/** 8 MB, comfortably under Cloudinary's free-tier limit. */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
]);

/** What a file input should accept, from the one list that decides. */
export const UPLOAD_ACCEPT = [...ALLOWED_IMAGE_TYPES].join(",");

export const EXTENSION_FOR_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
  "image/svg+xml": "svg",
};

/** Folders the console offers; anything else still lists under "All". */
export const MEDIA_FOLDERS = ["products", "store", "categories", "collections"] as const;

/** Where a picture stored in Postgres is served from. */
export function mediaPath(id: string, mimeType: string): string {
  const ext = EXTENSION_FOR_TYPE[mimeType] ?? "img";
  return `/api/media/${id}.${ext}`;
}

export function humanSize(bytes: number): string {
  if (bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
