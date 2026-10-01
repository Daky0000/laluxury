import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireBearerPermission, getOptionalBearerStaff, apiOptionsResponse, withApiAuth } from "@/lib/auth/bearer";
import { can } from "@/lib/auth/rbac";
import { uniqueSlug, slugify } from "@/lib/slug";
import { buildSearchText } from "@/lib/catalog";
import { recordAudit } from "@/lib/audit";
import { revalidateProductCatalog } from "@/lib/catalog-revalidate";
import type { ProductStatus } from "@/generated/prisma";

export const runtime = "nodejs";

export const OPTIONS = apiOptionsResponse;

const updateProductSchema = z.object({
  title: z.string().trim().min(1).optional(),
  slug: z.string().trim().optional(),
  status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]).optional(),
  compareAtPrice: z.number().min(0).nullable().optional(),
  shortDescription: z.string().trim().nullable().optional(),
  description: z.string().trim().nullable().optional(),
  brand: z.string().trim().nullable().optional(),
  material: z.string().trim().nullable().optional(),
  care: z.string().trim().nullable().optional(),
  tags: z.union([z.array(z.string()), z.string()]).optional(),
  isFeatured: z.boolean().optional(),
  isPreorder: z.boolean().optional(),
  preorderLeadTime: z.string().trim().nullable().optional(),
  preorderDepositPercent: z.number().int().min(10).max(100).nullable().optional(),
  preorderNote: z.string().trim().nullable().optional(),
  metaTitle: z.string().trim().nullable().optional(),
  metaDescription: z.string().trim().nullable().optional(),
  categoryIds: z.array(z.string()).optional(),
  collectionIds: z.array(z.string()).optional(),
});

function toMinor(val: number): number {
  if (!Number.isFinite(val)) return 0;
  return Number.isInteger(val) ? val : Math.round(val * 100);
}

function parseTags(raw?: string[] | string): string[] | undefined {
  if (!raw) return undefined;
  if (Array.isArray(raw)) {
    return raw.map((t) => t.trim()).filter(Boolean);
  }
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// GET /api/app/products/[id]
// ---------------------------------------------------------------------------

export const GET = withApiAuth(
  async (_request: Request, ctx: { params: Promise<{ id: string }> }) => {
    const staff = await getOptionalBearerStaff();
    const isAuthorizedStaff = Boolean(staff && can(staff.role, "products:read"));
    const { id } = await ctx.params;

    const product = await db.product.findUnique({
      where: { id },
      include: {
        images: {
          orderBy: { position: "asc" },
          include: {
            optionValue: {
              select: { id: true, value: true, hexColor: true },
            },
          },
        },
        options: {
          orderBy: { position: "asc" },
          include: {
            values: { orderBy: { position: "asc" } },
          },
        },
        variants: {
          orderBy: { position: "asc" },
          include: {
            inventory: true,
            optionValues: {
              include: {
                optionValue: {
                  include: {
                    option: { select: { id: true, name: true } },
                  },
                },
              },
            },
          },
        },
        categories: {
          include: {
            category: true,
          },
        },
        collections: {
          include: {
            collection: true,
          },
        },
        _count: {
          select: {
            orderItems: true,
            reviews: true,
          },
        },
      },
    });

    if (!product || (!isAuthorizedStaff && product.status !== "ACTIVE")) {
      return NextResponse.json({ error: "Product not found." }, { status: 404 });
    }

    const unitsSold = await db.orderItem.aggregate({
      where: { productId: id },
      _sum: { quantity: true },
    });

    return NextResponse.json({
      product: {
        ...product,
        categories: product.categories.map((c) => c.category),
        collections: product.collections.map((c) => c.collection),
        stats: {
          ordersCount: product._count.orderItems,
          unitsSold: unitsSold._sum.quantity ?? 0,
          reviewsCount: product._count.reviews,
        },
      },
    });
  },
);

// ---------------------------------------------------------------------------
// PATCH /api/app/products/[id]
// ---------------------------------------------------------------------------

export const PATCH = withApiAuth(
  async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
    const actor = await requireBearerPermission("products:write");
    const { id } = await ctx.params;

    const existing = await db.product.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Product not found." }, { status: 404 });
    }

    const json = await request.json().catch(() => null);
    const parsed = updateProductSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid update input." },
        { status: 400 },
      );
    }

    const data = parsed.data;
    const title = data.title ?? existing.title;
    const tags = data.tags !== undefined ? parseTags(data.tags) ?? [] : existing.tags;

    let slug = existing.slug;
    if (data.slug?.trim()) {
      const targetSlug = slugify(data.slug);
      if (targetSlug !== existing.slug) {
        slug = await uniqueSlug("product", targetSlug, id);
      }
    } else if (data.title && data.title !== existing.title) {
      slug = await uniqueSlug("product", data.title, id);
    }

    const compareAtPrice =
      data.compareAtPrice !== undefined
        ? data.compareAtPrice !== null
          ? toMinor(data.compareAtPrice)
          : null
        : existing.compareAtPrice;

    const isPreorder = data.isPreorder ?? existing.isPreorder;

    await db.$transaction(async (tx) => {
      await tx.product.update({
        where: { id },
        data: {
          title,
          slug,
          status: (data.status as ProductStatus) ?? existing.status,
          compareAtPrice,
          shortDescription:
            data.shortDescription !== undefined ? data.shortDescription : existing.shortDescription,
          description: data.description !== undefined ? data.description : existing.description,
          brand: data.brand !== undefined ? data.brand : existing.brand,
          material: data.material !== undefined ? data.material : existing.material,
          care: data.care !== undefined ? data.care : existing.care,
          tags,
          isFeatured: data.isFeatured ?? existing.isFeatured,
          isPreorder,
          preorderLeadTime: isPreorder
            ? data.preorderLeadTime ?? existing.preorderLeadTime ?? "4–6 weeks"
            : null,
          preorderDepositPercent: isPreorder
            ? data.preorderDepositPercent ?? existing.preorderDepositPercent ?? 50
            : null,
          preorderNote: isPreorder ? data.preorderNote ?? existing.preorderNote : null,
          metaTitle: data.metaTitle !== undefined ? data.metaTitle : existing.metaTitle,
          metaDescription:
            data.metaDescription !== undefined ? data.metaDescription : existing.metaDescription,
          publishedAt:
            data.status === "ACTIVE" && !existing.publishedAt ? new Date() : existing.publishedAt,
          searchText: buildSearchText({
            title,
            tags,
            brand: data.brand !== undefined ? data.brand : existing.brand,
            material: data.material !== undefined ? data.material : existing.material,
            shortDescription:
              data.shortDescription !== undefined ? data.shortDescription : existing.shortDescription,
          }),
        },
      });

      if (isPreorder) {
        await tx.inventoryItem.updateMany({
          where: { variant: { productId: id } },
          data: { allowBackorder: true },
        });
      }

      if (data.categoryIds !== undefined) {
        const catSet = new Set(data.categoryIds);
        if (isPreorder) {
          const preorderCat = await tx.category.findUnique({
            where: { slug: "pre-order" },
            select: { id: true },
          });
          if (preorderCat) catSet.add(preorderCat.id);
        }

        await tx.productCategory.deleteMany({ where: { productId: id } });
        if (catSet.size > 0) {
          await tx.productCategory.createMany({
            data: [...catSet].map((categoryId) => ({ productId: id, categoryId })),
          });
        }
      }

      if (data.collectionIds !== undefined) {
        await tx.productCollection.deleteMany({ where: { productId: id } });
        if (data.collectionIds.length > 0) {
          await tx.productCollection.createMany({
            data: data.collectionIds.map((collectionId) => ({ productId: id, collectionId })),
          });
        }
      }
    });

    await recordAudit({
      actorId: actor.id,
      action: "product.update",
      entity: "Product",
      entityId: id,
      source: "admin",
      before: { title: existing.title, status: existing.status, isPreorder: existing.isPreorder },
      after: { title, status: data.status ?? existing.status, isPreorder },
    });

    revalidateProductCatalog(id);

    const updated = await db.product.findUnique({
      where: { id },
      include: {
        images: { orderBy: { position: "asc" } },
        variants: { include: { inventory: true } },
        categories: { include: { category: true } },
        collections: { include: { collection: true } },
      },
    });

    return NextResponse.json({ ok: true, product: updated });
  },
);

// ---------------------------------------------------------------------------
// DELETE /api/app/products/[id]
// ---------------------------------------------------------------------------

export const DELETE = withApiAuth(
  async (_request: Request, ctx: { params: Promise<{ id: string }> }) => {
    const actor = await requireBearerPermission("products:write");
    const { id } = await ctx.params;

    const existing = await db.product.findUnique({ where: { id }, select: { id: true, title: true } });
    if (!existing) {
      return NextResponse.json({ error: "Product not found." }, { status: 404 });
    }

    const soldCount = await db.orderItem.count({ where: { productId: id } });

    if (soldCount > 0) {
      // Archive instead to protect order line history
      await db.product.update({
        where: { id },
        data: { status: "ARCHIVED" },
      });

      await recordAudit({
        actorId: actor.id,
        action: "product.archive",
        entity: "Product",
        entityId: id,
        source: "admin",
        after: { reason: "Product has sales history, archived rather than deleted" },
      });

      revalidateProductCatalog(id);

      return NextResponse.json({
        ok: true,
        archived: true,
        message: "This product has sales history, so it was archived instead of deleted.",
      });
    }

    await db.product.delete({ where: { id } });

    await recordAudit({
      actorId: actor.id,
      action: "product.delete",
      entity: "Product",
      entityId: id,
      source: "admin",
      after: { title: existing.title },
    });

    revalidateProductCatalog(id);

    return NextResponse.json({ ok: true, deleted: true, message: "Product deleted successfully." });
  },
);
