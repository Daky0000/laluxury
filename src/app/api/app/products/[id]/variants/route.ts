import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireBearerPermission, withApiAuth } from "@/lib/auth/bearer";
import { refreshPriceRange } from "@/lib/catalog";
import { ensureInventoryItem } from "@/lib/inventory";
import { recordAudit } from "@/lib/audit";
import { revalidateProductCatalog } from "@/lib/catalog-revalidate";

export const runtime = "nodejs";

function toMinor(val: number): number {
  if (!Number.isFinite(val)) return 0;
  return Number.isInteger(val) ? val : Math.round(val * 100);
}

const variantUpdateItemSchema = z.object({
  id: z.string().min(1),
  price: z.number().min(0).optional(),
  compareAtPrice: z.number().min(0).nullable().optional(),
  costPrice: z.number().min(0).nullable().optional(),
  sku: z.string().trim().min(1).optional(),
  barcode: z.string().trim().nullable().optional(),
  weightGrams: z.number().min(0).nullable().optional(),
  isActive: z.boolean().optional(),
  stock: z.number().int().min(0).optional(),
});

const bulkVariantsSchema = z.object({
  variants: z.array(variantUpdateItemSchema).min(1, "Provide at least one variant to update."),
});

const createVariantSchema = z.object({
  title: z.string().trim().min(1, "Variant title is required."),
  sku: z.string().trim().min(1, "SKU is required."),
  price: z.number().min(0, "Price must be at least 0."),
  compareAtPrice: z.number().min(0).nullable().optional(),
  costPrice: z.number().min(0).nullable().optional(),
  stock: z.number().int().min(0).optional().default(0),
  barcode: z.string().trim().nullable().optional(),
  weightGrams: z.number().min(0).nullable().optional(),
  isActive: z.boolean().optional().default(true),
  optionValueIds: z.array(z.string()).optional().default([]),
});

// ---------------------------------------------------------------------------
// GET /api/app/products/[id]/variants
// ---------------------------------------------------------------------------

export const GET = withApiAuth(
  async (_request: Request, ctx: { params: Promise<{ id: string }> }) => {
    await requireBearerPermission("products:read");
    const { id: productId } = await ctx.params;

    const variants = await db.variant.findMany({
      where: { productId },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      include: {
        inventory: true,
        optionValues: {
          include: {
            optionValue: {
              include: { option: true },
            },
          },
        },
      },
    });

    return NextResponse.json({ variants });
  },
);

// ---------------------------------------------------------------------------
// POST /api/app/products/[id]/variants (Create a new variant)
// ---------------------------------------------------------------------------

export const POST = withApiAuth(
  async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
    const actor = await requireBearerPermission("products:write");
    const { id: productId } = await ctx.params;

    const product = await db.product.findUnique({
      where: { id: productId },
      select: { id: true, isPreorder: true },
    });
    if (!product) {
      return NextResponse.json({ error: "Product not found." }, { status: 404 });
    }

    const json = await request.json().catch(() => null);
    const parsed = createVariantSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid variant input." },
        { status: 400 },
      );
    }

    const data = parsed.data;

    // Check SKU collision
    const existingSku = await db.variant.findUnique({
      where: { sku: data.sku },
      select: { id: true },
    });
    if (existingSku) {
      return NextResponse.json(
        { error: `SKU ${data.sku} is already in use.` },
        { status: 400 },
      );
    }

    const count = await db.variant.count({ where: { productId } });
    const price = toMinor(data.price);
    const compareAtPrice = data.compareAtPrice != null ? toMinor(data.compareAtPrice) : null;
    const costPrice = data.costPrice != null ? toMinor(data.costPrice) : null;

    const variant = await db.variant.create({
      data: {
        productId,
        title: data.title,
        sku: data.sku,
        price,
        compareAtPrice,
        costPrice,
        barcode: data.barcode || null,
        weightGrams: data.weightGrams ?? null,
        isActive: data.isActive,
        position: count,
        inventory: {
          create: {
            onHand: data.stock,
            allowBackorder: product.isPreorder,
          },
        },
        optionValues: {
          create: data.optionValueIds.map((optionValueId) => ({ optionValueId })),
        },
      },
      include: {
        inventory: true,
        optionValues: {
          include: { optionValue: true },
        },
      },
    });

    await refreshPriceRange(productId);
    revalidateProductCatalog(productId);

    await recordAudit({
      actorId: actor.id,
      action: "variant.create",
      entity: "Product",
      entityId: productId,
      source: "admin",
      after: { sku: variant.sku, price: variant.price, title: variant.title },
    });

    return NextResponse.json({ ok: true, variant }, { status: 201 });
  },
);

// ---------------------------------------------------------------------------
// PATCH /api/app/products/[id]/variants (Bulk update variants)
// ---------------------------------------------------------------------------

export const PATCH = withApiAuth(
  async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
    const actor = await requireBearerPermission("products:write");
    const { id: productId } = await ctx.params;

    const product = await db.product.findUnique({
      where: { id: productId },
      select: { id: true },
    });
    if (!product) {
      return NextResponse.json({ error: "Product not found." }, { status: 404 });
    }

    const json = await request.json().catch(() => null);
    const parsed = bulkVariantsSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid variants payload." },
        { status: 400 },
      );
    }

    const updates = parsed.data.variants;
    const variantIds = updates.map((u) => u.id);

    // Verify all variants belong to this product
    const existingVariants = await db.variant.findMany({
      where: { id: { in: variantIds }, productId },
      select: { id: true, sku: true },
    });

    if (existingVariants.length !== variantIds.length) {
      return NextResponse.json(
        { error: "One or more variants do not belong to this product." },
        { status: 400 },
      );
    }

    // Check SKU conflicts
    for (const update of updates) {
      if (update.sku) {
        const conflict = await db.variant.findUnique({
          where: { sku: update.sku },
          select: { id: true },
        });
        if (conflict && conflict.id !== update.id) {
          return NextResponse.json(
            { error: `SKU ${update.sku} is already used by another variant.` },
            { status: 400 },
          );
        }
      }
    }

    // Apply updates in a transaction
    await db.$transaction(async (tx) => {
      for (const update of updates) {
        const updateData: Record<string, unknown> = {};

        if (update.price !== undefined) updateData.price = toMinor(update.price);
        if (update.compareAtPrice !== undefined)
          updateData.compareAtPrice = update.compareAtPrice !== null ? toMinor(update.compareAtPrice) : null;
        if (update.costPrice !== undefined)
          updateData.costPrice = update.costPrice !== null ? toMinor(update.costPrice) : null;
        if (update.sku !== undefined) updateData.sku = update.sku;
        if (update.barcode !== undefined) updateData.barcode = update.barcode;
        if (update.weightGrams !== undefined) updateData.weightGrams = update.weightGrams;
        if (update.isActive !== undefined) updateData.isActive = update.isActive;

        if (Object.keys(updateData).length > 0) {
          await tx.variant.update({
            where: { id: update.id },
            data: updateData,
          });
        }

        if (update.stock !== undefined) {
          await tx.inventoryItem.upsert({
            where: { variantId: update.id },
            create: { variantId: update.id, onHand: update.stock },
            update: { onHand: update.stock },
          });
        }
      }
    });

    await refreshPriceRange(productId);
    revalidateProductCatalog(productId);

    await recordAudit({
      actorId: actor.id,
      action: "variant.bulk_update",
      entity: "Product",
      entityId: productId,
      source: "admin",
      after: { updatedCount: updates.length },
    });

    const updatedVariants = await db.variant.findMany({
      where: { productId },
      orderBy: { position: "asc" },
      include: {
        inventory: true,
        optionValues: {
          include: { optionValue: true },
        },
      },
    });

    return NextResponse.json({ ok: true, variants: updatedVariants });
  },
);
