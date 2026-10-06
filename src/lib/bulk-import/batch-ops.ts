import { z } from "zod";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import type { Prisma } from "@/generated/prisma";
import { revalidateProductCatalog } from "@/lib/catalog-revalidate";
import { kickWorker } from "./create-batch";
import { cancelBatchJobs, enqueueJobs } from "./jobs";
import { forgetBatchContext, getBatchContext, IMPORT_CHUNK, prepareItem, queuePrepare, refreshSummary } from "./pipeline";
import { batchSetupSchema, pricingSpecSchema, stockSpecSchema, TARGET_FIELDS, type ItemOverrides } from "./schema";

/**
 * Batch operations shared by the web admin (server actions) and the mobile
 * owner app (/api/app/bulk-import). Callers check permissions; these never do.
 */

export type ActionResult<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; message: string };

const fail = (message: string): { ok: false; message: string } => ({ ok: false, message });

export async function ownBatch(batchId: string) {
  const batch = await db.productImportBatch.findUnique({ where: { id: batchId } });
  if (!batch) throw new Error("That import no longer exists.");
  return batch;
}

const mappingSchema = z.record(
  z.string(),
  z.string().refine((v) => v === "ignore" || v.startsWith("option:") || (TARGET_FIELDS as readonly string[]).includes(v), "Unknown field"),
);

const selectionSchema = z.object({ itemIds: z.array(z.string()).max(1000).optional() });

export async function startBatchProcessing(
  batchId: string,
  actorId: string,
  input: {
    setup: unknown;
    columnMapping?: Record<string, string> | null;
    saveProfile?: { sourceName: string; profileName: string } | null;
    sourceName?: string | null;
  },
): Promise<ActionResult> {
  const batch = await ownBatch(batchId);
  const setup = batchSetupSchema.safeParse(input.setup ?? {});
  if (!setup.success) return fail(setup.error.issues[0]?.message ?? "Check the setup.");

  let mapping = batch.columnMapping as Record<string, string> | null;
  if (input.columnMapping) {
    const parsed = mappingSchema.safeParse(input.columnMapping);
    if (!parsed.success) return fail("The column mapping has an unknown field.");
    mapping = parsed.data;
  }
  if (batch.sourceKind !== "PHOTOS" && !batch.fileData) return fail("Upload the spreadsheet first.");
  if (batch.sourceKind !== "PHOTOS" && (!mapping || !Object.values(mapping).some((v) => v !== "ignore"))) {
    return fail("Map at least one column.");
  }
  if (batch.sourceKind === "PHOTOS" && !(await db.productImportMedia.count({ where: { batchId } }))) {
    return fail("Upload some photos first.");
  }

  // Supplier identity: a named source makes repeat imports update, not duplicate.
  let sourceId = batch.sourceId;
  let profileId = batch.profileId;
  const sourceName = (input.saveProfile?.sourceName || input.sourceName || "").trim();
  if (sourceName) {
    const source = await db.catalogSource.upsert({
      where: { name: sourceName },
      create: { name: sourceName },
      update: {},
      select: { id: true },
    });
    sourceId = source.id;
    if (input.saveProfile?.profileName?.trim()) {
      const config = {
        columnMapping: mapping,
        recipeId: setup.data.recipeId ?? null,
        imageRole: setup.data.imageRole,
        pricing: setup.data.pricing,
        stock: setup.data.stock,
        options: setup.data.options,
        fieldAuthority: setup.data.fieldAuthority ?? null,
        defaults: { material: setup.data.defaults.material ?? null, care: setup.data.defaults.care ?? null },
      };
      const profile = await db.catalogSourceProfile.upsert({
        where: { sourceId_name: { sourceId: source.id, name: input.saveProfile.profileName.trim() } },
        create: { sourceId: source.id, name: input.saveProfile.profileName.trim(), config: config as Prisma.InputJsonValue },
        update: { config: config as Prisma.InputJsonValue },
        select: { id: true },
      });
      profileId = profile.id;
    }
  }

  await db.productImportBatch.update({
    where: { id: batchId },
    data: {
      setup: { ...setup.data, sourceId } as unknown as Prisma.InputJsonValue,
      recipeId: setup.data.recipeId ?? null,
      columnMapping: (mapping ?? undefined) as Prisma.InputJsonValue | undefined,
      sourceId,
      profileId,
      status: batch.sourceKind === "PHOTOS" ? "NORMALIZING" : "PARSING",
      startedAt: new Date(),
      error: null,
    },
  });
  forgetBatchContext(batchId);

  await enqueueJobs([
    batch.sourceKind === "PHOTOS"
      ? { type: "MATCH_MEDIA", batchId, dedupeKey: `group:${batchId}:${Date.now()}` }
      : { type: "PARSE_FILE", batchId, dedupeKey: `parse:${batchId}:${Date.now()}`, maxAttempts: 2 },
  ]);
  await recordAudit({ actorId: actorId, action: "bulk_import.start", entity: "ProductImportBatch", entityId: batchId });
  kickWorker();
  return { ok: true };
}

export async function importBatch(batchId: string, actorId: string, opts: { publish: boolean }): Promise<ActionResult<{ queued: number }>> {
  const batch = await ownBatch(batchId);
  if (batch.status === "CANCELLED") return fail("This import was cancelled.");
  const ready = await db.productImportItem.findMany({ where: { batchId, status: "READY" }, select: { id: true }, orderBy: { rowNumber: "asc" } });
  if (!ready.length) return fail("No items are ready to import.");

  const stamp = Date.now().toString(36);
  const jobs = [];
  for (let i = 0; i < ready.length; i += IMPORT_CHUNK) {
    jobs.push({
      type: "IMPORT_ITEMS" as const,
      batchId,
      payload: { itemIds: ready.slice(i, i + IMPORT_CHUNK).map((r) => r.id), actorId: actorId, publish: opts.publish },
      dedupeKey: `import:${batchId}:${stamp}:${i}`,
      maxAttempts: 3,
    });
  }
  await enqueueJobs(jobs);
  await db.productImportBatch.update({ where: { id: batchId }, data: { status: "IMPORTING" } });
  await recordAudit({
    actorId: actorId,
    action: "bulk_import.import",
    entity: "ProductImportBatch",
    entityId: batchId,
    after: { items: ready.length, publish: opts.publish },
  });
  kickWorker();
  return { ok: true, data: { queued: ready.length } };
}

export async function publishBatch(batchId: string, actorId: string, selection?: unknown): Promise<ActionResult<{ queued: number }>> {
  await ownBatch(batchId);
  const sel = selectionSchema.safeParse(selection ?? {});
  const where: Prisma.ProductImportItemWhereInput = { batchId, status: { in: ["IMPORTED", "UPDATED"] }, productId: { not: null } };
  if (sel.success && sel.data.itemIds?.length) where.id = { in: sel.data.itemIds };
  const items = await db.productImportItem.findMany({ where, select: { id: true } });
  if (!items.length) return fail("Nothing has been imported yet.");
  const stamp = Date.now().toString(36);
  const jobs = [];
  for (let i = 0; i < items.length; i += 200) {
    jobs.push({
      type: "PUBLISH_PRODUCT" as const,
      batchId,
      payload: { itemIds: items.slice(i, i + 200).map((r) => r.id), actorId: actorId },
      dedupeKey: `publish:${batchId}:${stamp}:${i}`,
    });
  }
  await enqueueJobs(jobs);
  kickWorker();
  try {
    revalidateProductCatalog();
  } catch {
    /* best effort */
  }
  return { ok: true, data: { queued: items.length } };
}

export async function retryFailedItems(batchId: string): Promise<ActionResult<{ count: number }>> {
  const batch = await ownBatch(batchId);
  const failed = await db.productImportItem.findMany({
    where: { batchId, OR: [{ status: "FAILED" }, { aiStatus: "FAILED" }] },
    select: { id: true },
  });
  if (!failed.length) return fail("Nothing has failed.");
  await db.productImportItem.updateMany({
    where: { id: { in: failed.map((f) => f.id) }, aiStatus: "FAILED" },
    data: { aiStatus: null, attempts: { increment: 1 } },
  });
  await db.productImportItem.updateMany({ where: { id: { in: failed.map((f) => f.id) }, status: "FAILED" }, data: { status: "PENDING" } });
  if (["COMPLETED", "PARTIAL", "FAILED"].includes(batch.status)) {
    await db.productImportBatch.update({ where: { id: batchId }, data: { status: "VALIDATING" } });
  }
  await queuePrepare(batchId, failed.map((f) => f.id));
  kickWorker();
  return { ok: true, data: { count: failed.length } };
}

export async function cancelBatch(batchId: string, actorId: string): Promise<ActionResult> {
  await ownBatch(batchId);
  await cancelBatchJobs(batchId);
  await db.productImportBatch.update({ where: { id: batchId }, data: { status: "CANCELLED", fileData: null } });
  await recordAudit({ actorId: actorId, action: "bulk_import.cancel", entity: "ProductImportBatch", entityId: batchId });
  return { ok: true };
}

const itemEditSchema = z.object({
  title: z.string().max(160).optional(),
  shortDescription: z.string().max(400).optional(),
  description: z.string().max(5000).optional(),
  metaTitle: z.string().max(80).optional(),
  metaDescription: z.string().max(200).optional(),
  material: z.string().max(120).optional(),
  care: z.string().max(400).optional(),
  price: z.number().int().nonnegative().nullable().optional(),
  stock: z.number().int().nonnegative().nullable().optional(),
  disabledCombinations: z.array(z.string()).optional(),
  pricing: pricingSpecSchema.optional(),
  stockSpec: stockSpecSchema.optional(),
  categoryIds: z.array(z.string()).optional(),
  /** Leave this item out of the import (or bring it back). */
  skip: z.boolean().optional(),
});

/** One item's edits, re-validated immediately so the row updates in place. */
export async function editImportItem(itemId: string, input: unknown): Promise<ActionResult<{ batchId: string }>> {
  const parsed = itemEditSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the values.");
  const item = await db.productImportItem.findUnique({ where: { id: itemId } });
  if (!item) return fail("That item no longer exists.");
  if (["IMPORTED", "UPDATED", "IMPORTING"].includes(item.status)) return fail("That item is already in the catalog.");

  const { skip, ...edits } = parsed.data;
  const next: ItemOverrides = { ...((item.overrides ?? {}) as ItemOverrides) };
  for (const [k, v] of Object.entries(edits)) {
    if (v === undefined) continue;
    if (v === null || v === "") delete (next as Record<string, unknown>)[k];
    else (next as Record<string, unknown>)[k] = v;
  }
  if (skip === true) next.skip = true;
  if (skip === false) delete next.skip;
  const updated = await db.productImportItem.update({
    where: { id: itemId },
    data: {
      overrides: next as Prisma.InputJsonValue,
      ...(skip === false && item.status === "SKIPPED" ? { status: "PENDING", action: "CREATE" } : {}),
    },
  });
  forgetBatchContext(updated.batchId);
  const ctx = await getBatchContext(updated.batchId);
  await prepareItem(ctx, updated);
  await refreshSummary(updated.batchId);
  return { ok: true, data: { batchId: updated.batchId } };
}
