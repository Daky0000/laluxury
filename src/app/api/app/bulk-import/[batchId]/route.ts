import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiOptionsResponse, requireBearerPermission, withApiAuth } from "@/lib/auth/bearer";
import { pendingJobCount } from "@/lib/bulk-import/jobs";
import { readSetup, runCatalogWorker } from "@/lib/bulk-import/pipeline";
import {
  cancelBatch,
  editImportItem,
  importBatch,
  publishBatch,
  retryFailedItems,
  startBatchProcessing,
} from "@/lib/bulk-import/batch-ops";
import type { ItemDraft } from "@/lib/bulk-import/schema";
import { revalidateProductCatalog } from "@/lib/catalog-revalidate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = apiOptionsResponse;

type Ctx = { params: Promise<{ batchId: string }> };

/**
 * GET — progress and the items, like the web review screen. Each poll also
 * gives the queue a few seconds of work, so imports move while the app is open.
 */
export const GET = withApiAuth(async (_request: Request, ctx: Ctx) => {
  await requireBearerPermission("products:read");
  const { batchId } = await ctx.params;

  let pending = await pendingJobCount(batchId);
  if (pending > 0) {
    await runCatalogWorker(8_000).catch(() => undefined);
    pending = await pendingJobCount(batchId);
  }
  const batch = await db.productImportBatch.findUnique({
    where: { id: batchId },
    select: {
      id: true,
      name: true,
      status: true,
      sourceKind: true,
      summary: true,
      error: true,
      aiCalls: true,
      aiFailures: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!batch) return NextResponse.json({ error: "Import not found." }, { status: 404 });

  const [items, photoCount] = await Promise.all([
    db.productImportItem.findMany({
      where: { batchId },
      orderBy: [{ rowNumber: "asc" }, { createdAt: "asc" }],
      take: 300,
      select: { id: true, status: true, action: true, aiStatus: true, error: true, issues: true, productId: true, data: true },
    }),
    db.productImportMedia.count({ where: { batchId } }),
  ]);

  const productIds = items.map((it) => it.productId).filter((id): id is string => Boolean(id));
  const live = new Set(
    productIds.length
      ? (await db.product.findMany({ where: { id: { in: productIds }, status: "ACTIVE" }, select: { id: true } })).map((p) => p.id)
      : [],
  );

  return NextResponse.json({
    ok: true,
    pending,
    photoCount,
    batch,
    items: items.map((it) => {
      const draft = (it.data as { draft?: ItemDraft } | null)?.draft;
      const enabled = (draft?.variants ?? []).filter((v) => v.enabled);
      const prices = enabled.filter((v) => v.price != null).map((v) => v.price as number);
      return {
        id: it.id,
        status: it.status,
        action: it.action,
        aiStatus: it.aiStatus,
        error: it.error,
        issues: it.issues,
        productId: it.productId,
        /** The product is live on the store (publishing changes the product, not the item). */
        published: Boolean(it.productId && live.has(it.productId)),
        title: draft?.title?.value ?? null,
        shortDescription: draft?.shortDescription?.value ?? null,
        price: prices.length ? Math.min(...prices) : null,
        stock: enabled.reduce((n, v) => n + (v.stock ?? 0), 0),
        variantCount: enabled.length,
        imageUrl: draft?.images?.[0]?.url ?? null,
        imageCount: draft?.images?.length ?? 0,
      };
    }),
  });
});

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start") }),
  z.object({ action: z.literal("import"), publish: z.boolean().default(false) }),
  z.object({ action: z.literal("publish") }),
  z.object({ action: z.literal("retry") }),
  z.object({ action: z.literal("cancel") }),
  z.object({ action: z.literal("editItem"), itemId: z.string(), changes: z.record(z.string(), z.unknown()) }),
]);

/** POST — the same batch operations the web admin runs (src/lib/bulk-import/batch-ops.ts). */
export const POST = withApiAuth(async (request: Request, ctx: Ctx) => {
  const user = await requireBearerPermission("products:write");
  const { batchId } = await ctx.params;
  const parsed = actionSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  const a = parsed.data;

  const batch = await db.productImportBatch.findUnique({ where: { id: batchId }, select: { setup: true } });
  if (!batch) return NextResponse.json({ error: "Import not found." }, { status: 404 });

  let result: { ok: boolean; message?: string; data?: unknown };
  try {
    switch (a.action) {
      case "start":
        result = await startBatchProcessing(batchId, user.id, { setup: readSetup(batch.setup) });
        break;
      case "import":
        result = await importBatch(batchId, user.id, { publish: a.publish });
        break;
      case "publish":
        result = await publishBatch(batchId, user.id);
        if (result.ok) revalidateProductCatalog();
        break;
      case "retry":
        result = await retryFailedItems(batchId);
        break;
      case "cancel":
        result = await cancelBatch(batchId, user.id);
        break;
      case "editItem": {
        const item = await db.productImportItem.findFirst({ where: { id: a.itemId, batchId }, select: { id: true } });
        if (!item) return NextResponse.json({ error: "Item not found." }, { status: 404 });
        result = await editImportItem(a.itemId, a.changes);
        break;
      }
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "That did not work." }, { status: 500 });
  }
  if (!result.ok) return NextResponse.json({ error: result.message ?? "That did not work." }, { status: 400 });
  return NextResponse.json({ ok: true, data: result.data ?? null, message: result.message ?? null });
});
