import { after } from "next/server";
import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { storeUpload } from "@/lib/media";
import { differenceHash } from "@/lib/bulk-ai/image-prep";
import type { Prisma, ProductImportSourceKind } from "@/generated/prisma";
import { batchSetupSchema, type BatchSetup } from "./schema";
import { runCatalogWorker } from "./pipeline";

/**
 * Creating batches and adding photos to them. Photos go through the media
 * library (R2, checksum dedupe, compression) like every other upload, then
 * get a perceptual hash for duplicate detection.
 */

export async function createBatch(args: {
  name: string;
  sourceKind: ProductImportSourceKind;
  setup: Partial<BatchSetup>;
  createdById: string;
  sourceId?: string | null;
  profileId?: string | null;
}) {
  const setup = batchSetupSchema.parse(args.setup ?? {});
  return db.productImportBatch.create({
    data: {
      name: args.name.trim().slice(0, 120) || "Untitled import",
      sourceKind: args.sourceKind,
      status: "UPLOADING",
      setup: setup as unknown as Prisma.InputJsonValue,
      recipeId: setup.recipeId ?? null,
      sourceId: args.sourceId ?? setup.sourceId ?? null,
      profileId: args.profileId ?? null,
      createdById: args.createdById,
    },
    select: { id: true },
  });
}

export async function addPhotoToBatch(batchId: string, file: File, uploadedById: string) {
  const bytes = Buffer.from(await file.arrayBuffer());
  const checksum = createHash("sha256").update(bytes).digest("hex");
  const asset = await storeUpload(file, { folder: "products", uploadedById });
  const phash = await differenceHash(bytes).catch(() => null);
  const position = await db.productImportMedia.count({ where: { batchId } });

  const existing = await db.productImportMedia.findUnique({
    where: { batchId_mediaId: { batchId, mediaId: asset.id } },
    select: { id: true },
  });
  if (existing) return { id: existing.id, duplicate: true as const };

  const row = await db.productImportMedia.create({
    data: {
      batchId,
      mediaId: asset.id,
      url: asset.url,
      filename: (file.name || "photo").slice(0, 200),
      checksum,
      phash,
      position,
    },
    select: { id: true },
  });
  return { id: row.id, duplicate: false as const };
}

/**
 * Keeps the queue moving after the response is sent. Work also progresses
 * whenever the review page polls, on the cron endpoint, and in a dedicated
 * worker process if one is running.
 */
export function kickWorker(budgetMs = 25_000) {
  try {
    after(() => runCatalogWorker(budgetMs).then(() => undefined).catch(() => undefined));
  } catch {
    void runCatalogWorker(budgetMs).catch(() => undefined);
  }
}
