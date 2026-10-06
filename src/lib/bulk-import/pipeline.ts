import { db } from "@/lib/db";
import type { Prisma, ProductImportBatch, ProductImportItem } from "@/generated/prisma";
import { recordAudit } from "@/lib/audit";
import { runBulkAiTask } from "@/lib/bulk-ai/router";
import { getBulkAiConfig } from "@/lib/bulk-ai/model-registry";
import { imageAnalysisPrompt, productCopyPrompt } from "@/lib/bulk-ai/prompts";
import { imageAnalysisSchema, optionMatchSchema, productCopySchema } from "@/lib/bulk-ai/schemas";
import { prepareAiImage } from "@/lib/bulk-ai/image-prep";
import { BulkAiDisabledError, BulkAiExhaustedError, errorMessage } from "@/lib/bulk-ai/retry";
import { createCatalogProduct, uniquifySkus } from "@/lib/catalog/create-product";
import { registerExternalUrl } from "@/lib/media";
import { skuFromTitle } from "@/lib/slug";
import { parseSpreadsheet } from "./parse-spreadsheet";
import { groupSourceRows, type SourceRow } from "./group-source-products";
import { loadNormalizer, type Normalizer } from "./normalize-source";
import { buildItemDraft, type AiResult, type MediaInput } from "./merge-data";
import { matchExisting } from "./match-existing";
import { validateItem } from "./validate-item";
import { detectBatchDuplicates } from "./duplicate-detection";
import { filenameStem, matchFilenameToOptionValue, matchPhotoToRow, normKey } from "./image-matching";
import { draftToProductInput, updateFromDraft } from "./create-or-update-product";
import { enqueueJobs, pendingJobCount, runJobs, type ClaimedJob } from "./jobs";
import {
  batchSetupSchema,
  recipeConfigSchema,
  type BatchSetup,
  type ColumnMapping,
  type FieldAuthority,
  type Issue,
  type ItemDraft,
  type ItemOverrides,
  type RecipeConfig,
} from "./schema";

/**
 * The Catalog Inbox pipeline:
 *
 *   SOURCE → INBOX → NORMALIZE → MATCH → ENRICH → VALIDATE → REVIEW → IMPORT → PUBLISH
 *
 * Each step is a job handler below. Handlers re-derive state from the database
 * rather than trusting the job payload, which is what makes them safe to re-run.
 */

export const PREPARE_CHUNK = 100;
export const IMPORT_CHUNK = 25;

type ItemData = { draft?: ItemDraft; ai?: AiResult | null };

// --- Batch context --------------------------------------------------------------

type BatchContext = {
  batch: ProductImportBatch;
  setup: BatchSetup;
  recipe: RecipeConfig | null;
  normalizer: Normalizer;
  categories: Map<string, string>;
  categorySlugs: string[];
  collections: Map<string, string>;
  authority: Partial<FieldAuthority> | undefined;
  profileDefaults: { material?: string | null; care?: string | null; brand?: string | null } | null;
  aiAvailable: boolean;
  loadedAt: number;
};

const contexts = new Map<string, BatchContext>();

export function readSetup(raw: Prisma.JsonValue | null | undefined): BatchSetup {
  const parsed = batchSetupSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : batchSetupSchema.parse({});
}

async function batchContext(batchId: string): Promise<BatchContext> {
  const hit = contexts.get(batchId);
  if (hit && Date.now() - hit.loadedAt < 20_000) return hit;

  const batch = await db.productImportBatch.findUniqueOrThrow({ where: { id: batchId } });
  const setup = readSetup(batch.setup);
  const [recipeRow, profile, categories, collections, aiConfig, normalizer] = await Promise.all([
    setup.recipeId ? db.productRecipe.findUnique({ where: { id: setup.recipeId } }) : null,
    batch.profileId ? db.catalogSourceProfile.findUnique({ where: { id: batch.profileId } }) : null,
    db.category.findMany({ select: { id: true, name: true, slug: true } }),
    db.collection.findMany({ select: { id: true, name: true, slug: true } }),
    getBulkAiConfig(),
    loadNormalizer(batch.sourceId),
  ]);
  const toMap = (rows: { id: string; name: string; slug: string }[]) => {
    const m = new Map<string, string>();
    for (const r of rows) {
      m.set(r.name.toLowerCase(), r.id);
      m.set(r.slug.toLowerCase(), r.id);
    }
    return m;
  };
  const profileConfig = (profile?.config ?? {}) as {
    fieldAuthority?: Partial<FieldAuthority>;
    defaults?: { material?: string; care?: string; brand?: string };
  };

  const ctx: BatchContext = {
    batch,
    setup,
    recipe: recipeRow ? recipeConfigSchema.parse(recipeRow.config ?? {}) : null,
    normalizer,
    categories: toMap(categories),
    categorySlugs: categories.map((c) => c.slug),
    collections: toMap(collections),
    authority: { ...(profileConfig.fieldAuthority ?? {}), ...((setup.fieldAuthority ?? {}) as Partial<FieldAuthority>) },
    profileDefaults: profileConfig.defaults ?? null,
    aiAvailable: aiConfig.bulkAiEnabled && setup.aiEnabled,
    loadedAt: Date.now(),
  };
  contexts.set(batchId, ctx);
  return ctx;
}

export const getBatchContext = batchContext;

export function forgetBatchContext(batchId: string) {
  contexts.delete(batchId);
}

async function setBatchStatus(batchId: string, status: ProductImportBatch["status"], extra: Prisma.ProductImportBatchUpdateInput = {}) {
  await db.productImportBatch.update({ where: { id: batchId }, data: { status, ...extra } });
}

// --- Source → inbox -------------------------------------------------------------

/** PARSE_FILE: spreadsheet rows → grouped inbox items. Idempotent via (batchId, groupKey). */
async function parseFile(batchId: string) {
  const batch = await db.productImportBatch.findUniqueOrThrow({ where: { id: batchId } });
  if (!batch.fileData || !batch.columnMapping) throw new Error("No spreadsheet or column mapping on this batch.");
  await setBatchStatus(batchId, "PARSING", { startedAt: batch.startedAt ?? new Date() });

  const sheet = parseSpreadsheet(Buffer.from(batch.fileData), batch.fileName ?? "file.csv");
  const groups = groupSourceRows(sheet.headers, sheet.rows, batch.columnMapping as ColumnMapping);

  for (let i = 0; i < groups.length; i += 500) {
    await db.productImportItem.createMany({
      data: groups.slice(i, i + 500).map((g) => ({
        batchId,
        groupKey: g.groupKey.slice(0, 300),
        externalKey: g.externalKey,
        rowNumber: g.rows[0].rowNumber,
        raw: { rows: g.rows } as unknown as Prisma.InputJsonValue,
      })),
      skipDuplicates: true,
    });
  }
  await db.productImportBatch.update({ where: { id: batchId }, data: { rowCount: sheet.rows.length } });

  if (batch.sourceKind === "PHOTOS_SPREADSHEET") {
    await matchMediaToRows(batchId);
    await detectBatchDuplicates(batchId);
  }
  await queuePrepare(batchId);
}

/** Links uploaded photos to spreadsheet items by filename / SKU / key. */
async function matchMediaToRows(batchId: string) {
  const [items, media] = await Promise.all([
    db.productImportItem.findMany({ where: { batchId }, select: { id: true, raw: true, externalKey: true } }),
    db.productImportMedia.findMany({ where: { batchId, itemId: null }, select: { id: true, filename: true } }),
  ]);
  const candidates = items.map((it) => {
    const rows = ((it.raw as { rows?: SourceRow[] } | null)?.rows ?? []) as SourceRow[];
    return {
      itemId: it.id,
      imageFiles: rows.flatMap((r) => (r.fields.imageFile ?? "").split(/[,;|]/).map((s) => s.trim()).filter(Boolean)),
      keys: [it.externalKey, ...rows.map((r) => r.fields.sku), ...rows.map((r) => r.fields.parentSku)].filter(
        (k): k is string => Boolean(k),
      ),
    };
  });
  for (const m of media) {
    const itemId = matchPhotoToRow(m.filename, candidates);
    if (itemId) await db.productImportMedia.update({ where: { id: m.id }, data: { itemId } });
  }
}

/** Photo batches: photos → inbox items according to what each photo represents. */
async function groupPhotos(batchId: string) {
  const ctx = await batchContext(batchId);
  const media = await db.productImportMedia.findMany({ where: { batchId }, orderBy: { position: "asc" } });
  const role = ctx.setup.imageRole;
  const option = role.mode === "OPTION" ? ctx.setup.options.find((o) => o.name === role.option) : undefined;

  const groups = new Map<string, typeof media>();
  for (const m of media) {
    let key: string;
    if (role.mode === "SEPARATE_PRODUCTS") key = `media:${m.mediaId}`;
    else if (role.mode === "SAME_PRODUCT") key = `stem:${filenameStem(m.filename)}`;
    else {
      const value = option ? matchFilenameToOptionValue(m.filename, option.values) : null;
      if (value && !m.optionValue) {
        await db.productImportMedia.update({
          where: { id: m.id },
          data: { optionName: option!.name, optionValue: value, optionSource: "RULE" },
        });
      }
      const rest = value ? filenameStem(m.filename).replace(new RegExp(normKey(value).split("").join("[^a-z0-9]*"), "i"), "") : filenameStem(m.filename);
      const stem = normKey(rest.replace(/\d+/g, ""));
      key = `opt:${stem || "main"}`;
    }
    const list = groups.get(key) ?? [];
    list.push(m);
    groups.set(key, list);
  }

  for (const [groupKey, list] of groups) {
    const item = await db.productImportItem.upsert({
      where: { batchId_groupKey: { batchId, groupKey } },
      create: { batchId, groupKey, raw: { rows: [] } },
      update: {},
      select: { id: true },
    });
    await db.productImportMedia.updateMany({ where: { id: { in: list.map((m) => m.id) } }, data: { itemId: item.id } });
  }
}

// --- Prepare: normalise, match, validate ---------------------------------------

export async function queuePrepare(batchId: string, itemIds?: string[], tag = Date.now().toString(36)) {
  const ids =
    itemIds ??
    (
      await db.productImportItem.findMany({
        where: { batchId, status: { notIn: ["IMPORTED", "UPDATED", "IMPORTING"] } },
        select: { id: true },
        orderBy: { rowNumber: "asc" },
      })
    ).map((i) => i.id);
  const jobs = [];
  for (let i = 0; i < ids.length; i += PREPARE_CHUNK) {
    jobs.push({
      type: "PREPARE_ITEMS" as const,
      batchId,
      payload: { itemIds: ids.slice(i, i + PREPARE_CHUNK) },
      dedupeKey: `prep:${batchId}:${tag}:${i}`,
    });
  }
  await enqueueJobs(jobs);
  const batch = await db.productImportBatch.findUnique({ where: { id: batchId }, select: { status: true } });
  if (batch && !["IMPORTING", "CANCELLED"].includes(batch.status)) await setBatchStatus(batchId, "NORMALIZING");
}

function needsAi(ctx: BatchContext, draft: ItemDraft, media: MediaInput[]): boolean {
  if (!ctx.aiAvailable) return false;
  const f = ctx.setup.aiFields;
  const wants =
    (f.titles && (!draft.title || draft.title.source === "AI")) ||
    (f.descriptions && !draft.description) ||
    (f.seo && !draft.metaTitle) ||
    (f.altText && media.length > 0) ||
    (f.visual && media.length > 0) ||
    (f.category && !draft.categoryIds) ||
    (f.optionDetection && media.some((m) => !m.optionValue) && ctx.setup.imageRole.mode === "OPTION");
  // Text-only copy needs at least some facts to work from.
  return wants && (media.length > 0 || Boolean(draft.title));
}

export async function prepareItem(
  ctx: BatchContext,
  item: ProductImportItem,
  opts: { allowAiQueue: boolean } = { allowAiQueue: true },
): Promise<void> {
  const overrides = (item.overrides ?? null) as ItemOverrides | null;
  if (overrides?.skip) {
    await db.productImportItem.update({ where: { id: item.id }, data: { status: "SKIPPED", action: "SKIP" } });
    return;
  }

  const rows = ((item.raw as { rows?: SourceRow[] } | null)?.rows ?? []) as SourceRow[];
  const mediaRows = await db.productImportMedia.findMany({
    where: { itemId: item.id },
    orderBy: { position: "asc" },
  });
  const media: MediaInput[] = mediaRows.map((m) => ({
    id: m.id,
    mediaId: m.mediaId,
    url: m.url,
    filename: m.filename,
    optionName: m.optionName,
    optionValue: m.optionValue,
    position: m.position,
  }));
  const data = (item.data ?? {}) as ItemData;
  const ai = data.ai ?? null;

  const seed = rows[0]?.fields.title || overrides?.title || ai?.title || media[0]?.filename || "Item";
  const draft = buildItemDraft({
    setup: ctx.setup,
    recipe: ctx.recipe,
    profileDefaults: ctx.profileDefaults,
    rows,
    media,
    overrides,
    ai,
    normalizer: ctx.normalizer,
    categoryBySlugOrName: ctx.categories,
    collectionBySlugOrName: ctx.collections,
    skuStem: `${skuFromTitle(seed)}-${item.id.slice(-4).toUpperCase()}`,
  });

  const hasSourceSkus = rows.some((r) => Boolean(r.fields.sku));
  const match = await matchExisting({
    sourceId: ctx.batch.sourceId,
    externalKey: item.externalKey,
    draft,
    hasSourceSkus,
  });
  const isUpdate = match.confident && !overrides?.forceCreate;

  const skus = draft.variants.map((v) => v.sku).filter((s): s is string => Boolean(s));
  const taken = new Set(
    isUpdate
      ? []
      : (await db.variant.findMany({ where: { sku: { in: skus } }, select: { sku: true } })).map((v) => v.sku),
  );

  let aiStatus = item.aiStatus;
  const wantAi = !isUpdate && aiStatus !== "DONE" && aiStatus !== "FAILED" && needsAi(ctx, draft, media);
  if (wantAi && opts.allowAiQueue && aiStatus !== "PENDING") {
    aiStatus = "PENDING";
    await enqueueJobs([
      { type: "AI_ANALYZE", batchId: ctx.batch.id, payload: { itemId: item.id }, dedupeKey: `ai:${item.id}:${item.attempts}`, maxAttempts: AI_JOB_ATTEMPTS },
    ]);
  } else if (!wantAi && aiStatus === "PENDING") {
    aiStatus = "SKIPPED";
  }

  const { issues, status } = validateItem({
    draft,
    match,
    ai,
    aiStatus,
    overrides,
    requireImage: ctx.batch.sourceKind !== "SPREADSHEET" && ctx.batch.sourceKind !== "FEED",
    takenSkus: taken,
    duplicateMedia: mediaRows.filter((m) => m.duplicateKind === "SIMILAR" || m.duplicateKind === "EXISTING_PRODUCT").length,
  });

  await db.productImportItem.update({
    where: { id: item.id },
    data: {
      data: { draft, ai } as unknown as Prisma.InputJsonValue,
      issues: issues as unknown as Prisma.InputJsonValue,
      issueCodes: [...new Set(issues.filter((i) => i.severity !== "INFO").map((i) => i.code))],
      status: aiStatus === "PENDING" ? "PROCESSING" : status,
      action: isUpdate ? "UPDATE" : "CREATE",
      matchProductId: match.productId,
      matchMethod: match.method,
      aiStatus,
    },
  });
}

async function prepareItems(batchId: string, itemIds: string[]) {
  const ctx = await batchContext(batchId);
  const items = await db.productImportItem.findMany({ where: { id: { in: itemIds }, batchId } });
  for (const item of items) {
    if (["IMPORTED", "UPDATED", "IMPORTING"].includes(item.status)) continue;
    await prepareItem(ctx, item);
  }
}

// --- Enrich: AI -------------------------------------------------------------------

/**
 * Rate-limited free models are the normal case, not an error: when every model
 * was only busy, the job goes back on the queue (10s, 20s, 40s, 80s later)
 * and the item stays PENDING instead of showing a failure.
 */
const AI_JOB_ATTEMPTS = 5;

async function aiAnalyze(batchId: string, itemId: string, job?: ClaimedJob) {
  const ctx = await batchContext(batchId);
  const item = await db.productImportItem.findUnique({ where: { id: itemId } });
  if (!item || item.aiStatus === "DONE" || ["IMPORTED", "UPDATED"].includes(item.status)) return;
  await setBatchStatus(batchId, "ENRICHING").catch(() => undefined);

  const data = (item.data ?? {}) as ItemData;
  const draft = data.draft;
  const media = await db.productImportMedia.findMany({ where: { itemId }, orderBy: { position: "asc" } });
  const facts: Record<string, unknown> = {
    title: draft?.title?.source !== "AI" ? draft?.title?.value : undefined,
    material: draft?.material?.value,
    options: draft?.options,
    tags: draft?.tags?.source !== "AI" ? draft?.tags?.value : undefined,
    recipe: ctx.recipe ? true : undefined,
  };
  const recipeName = ctx.setup.recipeId
    ? (await db.productRecipe.findUnique({ where: { id: ctx.setup.recipeId }, select: { name: true } }))?.name
    : null;

  let result: AiResult | null = null;
  let failure: string | null = null;
  try {
    const option =
      ctx.setup.imageRole.mode === "OPTION"
        ? (draft?.options.find((o) => o.name === ctx.setup.imageRole.option) ?? null)
        : null;

    // Photos that stand for an option value and could not be matched by name.
    if (option && ctx.setup.aiFields.optionDetection) {
      for (const m of media.filter((x) => !x.optionValue)) {
        const image = await prepareAiImage(m.mediaId);
        const { value } = await runBulkAiTask({
          task: "MATCH_IMAGE_TO_OPTION",
          schema: optionMatchSchema,
          system: imageAnalysisPrompt({ recipe: recipeName, knownFacts: {}, option, categories: [] }).system,
          user: `Which ${option.name} is this? Choose from ${JSON.stringify(option.values)}.`,
          images: [image.dataUrl],
          batchId,
          itemId,
          cacheKey: `${m.checksum ?? m.mediaId}|${option.values.join(",")}`,
        });
        if (value.value && option.values.includes(value.value) && value.confidence >= 0.6) {
          await db.productImportMedia.update({
            where: { id: m.id },
            data: { optionName: option.name, optionValue: value.value, optionSource: "AI" },
          });
        }
      }
    }

    if (media.length) {
      // One vision call per product: up to three of its photos together.
      const images = await Promise.all(media.slice(0, 3).map((m) => prepareAiImage(m.mediaId)));
      const prompt = imageAnalysisPrompt({
        recipe: recipeName,
        category: null,
        knownFacts: facts,
        option: null,
        categories: ctx.categorySlugs,
      });
      const { value, model } = await runBulkAiTask({
        task: "ANALYZE_PRODUCT_IMAGE",
        schema: imageAnalysisSchema,
        system: prompt.system,
        user: prompt.user,
        images: images.map((i) => i.dataUrl),
        batchId,
        itemId,
        recipeVersion: ctx.setup.recipeVersion,
        cacheKey: `${media.slice(0, 3).map((m) => m.checksum ?? m.mediaId).join(",")}|${JSON.stringify(facts)}`,
        maxTokens: 1800,
      });
      result = {
        model,
        confidence: value.confidence,
        title: value.title,
        shortDescription: value.shortDescription,
        description: value.description,
        tags: value.tags,
        metaTitle: value.metaTitle,
        metaDescription: value.metaDescription,
        altText: value.altText,
        dominantColours: value.dominantColours,
        pattern: value.pattern,
        suggestedCategoryId: value.suggestedCategorySlug ? (ctx.categories.get(value.suggestedCategorySlug.toLowerCase()) ?? null) : null,
        visibleLogo: value.visibleLogo,
        warnings: value.warnings,
      };
    } else if (draft?.title) {
      const prompt = productCopyPrompt({ ...facts, recipe: recipeName });
      const { value, model } = await runBulkAiTask({
        task: "GENERATE_PRODUCT_COPY",
        schema: productCopySchema,
        system: prompt.system,
        user: prompt.user,
        batchId,
        itemId,
        recipeVersion: ctx.setup.recipeVersion,
        cacheKey: JSON.stringify(facts),
      });
      result = { model, ...value, title: undefined };
    }
  } catch (error) {
    const canRequeue = job ? job.attempts < job.maxAttempts : false;
    if (error instanceof BulkAiExhaustedError && error.transient && canRequeue) {
      await db.productImportItem.update({ where: { id: itemId }, data: { aiStatus: "PENDING", error: null } });
      throw error; // failJob requeues with backoff
    }
    if (!(error instanceof BulkAiDisabledError)) failure = errorMessage(error);
  }

  const fresh = await db.productImportItem.update({
    where: { id: itemId },
    data: {
      data: { ...data, ai: result } as unknown as Prisma.InputJsonValue,
      aiStatus: failure ? "FAILED" : result ? "DONE" : "SKIPPED",
      error: failure,
    },
  });
  await prepareItem(ctx, fresh, { allowAiQueue: false });
}

// --- Import / publish ---------------------------------------------------------------

async function importItems(batchId: string, itemIds: string[], actorId: string | null) {
  const ctx = await batchContext(batchId);
  const items = await db.productImportItem.findMany({ where: { id: { in: itemIds }, batchId } });
  let created = 0;
  let updated = 0;
  let failed = 0;

  for (const item of items) {
    // Idempotency: an item that already reached the catalog is never written twice.
    if (item.productId && ["IMPORTED", "UPDATED"].includes(item.status)) continue;
    if (item.status !== "READY" && item.status !== "IMPORTING") continue;
    const draft = ((item.data ?? {}) as ItemData).draft;
    if (!draft) continue;

    await db.productImportItem.update({ where: { id: item.id }, data: { status: "IMPORTING" } });
    try {
      let productId: string;
      if (item.action === "UPDATE" && item.matchProductId) {
        const out = await updateFromDraft(item.matchProductId, draft, ctx.authority, actorId, `import:${batchId}`);
        productId = out.productId;
        await db.productImportItem.update({ where: { id: item.id }, data: { status: "UPDATED", productId, error: null } });
        updated++;
      } else {
        for (const img of draft.images) {
          if (!img.mediaId && /^https?:\/\//i.test(img.url)) {
            const asset = await registerExternalUrl(img.url, { uploadedById: actorId }).catch(() => null);
            if (asset) {
              img.mediaId = asset.id;
              img.url = asset.url;
            }
          }
        }
        // Product and the item's "imported" mark commit together, so a crash
        // between them can never produce the product twice on retry.
        productId = await db.$transaction(
          async (tx) => {
            // Another item in this batch (or a product added meanwhile) may
            // already hold a generated SKU; take the next free one instead of failing.
            const p = await createCatalogProduct(await uniquifySkus(draftToProductInput(draft), tx), tx);
            await tx.productImportItem.update({
              where: { id: item.id },
              data: { status: "IMPORTED", productId: p.id, error: null },
            });
            return p.id;
          },
          { timeout: 60_000 },
        );
        created++;
      }

      if (ctx.batch.sourceId && item.externalKey) {
        await db.catalogSourceProduct.upsert({
          where: { sourceId_externalKey: { sourceId: ctx.batch.sourceId, externalKey: item.externalKey } },
          create: { sourceId: ctx.batch.sourceId, externalKey: item.externalKey, productId, lastData: item.raw ?? undefined },
          update: { productId, lastSeenAt: new Date(), lastData: item.raw ?? undefined },
        });
      }
    } catch (error) {
      failed++;
      await db.productImportItem.update({
        where: { id: item.id },
        data: { status: "FAILED", error: errorMessage(error), attempts: { increment: 1 } },
      });
    }
  }

  if (created || updated || failed) {
    await recordAudit({
      actorId,
      action: "product.bulk_import",
      entity: "ProductImportBatch",
      entityId: batchId,
      after: { created, updated, failed },
    }).catch(() => undefined);
  }
}

async function publishItems(batchId: string, itemIds: string[], actorId: string | null) {
  const items = await db.productImportItem.findMany({
    where: { id: { in: itemIds }, batchId, status: { in: ["IMPORTED", "UPDATED"] }, productId: { not: null } },
    select: { productId: true, issues: true },
  });
  // Unresolved validation problems block publishing.
  const ok = items.filter((i) => !((i.issues ?? []) as Issue[]).some((x) => x.severity === "BLOCK"));
  const ids = ok.map((i) => i.productId!);
  if (!ids.length) return;
  await db.product.updateMany({ where: { id: { in: ids }, publishedAt: null }, data: { publishedAt: new Date() } });
  await db.product.updateMany({ where: { id: { in: ids } }, data: { status: "ACTIVE" } });
  await recordAudit({
    actorId,
    action: "product.bulk_publish",
    entity: "ProductImportBatch",
    entityId: batchId,
    after: { published: ids.length },
  }).catch(() => undefined);
}

// --- Batch lifecycle --------------------------------------------------------------

export async function refreshSummary(batchId: string) {
  const [byStatus, byIssue, unmatchedMedia, byAction] = await Promise.all([
    db.productImportItem.groupBy({ by: ["status"], where: { batchId }, _count: true }),
    db.$queryRaw<{ code: string; n: bigint }[]>`
      SELECT unnest("issueCodes") AS code, count(*) AS n FROM "ProductImportItem"
       WHERE "batchId" = ${batchId} AND status NOT IN ('IMPORTED','UPDATED','SKIPPED')
       GROUP BY 1`,
    db.productImportMedia.count({ where: { batchId, itemId: null } }),
    db.productImportItem.groupBy({ by: ["action"], where: { batchId, status: { in: ["READY", "NEEDS_REVIEW"] } }, _count: true }),
  ]);
  const summary = {
    total: byStatus.reduce((n, s) => n + s._count, 0),
    status: Object.fromEntries(byStatus.map((s) => [s.status, s._count])),
    issues: Object.fromEntries(byIssue.map((i) => [i.code, Number(i.n)])),
    actions: Object.fromEntries(byAction.map((a) => [a.action, a._count])),
    unmatchedMedia,
    updatedAt: new Date().toISOString(),
  };
  await db.productImportBatch.update({ where: { id: batchId }, data: { summary } });
  return summary;
}

/** Moves a batch to its next state once its queued work has drained. */
export async function advanceBatch(batchId: string, currentJobId?: string) {
  const batch = await db.productImportBatch.findUnique({ where: { id: batchId }, select: { status: true } });
  if (!batch || batch.status === "CANCELLED") return;
  const pending = await pendingJobCount(batchId, currentJobId);
  if (pending > 0) return;

  const summary = await refreshSummary(batchId);
  if (["PARSING", "NORMALIZING", "MATCHING", "ENRICHING", "VALIDATING", "UPLOADING"].includes(batch.status)) {
    await setBatchStatus(batchId, "READY_FOR_REVIEW");
  } else if (batch.status === "IMPORTING") {
    const failed = (summary.status.FAILED ?? 0) as number;
    const done = ((summary.status.IMPORTED ?? 0) as number) + ((summary.status.UPDATED ?? 0) as number);
    await setBatchStatus(batchId, failed > 0 || done < summary.total ? "PARTIAL" : "COMPLETED", { completedAt: new Date() });
  }
}

// --- Job dispatch -------------------------------------------------------------------

type Payload = { itemIds?: string[]; itemId?: string; actorId?: string | null; publish?: boolean };

export async function handleJob(job: ClaimedJob): Promise<void> {
  const batchId = job.batchId;
  if (!batchId) return;
  const p = (job.payload ?? {}) as Payload;

  switch (job.type) {
    case "PARSE_FILE":
      await parseFile(batchId);
      break;
    case "MATCH_MEDIA":
      await groupPhotos(batchId);
      await detectBatchDuplicates(batchId);
      await queuePrepare(batchId);
      break;
    case "PREPARE_ITEMS":
    case "NORMALIZE_SOURCE":
    case "MATCH_EXISTING_PRODUCT":
    case "VALIDATE_ITEM":
      await prepareItems(batchId, p.itemIds ?? (p.itemId ? [p.itemId] : []));
      break;
    case "AI_ANALYZE":
      if (p.itemId) await aiAnalyze(batchId, p.itemId, job);
      break;
    case "IMPORT_ITEMS":
    case "CREATE_PRODUCT":
    case "UPDATE_PRODUCT":
      await importItems(batchId, p.itemIds ?? [], p.actorId ?? null);
      if (p.publish) await publishItems(batchId, p.itemIds ?? [], p.actorId ?? null);
      break;
    case "PUBLISH_PRODUCT":
      await publishItems(batchId, p.itemIds ?? [], p.actorId ?? null);
      break;
    case "REGISTER_MEDIA":
      break; // Photos are registered in the media library at upload time.
  }
  await advanceBatch(batchId, job.id);
}

/** Runs the queue for a while. Safe to call from anywhere, any number of times. */
export async function runCatalogWorker(budgetMs = 20_000, workerId?: string) {
  const config = await getBulkAiConfig().catch(() => null);
  const parallel = Math.max(2, Math.min(8, config?.bulkAiVisionConcurrency ?? 3));
  const out = await runJobs(handleJob, { budgetMs, parallel, workerId });
  await advanceStalledBatches().catch(() => undefined);
  return out;
}

/**
 * Two jobs of one batch finishing at the same moment each see the other still
 * running, so neither moves the batch on. Any batch still "in progress" with
 * an empty queue is advanced here.
 */
async function advanceStalledBatches() {
  const stalled = await db.productImportBatch.findMany({
    where: {
      status: { in: ["PARSING", "NORMALIZING", "MATCHING", "ENRICHING", "VALIDATING", "IMPORTING"] },
      jobs: { none: { status: { in: ["QUEUED", "RUNNING"] } } },
      // Leave a moment for a just-started batch to enqueue its first job.
      updatedAt: { lt: new Date(Date.now() - 30_000) },
    },
    select: { id: true },
    take: 20,
  });
  for (const b of stalled) await advanceBatch(b.id);
}
