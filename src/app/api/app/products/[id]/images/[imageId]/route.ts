import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireBearerPermission, withApiAuth } from "@/lib/auth/bearer";
import { revalidateProductCatalog } from "@/lib/catalog-revalidate";

export const runtime = "nodejs";

const updateImageSchema = z.object({
  alt: z.string().trim().nullable().optional(),
  position: z.number().int().min(0).optional(),
  optionValueId: z.string().nullable().optional(),
});

// ---------------------------------------------------------------------------
// DELETE /api/app/products/[id]/images/[imageId]
// ---------------------------------------------------------------------------

export const DELETE = withApiAuth(
  async (
    _request: Request,
    ctx: { params: Promise<{ id: string; imageId: string }> },
  ) => {
    await requireBearerPermission("products:write");
    const { id: productId, imageId } = await ctx.params;

    const image = await db.productImage.findFirst({
      where: { id: imageId, productId },
      select: { id: true },
    });

    if (!image) {
      return NextResponse.json({ error: "Image not found on this product." }, { status: 404 });
    }

    await db.productImage.delete({ where: { id: imageId } });

    revalidateProductCatalog(productId);

    return NextResponse.json({ ok: true, message: "Image removed." });
  },
);

// ---------------------------------------------------------------------------
// PATCH /api/app/products/[id]/images/[imageId]
// ---------------------------------------------------------------------------

export const PATCH = withApiAuth(
  async (
    request: Request,
    ctx: { params: Promise<{ id: string; imageId: string }> },
  ) => {
    await requireBearerPermission("products:write");
    const { id: productId, imageId } = await ctx.params;

    const existing = await db.productImage.findFirst({
      where: { id: imageId, productId },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Image not found on this product." }, { status: 404 });
    }

    const json = await request.json().catch(() => null);
    const parsed = updateImageSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid update payload." },
        { status: 400 },
      );
    }

    const data = parsed.data;
    const updateData: Record<string, unknown> = {};

    if (data.alt !== undefined) updateData.alt = data.alt;
    if (data.position !== undefined) updateData.position = data.position;
    if (data.optionValueId !== undefined) updateData.optionValueId = data.optionValueId;

    const updated = await db.productImage.update({
      where: { id: imageId },
      data: updateData,
    });

    revalidateProductCatalog(productId);

    return NextResponse.json({ ok: true, image: updated });
  },
);
