import { createHash } from "node:crypto";
import { db } from "./db";
import { UploadError, deleteFromCloudinary, isCdnConfigured, uploadToCloudinary } from "./cdn";
import {
  ALLOWED_IMAGE_TYPES,
  EXTENSION_FOR_TYPE,
  MAX_UPLOAD_BYTES,
  mediaPath,
} from "./media-format";
import type { Prisma } from "@/generated/prisma";

/**
 * The media library.
 *
 * One row per picture the store owns, whatever is behind it:
 *
 *   DATABASE — the bytes are in Postgres and are served from /api/media/<id>
 *   CDN      — Cloudinary holds them and `url` is the delivered asset
 *   EXTERNAL — somebody pasted a link and only the address is ours
 *
 * Postgres is the default because it is the one store that survives a deploy
 * on a host with an ephemeral filesystem. Wire up Cloudinary in Settings and
 * new uploads go there instead; everything already in the library keeps
 * working either way.
 */

export { MAX_UPLOAD_BYTES, UploadError, mediaPath };

/** Everything about an asset except the bytes, which are never listed. */
export const mediaSummarySelect = {
  id: true,
  source: true,
  url: true,
  filename: true,
  mimeType: true,
  alt: true,
  folder: true,
  size: true,
  width: true,
  height: true,
  createdAt: true,
} satisfies Prisma.MediaAssetSelect;

export type MediaSummary = Prisma.MediaAssetGetPayload<{
  select: typeof mediaSummarySelect;
}>;

export type MediaListItem = MediaSummary & { usedBy: number };

/**
 * Width and height read straight from the file header.
 *
 * Enough for the library to label a picture and for a gallery to reserve the
 * right box; an unreadable header just means the size is unknown, never a
 * failed upload. AVIF is not parsed — its header is a box tree, and zero is a
 * fine answer here.
 */
export function probeDimensions(bytes: Buffer): { width: number; height: number } {
  const none = { width: 0, height: 0 };
  if (bytes.length < 24) return none;

  // PNG: IHDR is always the first chunk.
  if (bytes.readUInt32BE(0) === 0x89504e47) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }

  // GIF: logical screen descriptor, little-endian.
  if (bytes.toString("ascii", 0, 3) === "GIF") {
    return { width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) };
  }

  // WebP: RIFF container, three possible chunk layouts.
  if (bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") {
    const chunk = bytes.toString("ascii", 12, 16);

    if (chunk === "VP8 " && bytes.length > 29) {
      return {
        width: bytes.readUInt16LE(26) & 0x3fff,
        height: bytes.readUInt16LE(28) & 0x3fff,
      };
    }

    if (chunk === "VP8L" && bytes.length > 25) {
      const bits = bytes.readUInt32LE(21);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }

    if (chunk === "VP8X" && bytes.length > 30) {
      const width = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16));
      const height = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16));
      return { width, height };
    }

    return none;
  }

  // JPEG: walk the segments to the start-of-frame that carries the size.
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;

    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }

      const marker = bytes[offset + 1];
      // SOF0–SOF15, minus the markers in that range that are not frame headers.
      const isFrame =
        marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);

      if (isFrame) {
        return {
          width: bytes.readUInt16BE(offset + 7),
          height: bytes.readUInt16BE(offset + 5),
        };
      }

      const length = bytes.readUInt16BE(offset + 2);
      if (length < 2) break;
      offset += 2 + length;
    }
  }

  return none;
}

function assertUploadable(file: File): void {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new UploadError(`${file.type || "That file"} is not an image we can upload.`);
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    throw new UploadError(
      `That image is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is ${
        MAX_UPLOAD_BYTES / 1024 / 1024
      } MB.`,
    );
  }
}

/**
 * Takes one uploaded file into the library and returns the row.
 *
 * The same picture uploaded twice returns the row that already exists — the
 * checksum sees to that — so re-adding a photo does not fill the library with
 * copies of it.
 */
export async function storeUpload(
  file: File,
  options: { folder?: string; alt?: string | null; uploadedById?: string | null } = {},
): Promise<MediaSummary> {
  assertUploadable(file);

  const folder = options.folder ?? "products";
  const bytes = Buffer.from(await file.arrayBuffer());
  const checksum = createHash("sha256").update(bytes).digest("hex");

  const existing = await db.mediaAsset.findUnique({
    where: { checksum },
    select: mediaSummarySelect,
  });
  if (existing) return existing;

  const { width, height } = probeDimensions(bytes);
  const filename = (file.name || "image").slice(0, 180);

  if (await isCdnConfigured()) {
    const uploaded = await uploadToCloudinary(bytes, { mimeType: file.type, folder });

    return db.mediaAsset.create({
      data: {
        source: "CDN",
        url: uploaded.url,
        publicId: uploaded.publicId,
        filename,
        mimeType: file.type,
        alt: options.alt || null,
        folder,
        size: bytes.length,
        width: uploaded.width || width,
        height: uploaded.height || height,
        checksum,
        uploadedById: options.uploadedById ?? null,
      },
      select: mediaSummarySelect,
    });
  }

  // The URL has to name the row, so the row is created first and then told
  // where it lives. Both statements are one transaction: a half-written asset
  // would show up in the library as a picture that cannot load.
  return db.$transaction(async (tx) => {
    const created = await tx.mediaAsset.create({
      data: {
        source: "DATABASE",
        url: "",
        filename,
        mimeType: file.type,
        alt: options.alt || null,
        folder,
        size: bytes.length,
        width,
        height,
        data: bytes,
        checksum,
        uploadedById: options.uploadedById ?? null,
      },
      select: { id: true },
    });

    return tx.mediaAsset.update({
      where: { id: created.id },
      data: { url: mediaPath(created.id, file.type) },
      select: mediaSummarySelect,
    });
  });
}

/** Records a link someone pasted, so it is in the library like anything else. */
export async function registerExternalUrl(
  url: string,
  options: { folder?: string; alt?: string | null; uploadedById?: string | null } = {},
): Promise<MediaSummary> {
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new UploadError("The URL must start with http or https.");
  }

  const existing = await db.mediaAsset.findFirst({
    where: { url: trimmed },
    select: mediaSummarySelect,
  });
  if (existing) return existing;

  const path = trimmed.split("?")[0];
  const filename = path.slice(path.lastIndexOf("/") + 1) || "image";
  const extension = filename.slice(filename.lastIndexOf(".") + 1).toLowerCase();
  const mimeType =
    Object.entries(EXTENSION_FOR_TYPE).find(([, ext]) => ext === extension)?.[0] ?? "image/jpeg";

  return db.mediaAsset.create({
    data: {
      source: "EXTERNAL",
      url: trimmed,
      filename: filename.slice(0, 180),
      mimeType,
      alt: options.alt || null,
      folder: options.folder ?? "products",
      uploadedById: options.uploadedById ?? null,
    },
    select: mediaSummarySelect,
  });
}

export type MediaQuery = {
  query?: string;
  folder?: string;
  take?: number;
  skip?: number;
};

function whereFor({ query, folder }: MediaQuery): Prisma.MediaAssetWhereInput {
  const where: Prisma.MediaAssetWhereInput = {};

  if (folder && folder !== "all") where.folder = folder;

  const term = query?.trim();
  if (term) {
    where.OR = [
      { filename: { contains: term, mode: "insensitive" } },
      { alt: { contains: term, mode: "insensitive" } },
      { url: { contains: term, mode: "insensitive" } },
    ];
  }

  return where;
}

/** Newest first, with the number of product galleries each picture is in. */
export async function listMedia(
  options: MediaQuery = {},
): Promise<{ items: MediaListItem[]; total: number }> {
  const where = whereFor(options);

  const [rows, total] = await Promise.all([
    db.mediaAsset.findMany({
      where,
      select: { ...mediaSummarySelect, _count: { select: { productImages: true } } },
      orderBy: { createdAt: "desc" },
      take: options.take ?? 60,
      skip: options.skip ?? 0,
    }),
    db.mediaAsset.count({ where }),
  ]);

  const items = rows.map(({ _count, ...asset }) => ({ ...asset, usedBy: _count.productImages }));
  return { items, total };
}

/** Removes an asset from the library, and from the CDN when it lived there. */
export async function deleteMedia(id: string): Promise<void> {
  const asset = await db.mediaAsset.findUnique({
    where: { id },
    select: { id: true, publicId: true, source: true },
  });
  if (!asset) return;

  if (asset.source === "CDN" && asset.publicId) {
    await deleteFromCloudinary(asset.publicId);
  }

  await db.mediaAsset.delete({ where: { id } });
}

/**
 * Product pictures still pointing at the old public/uploads path.
 *
 * Those files were written to a container filesystem and are gone, so the rows
 * render as a broken box. The console offers to clear them out.
 */
export async function countBrokenUploadLinks(): Promise<number> {
  return db.productImage.count({ where: { url: { startsWith: "/uploads/" } } });
}

export async function clearBrokenUploadLinks(): Promise<number> {
  const { count } = await db.productImage.deleteMany({
    where: { url: { startsWith: "/uploads/" } },
  });
  return count;
}
