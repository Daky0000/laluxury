import sharp from "sharp";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

/**
 * A temporary, AI-only copy of a catalog photo: auto-rotated, metadata
 * stripped (sharp drops EXIF unless asked to keep it), at most 1280px on the
 * long edge, WebP. The storefront original is never touched.
 *
 * Only ProductImportMedia → MediaAsset images reach here, so only catalog
 * photos are ever sent to a model.
 */
export async function prepareAiImage(mediaId: string): Promise<{ dataUrl: string; bytes: number }> {
  const asset = await db.mediaAsset.findUnique({
    where: { id: mediaId },
    select: { url: true, data: true, folder: true },
  });
  if (!asset) throw new Error("Source image is missing.");

  let original: Buffer;
  if (asset.data) {
    original = Buffer.from(asset.data);
  } else {
    const url = asset.url.startsWith("http") ? asset.url : `${env.siteUrl()}${asset.url}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`Source image could not be fetched (${res.status}).`);
    original = Buffer.from(await res.arrayBuffer());
  }

  const out = await sharp(original)
    .rotate()
    .resize({ width: 1280, height: 1280, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 72 })
    .toBuffer();

  return { dataUrl: `data:image/webp;base64,${out.toString("base64")}`, bytes: out.length };
}

/**
 * 64-bit difference hash. Two photos of the same thing — re-saved, resized,
 * lightly recompressed — land within a few bits of each other.
 */
export async function differenceHash(input: Buffer): Promise<string> {
  const pixels = await sharp(input).rotate().greyscale().resize(9, 8, { fit: "fill" }).raw().toBuffer();
  let hex = "";
  let nibble = 0;
  for (let i = 0; i < 64; i++) {
    const y = Math.floor(i / 8);
    const x = i % 8;
    nibble = (nibble << 1) | (pixels[y * 9 + x] > pixels[y * 9 + x + 1] ? 1 : 0);
    if (i % 4 === 3) {
      hex += nibble.toString(16);
      nibble = 0;
    }
  }
  return hex;
}

export function hammingDistance(a: string, b: string): number {
  let count = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) {
      count += x & 1;
      x >>= 1;
    }
  }
  return count;
}
