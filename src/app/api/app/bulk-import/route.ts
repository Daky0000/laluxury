import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiOptionsResponse, requireBearerPermission, withApiAuth } from "@/lib/auth/bearer";
import { recordAudit } from "@/lib/audit";
import { getBulkAiConfig } from "@/lib/bulk-ai/model-registry";
import { createBatch } from "@/lib/bulk-import/create-batch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = apiOptionsResponse;

/**
 * Bulk Product Add for the owner app. Same batches, queue and services as the
 * web admin (/admin/products/bulk-add), so an import started on one shows on
 * the other.
 *
 * GET  — recent imports plus what the setup screen needs.
 * POST — a new photo import; photos follow via /:batchId/photos.
 */
export const GET = withApiAuth(async () => {
  await requireBearerPermission("products:read");
  const [batches, recipes, categories, ai] = await Promise.all([
    db.productImportBatch.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { id: true, name: true, status: true, sourceKind: true, summary: true, createdAt: true, updatedAt: true },
    }),
    db.productRecipe.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.category.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    getBulkAiConfig(),
  ]);
  return NextResponse.json({
    ok: true,
    batches,
    recipes,
    categories,
    ai: { enabled: ai.bulkAiEnabled, vendor: ai.bulkAiVendor },
  });
});

const createSchema = z.object({
  name: z.string().trim().max(120).default(""),
  recipeId: z.string().nullable().optional(),
  categoryIds: z.array(z.string()).max(20).default([]),
  /** Minor units (pesewas), like every other price in the app API. */
  price: z.number().int().nonnegative().nullable().optional(),
  stock: z.number().int().nonnegative().nullable().optional(),
  aiEnabled: z.boolean().default(true),
  /** One photo per product, or all photos together as one product. */
  grouping: z.enum(["SEPARATE_PRODUCTS", "SAME_PRODUCT"]).default("SEPARATE_PRODUCTS"),
  instruction: z.string().max(2000).nullable().optional(),
});

export const POST = withApiAuth(async (request: Request) => {
  const user = await requireBearerPermission("products:write");
  const parsed = createSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the setup." }, { status: 400 });
  const input = parsed.data;

  const recipe = input.recipeId
    ? await db.productRecipe.findUnique({ where: { id: input.recipeId }, select: { id: true, version: true } })
    : null;
  const batch = await createBatch({
    name: input.name || `Phone import ${new Date().toLocaleDateString("en-GB")}`,
    sourceKind: "PHOTOS",
    createdById: user.id,
    setup: {
      recipeId: recipe?.id ?? null,
      recipeVersion: recipe?.version,
      aiEnabled: input.aiEnabled,
      pricing: { mode: "SAME", price: input.price ?? null },
      stock: input.stock == null ? { mode: "UNTRACKED" } : { mode: "SAME", quantity: input.stock },
      imageRole: { mode: input.grouping },
      defaults: { categoryIds: input.categoryIds, collectionIds: [], tags: [] },
      instruction: input.instruction ?? null,
    },
  });
  await recordAudit({ actorId: user.id, action: "bulk_import.create", entity: "ProductImportBatch", entityId: batch.id, after: { via: "app" } });
  return NextResponse.json({ ok: true, batchId: batch.id });
});
