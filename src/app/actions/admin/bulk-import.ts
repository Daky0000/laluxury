"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import type { Prisma } from "@/generated/prisma";
import { revalidateProductCatalog } from "@/lib/catalog-revalidate";
import { runBulkAiTask } from "@/lib/bulk-ai/router";
import { normalizeValuesPrompt, parseInstructionPrompt } from "@/lib/bulk-ai/prompts";
import { batchInstructionSchema, normalizeValueSchema, type BatchInstruction } from "@/lib/bulk-ai/schemas";
import { errorMessage } from "@/lib/bulk-ai/retry";
import { getBulkAiConfig } from "@/lib/bulk-ai/model-registry";
import { createBatch, kickWorker } from "@/lib/bulk-import/create-batch";
import { cancelBatchJobs, enqueueJobs } from "@/lib/bulk-import/jobs";
import { forgetBatchContext, getBatchContext, IMPORT_CHUNK, prepareItem, queuePrepare, readSetup, refreshSummary } from "@/lib/bulk-import/pipeline";
import { itemWhere } from "@/lib/bulk-import/review-query";
import { simulateImport, type Simulation } from "@/lib/bulk-import/import-simulation";
import {
  batchSetupSchema,
  optionSpecSchema,
  pricingSpecSchema,
  stockSpecSchema,
  TARGET_FIELDS,
  type BatchSetup,
  type ItemDraft,
  type ItemOverrides,
} from "@/lib/bulk-import/schema";

export type ActionResult<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; message: string };

const fail = (message: string): { ok: false; message: string } => ({ ok: false, message });

async function ownBatch(batchId: string) {
  const batch = await db.productImportBatch.findUnique({ where: { id: batchId } });
  if (!batch) throw new Error("That import no longer exists.");
  return batch;
}

function revalidateBatch(batchId: string) {
  revalidatePath(`/admin/products/bulk-add/${batchId}`);
  revalidatePath("/admin/products/bulk-add/history");
}

// --- Batch setup ---------------------------------------------------------------

export async function createBatchAction(input: {
  name: string;
  sourceKind: "PHOTOS" | "SPREADSHEET" | "PHOTOS_SPREADSHEET";
  setup: unknown;
}): Promise<ActionResult<{ batchId: string }>> {
  const user = await requirePermission("products:write");
  const setup = batchSetupSchema.safeParse(input.setup ?? {});
  if (!setup.success) return fail(setup.error.issues[0]?.message ?? "Check the setup.");
  const batch = await createBatch({
    name: input.name,
    sourceKind: input.sourceKind,
    setup: setup.data,
    createdById: user.id,
  });
  await recordAudit({ actorId: user.id, action: "bulk_import.create", entity: "ProductImportBatch", entityId: batch.id });
  return { ok: true, data: { batchId: batch.id } };
}

export async function updateBatchSetupAction(batchId: string, setupInput: unknown): Promise<ActionResult> {
  await requirePermission("products:write");
  const setup = batchSetupSchema.safeParse(setupInput ?? {});
  if (!setup.success) return fail(setup.error.issues[0]?.message ?? "Check the setup.");
  const batch = await ownBatch(batchId);
  if (["IMPORTING", "COMPLETED", "CANCELLED"].includes(batch.status)) return fail("This import can no longer be changed.");
  await db.productImportBatch.update({
    where: { id: batchId },
    data: { setup: setup.data as unknown as Prisma.InputJsonValue, recipeId: setup.data.recipeId ?? null },
  });
  forgetBatchContext(batchId);
  return { ok: true };
}

const mappingSchema = z.record(
  z.string(),
  z.string().refine((v) => v === "ignore" || v.startsWith("option:") || (TARGET_FIELDS as readonly string[]).includes(v), "Unknown field"),
);

/**
 * "Prepare products": saves the setup and mapping, optionally saves the
 * mapping as an import profile, and queues the work.
 */
export async function startProcessingAction(
  batchId: string,
  input: {
    setup: unknown;
    columnMapping?: Record<string, string> | null;
    saveProfile?: { sourceName: string; profileName: string } | null;
    sourceName?: string | null;
  },
): Promise<ActionResult> {
  const user = await requirePermission("products:write");
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
  await recordAudit({ actorId: user.id, action: "bulk_import.start", entity: "ProductImportBatch", entityId: batchId });
  kickWorker();
  return { ok: true };
}

/** Natural-language setup: the extracted facts are shown to the owner before use. */
export async function parseInstructionAction(text: string): Promise<ActionResult<BatchInstruction>> {
  await requirePermission("products:write");
  const note = text.trim().slice(0, 2000);
  if (!note) return fail("Write a note first.");
  const [recipes, options] = await Promise.all([
    db.productRecipe.findMany({ where: { isActive: true }, select: { name: true } }),
    db.catalogOptionDefinition.findMany({ select: { name: true } }),
  ]);
  try {
    const prompt = parseInstructionPrompt(note, recipes.map((r) => r.name), options.map((o) => o.name));
    const { value } = await runBulkAiTask({
      task: "PARSE_BATCH_INSTRUCTION",
      schema: batchInstructionSchema,
      system: prompt.system,
      user: prompt.user,
      cacheKey: note,
    });
    return { ok: true, data: value };
  } catch (error) {
    return fail(`AI could not read the note: ${errorMessage(error)}`);
  }
}

// --- Review: selections and bulk fixes ------------------------------------------

const selectionSchema = z.object({
  itemIds: z.array(z.string()).max(1000).optional(),
  /** Everything in a filter, not just the visible rows. */
  filter: z.object({ status: z.string().optional(), issue: z.string().optional(), q: z.string().optional() }).optional(),
});
type Selection = z.infer<typeof selectionSchema>;

async function selectedIds(batchId: string, selection: Selection): Promise<string[]> {
  if (selection.itemIds?.length) {
    const rows = await db.productImportItem.findMany({
      where: { batchId, id: { in: selection.itemIds } },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }
  const rows = await db.productImportItem.findMany({
    where: { ...itemWhere(batchId, selection.filter), status: { notIn: ["IMPORTED", "UPDATED", "IMPORTING"] } },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

const bulkOpSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("SET_CATEGORY"), categoryIds: z.array(z.string()) }),
  z.object({ op: z.literal("SET_COLLECTION"), collectionIds: z.array(z.string()) }),
  z.object({ op: z.literal("SET_PRICE"), price: z.number().int().nonnegative() }),
  z.object({ op: z.literal("SET_STOCK"), stock: z.number().int().nonnegative() }),
  z.object({ op: z.literal("SET_MATERIAL"), material: z.string().max(120) }),
  z.object({ op: z.literal("ADD_TAG"), tags: z.array(z.string().max(40)) }),
  z.object({
    op: z.literal("REPLACE_OPTION_VALUE"),
    option: z.string(),
    from: z.string(),
    to: z.string().min(1),
    saveRule: z.boolean().optional(),
  }),
  z.object({ op: z.literal("SET_OPTIONS"), options: z.array(optionSpecSchema) }),
  z.object({ op: z.literal("APPLY_RECIPE"), recipeId: z.string() }),
  z.object({ op: z.literal("RERUN_AI") }),
  z.object({ op: z.literal("SKIP") }),
  z.object({ op: z.literal("UNSKIP") }),
  z.object({ op: z.literal("MARK_REVIEWED") }),
  z.object({ op: z.literal("FORCE_CREATE") }),
  z.object({ op: z.literal("MERGE") }),
]);
export type BulkOp = z.infer<typeof bulkOpSchema>;

export async function bulkFixAction(batchId: string, selectionInput: unknown, opInput: unknown): Promise<ActionResult<{ count: number }>> {
  const user = await requirePermission("products:write");
  const selection = selectionSchema.safeParse(selectionInput);
  const op = bulkOpSchema.safeParse(opInput);
  if (!selection.success || !op.success) return fail("That change is not valid.");
  await ownBatch(batchId);
  const ids = await selectedIds(batchId, selection.data);
  if (!ids.length) return fail("Nothing selected.");
  const o = op.data;

  if (o.op === "MERGE") {
    // Several inbox items are one product: their photos become one gallery.
    const [target, ...rest] = ids;
    await db.productImportMedia.updateMany({ where: { itemId: { in: rest } }, data: { itemId: target } });
    await db.productImportItem.updateMany({ where: { id: { in: rest } }, data: { status: "SKIPPED", action: "SKIP" } });
    await mergeOverrides([target], { reviewed: true });
    await queuePrepare(batchId, [target]);
  } else if (o.op === "APPLY_RECIPE") {
    const recipe = await db.productRecipe.findUnique({ where: { id: o.recipeId } });
    if (!recipe) return fail("That recipe no longer exists.");
    const { recipeConfigSchema } = await import("@/lib/bulk-import/schema");
    const cfg = recipeConfigSchema.parse(recipe.config ?? {});
    await mergeOverrides(ids, {
      options: cfg.options,
      pricing: cfg.pricing,
      stockSpec: cfg.inventory,
      ...(cfg.categoryIds.length ? { categoryIds: cfg.categoryIds } : {}),
      ...(cfg.material ? { material: cfg.material } : {}),
      ...(cfg.care ? { care: cfg.care } : {}),
    });
  } else if (o.op === "RERUN_AI") {
    await db.productImportItem.updateMany({ where: { id: { in: ids } }, data: { aiStatus: null, attempts: { increment: 1 } } });
  } else if (o.op === "REPLACE_OPTION_VALUE") {
    const items = await db.productImportItem.findMany({ where: { id: { in: ids } }, select: { id: true, overrides: true } });
    for (const item of items) {
      const ov = (item.overrides ?? {}) as ItemOverrides;
      const repl = { ...(ov.valueReplacements ?? {}) };
      repl[o.option] = { ...(repl[o.option] ?? {}), [o.from]: o.to };
      await db.productImportItem.update({
        where: { id: item.id },
        data: { overrides: { ...ov, valueReplacements: repl } as Prisma.InputJsonValue },
      });
    }
    if (o.saveRule) {
      await db.catalogNormalizationRule.upsert({
        where: { field_fromValue_sourceKey: { field: o.option, fromValue: o.from, sourceKey: "" } },
        create: { field: o.option, fromValue: o.from, toValue: o.to },
        update: { toValue: o.to },
      });
    }
  } else {
    const patch: ItemOverrides =
      o.op === "SET_CATEGORY" ? { categoryIds: o.categoryIds }
      : o.op === "SET_COLLECTION" ? { collectionIds: o.collectionIds }
      : o.op === "SET_PRICE" ? { price: o.price }
      : o.op === "SET_STOCK" ? { stock: o.stock }
      : o.op === "SET_MATERIAL" ? { material: o.material }
      : o.op === "ADD_TAG" ? { addTags: o.tags }
      : o.op === "SET_OPTIONS" ? { options: o.options }
      : o.op === "SKIP" ? { skip: true }
      : o.op === "UNSKIP" ? { skip: false }
      : o.op === "MARK_REVIEWED" ? { reviewed: true, acceptDuplicate: true }
      : { forceCreate: true };
    await mergeOverrides(ids, patch);
    if (o.op === "UNSKIP") {
      await db.productImportItem.updateMany({ where: { id: { in: ids }, status: "SKIPPED" }, data: { status: "PENDING", action: "CREATE" } });
    }
  }

  if (o.op !== "MERGE") await queuePrepare(batchId, ids);
  await recordAudit({
    actorId: user.id,
    action: "bulk_import.fix",
    entity: "ProductImportBatch",
    entityId: batchId,
    after: { op: o.op, count: ids.length },
  });
  forgetBatchContext(batchId);
  kickWorker();
  revalidateBatch(batchId);
  return { ok: true, data: { count: ids.length } };
}

async function mergeOverrides(ids: string[], patch: ItemOverrides) {
  for (let i = 0; i < ids.length; i += 500) {
    const items = await db.productImportItem.findMany({ where: { id: { in: ids.slice(i, i + 500) } }, select: { id: true, overrides: true } });
    for (const item of items) {
      const current = (item.overrides ?? {}) as ItemOverrides;
      const next: ItemOverrides = { ...current, ...patch };
      if (patch.addTags) next.addTags = [...new Set([...(current.addTags ?? []), ...patch.addTags])];
      await db.productImportItem.update({ where: { id: item.id }, data: { overrides: next as Prisma.InputJsonValue } });
    }
  }
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
});

/** One item's edits, re-validated immediately so the row updates in place. */
export async function updateItemAction(itemId: string, input: unknown): Promise<ActionResult> {
  await requirePermission("products:write");
  const parsed = itemEditSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the values.");
  const item = await db.productImportItem.findUnique({ where: { id: itemId } });
  if (!item) return fail("That item no longer exists.");
  if (["IMPORTED", "UPDATED", "IMPORTING"].includes(item.status)) return fail("That item is already in the catalog.");

  const next: ItemOverrides = { ...((item.overrides ?? {}) as ItemOverrides) };
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v === undefined) continue;
    if (v === null || v === "") delete (next as Record<string, unknown>)[k];
    else (next as Record<string, unknown>)[k] = v;
  }
  const updated = await db.productImportItem.update({ where: { id: itemId }, data: { overrides: next as Prisma.InputJsonValue } });
  await runPrepareInline(updated.batchId, updated.id);
  revalidateBatch(updated.batchId);
  return { ok: true };
}

async function runPrepareInline(batchId: string, itemId: string) {
  const item = await db.productImportItem.findUniqueOrThrow({ where: { id: itemId } });
  forgetBatchContext(batchId);
  const ctx = await getBatchContext(batchId);
  await prepareItem(ctx, item);
  await refreshSummary(batchId);
}

/** A photo's option value (Colour → Black), confirmed or corrected by the owner. */
export async function setMediaOptionAction(mediaRowId: string, option: string | null, value: string | null): Promise<ActionResult> {
  await requirePermission("products:write");
  const row = await db.productImportMedia.update({
    where: { id: mediaRowId },
    data: { optionName: option, optionValue: value, optionSource: value ? "OWNER" : null },
  });
  if (row.itemId) await runPrepareInline(row.batchId, row.itemId);
  revalidateBatch(row.batchId);
  return { ok: true };
}

/** Duplicate photo decisions: Remove, Keep both, or Group as gallery. */
export async function resolveDuplicateAction(mediaRowId: string, decision: "REMOVE" | "KEEP" | "GROUP"): Promise<ActionResult> {
  await requirePermission("products:write");
  const row = await db.productImportMedia.findUnique({ where: { id: mediaRowId } });
  if (!row) return fail("That photo is gone.");
  const touched = new Set([row.itemId].filter(Boolean) as string[]);
  if (decision === "REMOVE") {
    await db.productImportMedia.delete({ where: { id: row.id } });
  } else if (decision === "KEEP") {
    await db.productImportMedia.update({ where: { id: row.id }, data: { duplicateKind: "KEPT", duplicateOfId: null } });
  } else {
    const original = row.duplicateOfId ? await db.productImportMedia.findUnique({ where: { id: row.duplicateOfId } }) : null;
    if (!original?.itemId) return fail("The matching photo has no product to join.");
    await db.productImportMedia.update({ where: { id: row.id }, data: { itemId: original.itemId, duplicateKind: "KEPT" } });
    touched.add(original.itemId);
    if (row.itemId && row.itemId !== original.itemId) {
      const left = await db.productImportMedia.count({ where: { itemId: row.itemId } });
      if (!left) await db.productImportItem.update({ where: { id: row.itemId }, data: { status: "SKIPPED", action: "SKIP" } });
    }
  }
  for (const id of touched) {
    const it = await db.productImportItem.findUnique({ where: { id }, select: { status: true } });
    if (it && it.status !== "SKIPPED") await runPrepareInline(row.batchId, id);
  }
  revalidateBatch(row.batchId);
  return { ok: true };
}

// --- Import / publish -------------------------------------------------------------

export async function simulateAction(batchId: string): Promise<ActionResult<Simulation>> {
  await requirePermission("products:write");
  await ownBatch(batchId);
  return { ok: true, data: await simulateImport(batchId) };
}

export async function importBatchAction(batchId: string, opts: { publish: boolean }): Promise<ActionResult<{ queued: number }>> {
  const user = await requirePermission("products:write");
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
      payload: { itemIds: ready.slice(i, i + IMPORT_CHUNK).map((r) => r.id), actorId: user.id, publish: opts.publish },
      dedupeKey: `import:${batchId}:${stamp}:${i}`,
      maxAttempts: 3,
    });
  }
  await enqueueJobs(jobs);
  await db.productImportBatch.update({ where: { id: batchId }, data: { status: "IMPORTING" } });
  await recordAudit({
    actorId: user.id,
    action: "bulk_import.import",
    entity: "ProductImportBatch",
    entityId: batchId,
    after: { items: ready.length, publish: opts.publish },
  });
  kickWorker();
  revalidateBatch(batchId);
  return { ok: true, data: { queued: ready.length } };
}

export async function publishBatchAction(batchId: string, selection?: unknown): Promise<ActionResult<{ queued: number }>> {
  const user = await requirePermission("products:write");
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
      payload: { itemIds: items.slice(i, i + 200).map((r) => r.id), actorId: user.id },
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
  revalidateBatch(batchId);
  return { ok: true, data: { queued: items.length } };
}

/** Failed imports go back to the review queue; failed AI is tried again. */
export async function retryFailedAction(batchId: string): Promise<ActionResult<{ count: number }>> {
  await requirePermission("products:write");
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
  revalidateBatch(batchId);
  return { ok: true, data: { count: failed.length } };
}

export async function cancelBatchAction(batchId: string): Promise<ActionResult> {
  const user = await requirePermission("products:write");
  await ownBatch(batchId);
  await cancelBatchJobs(batchId);
  await db.productImportBatch.update({ where: { id: batchId }, data: { status: "CANCELLED", fileData: null } });
  await recordAudit({ actorId: user.id, action: "bulk_import.cancel", entity: "ProductImportBatch", entityId: batchId });
  revalidateBatch(batchId);
  return { ok: true };
}

/** AI suggestions for supplier spellings the catalog does not know yet. */
export async function suggestAliasesAction(batchId: string): Promise<ActionResult<{ field: string; from: string; to: string; confidence: number }[]>> {
  await requirePermission("products:write");
  const config = await getBulkAiConfig();
  if (!config.bulkAiEnabled) return fail("AI assistance is switched off.");
  const library = await db.catalogOptionDefinition.findMany({ include: { values: true } });
  const items = await db.productImportItem.findMany({
    where: { batchId, status: { notIn: ["IMPORTED", "UPDATED", "SKIPPED"] } },
    select: { data: true },
    take: 2000,
  });
  const observed = new Map<string, Set<string>>();
  for (const it of items) {
    for (const o of ((it.data as { draft?: ItemDraft }).draft?.options ?? [])) {
      const set = observed.get(o.name) ?? new Set();
      o.values.forEach((v) => set.add(v));
      observed.set(o.name, set);
    }
  }
  const out: { field: string; from: string; to: string; confidence: number }[] = [];
  for (const def of library) {
    const canonical = def.values.map((v) => v.value);
    const seen = [...(observed.get(def.name) ?? [])];
    const unknown = seen.filter((v) => !canonical.some((c) => c.toLowerCase() === v.toLowerCase())).slice(0, 60);
    if (!unknown.length || !canonical.length) continue;
    try {
      const prompt = normalizeValuesPrompt(def.name, unknown, canonical);
      const { value } = await runBulkAiTask({
        task: "NORMALIZE_VALUE",
        schema: normalizeValueSchema,
        system: prompt.system,
        user: prompt.user,
        batchId,
        cacheKey: `${def.name}|${unknown.join(",")}|${canonical.join(",")}`,
      });
      out.push(
        ...value.suggestions
          .filter((s) => canonical.includes(s.to) && unknown.includes(s.from) && s.confidence >= 0.6)
          .map((s) => ({ ...s, field: def.name })),
      );
    } catch {
      /* suggestions are optional */
    }
  }
  return { ok: true, data: out };
}

export async function getBatchSetup(batchId: string): Promise<BatchSetup> {
  await requirePermission("products:read");
  const batch = await ownBatch(batchId);
  return readSetup(batch.setup);
}
