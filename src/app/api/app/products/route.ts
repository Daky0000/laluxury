import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireBearerPermission, getOptionalBearerStaff, apiOptionsResponse, withApiAuth } from "@/lib/auth/bearer";
import { can } from "@/lib/auth/rbac";
import { uniqueSlug, skuFromTitle } from "@/lib/slug";
import { buildSearchText } from "@/lib/catalog";
import { recordAudit } from "@/lib/audit";
import { revalidateProductCatalog } from "@/lib/catalog-revalidate";
import type { Prisma, ProductStatus } from "@/generated/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export const OPTIONS = apiOptionsResponse;

const createProductSchema = z.object({
  title: z.string().trim().min(1, "Product title is required."),
  price: z.number().min(0, "Price must be at least 0."),
  compareAtPrice: z.number().min(0).nullable().optional(),
  costPrice: z.number().min(0).nullable().optional(),
  stock: z.number().int().min(0).optional().default(0),
  sku: z.string().trim().optional(),
  slug: z.string().trim().optional(),
  status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]).optional().default("DRAFT"),
  shortDescription: z.string().trim().nullable().optional(),
  description: z.string().trim().nullable().optional(),
  brand: z.string().trim().nullable().optional(),
  material: z.string().trim().nullable().optional(),
  care: z.string().trim().nullable().optional(),
  tags: z.union([z.array(z.string()), z.string()]).optional().default([]),
  isFeatured: z.boolean().optional().default(false),
  isPreorder: z.boolean().optional().default(false),
  preorderLeadTime: z.string().trim().nullable().optional(),
  preorderDepositPercent: z.number().int().min(10).max(100).nullable().optional(),
  preorderNote: z.string().trim().nullable().optional(),
  metaTitle: z.string().trim().nullable().optional(),
  metaDescription: z.string().trim().nullable().optional(),
  categoryIds: z.array(z.string()).optional().default([]),
  collectionIds: z.array(z.string()).optional().default([]),
  imageUrls: z.array(z.string().url()).optional().default([]),
});

/**
 * Normalises money to minor units (pesewas).
 * If a decimal is passed (e.g. 120.5), converts to 12050.
 * If an integer minor unit is passed (e.g. 12050), retains as 12050.
 */
function toMinor(val: number): number {
  if (!Number.isFinite(val)) return 0;
  return Number.isInteger(val) ? val : Math.round(val * 100);
}

function parseTags(raw: string[] | string): string[] {
  if (Array.isArray(raw)) {
    return raw.map((t) => t.trim()).filter(Boolean);
  }
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// GET /api/app/products
// ---------------------------------------------------------------------------

export const GET = withApiAuth(async (request: Request) => {
  const staff = await getOptionalBearerStaff();
  const isAuthorizedStaff = Boolean(staff && can(staff.role, "products:read"));

  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "20", 10)));
  const skip = (page - 1) * limit;

  const query = url.searchParams.get("q")?.trim();
  const statusParam = url.searchParams.get("status")?.toUpperCase();
  const categoryId = url.searchParams.get("categoryId")?.trim();
  const collectionId = url.searchParams.get("collectionId")?.trim();
  const stockParam = url.searchParams.get("stock")?.toLowerCase(); // 'out' | 'low' | 'in'
  const isFeatured = url.searchParams.has("isFeatured")
    ? url.searchParams.get("isFeatured") === "true"
    : undefined;
  const isPreorder = url.searchParams.has("isPreorder")
    ? url.searchParams.get("isPreorder") === "true"
    : undefined;

  const and: Prisma.ProductWhereInput[] = [];

  if (!isAuthorizedStaff) {
    // Public/unauthenticated caller can only view ACTIVE products
    and.push({ status: "ACTIVE" });
  } else if (statusParam && ["DRAFT", "ACTIVE", "ARCHIVED"].includes(statusParam)) {
    and.push({ status: statusParam as ProductStatus });
  }

  if (query) {
    const term = query.toLowerCase();
    and.push({
      OR: [
        { searchText: { contains: term } },
        { title: { contains: term, mode: "insensitive" } },
        { variants: { some: { sku: { contains: term, mode: "insensitive" } } } },
      ],
    });
  }

  if (categoryId) {
    and.push({ categories: { some: { categoryId } } });
  }

  if (collectionId) {
    and.push({ collections: { some: { collectionId } } });
  }

  if (isFeatured !== undefined) {
    and.push({ isFeatured });
  }

  if (isPreorder !== undefined) {
    and.push({ isPreorder });
  }

  if (stockParam === "out") {
    and.push({
      variants: {
        every: {
          inventory: {
            onHand: { lte: 0 },
            allowBackorder: false,
          },
        },
      },
    });
  } else if (stockParam === "low") {
    and.push({
      variants: {
        some: {
          inventory: {
            onHand: { gt: 0, lte: 5 },
          },
        },
      },
    });
  } else if (stockParam === "in") {
    and.push({
      variants: {
        some: {
          OR: [
            { inventory: { onHand: { gt: 0 } } },
            { inventory: { allowBackorder: true } },
          ],
        },
      },
    });
  }

  const where: Prisma.ProductWhereInput = and.length ? { AND: and } : {};

  const [total, products] = await Promise.all([
    db.product.count({ where }),
    db.product.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      include: {
        images: {
          orderBy: { position: "asc" },
          take: 3,
          select: {
            id: true,
            url: true,
            alt: true,
            position: true,
          },
        },
        categories: {
          select: {
            category: {
              select: { id: true, name: true, slug: true },
            },
          },
        },
        collections: {
          select: {
            collection: {
              select: { id: true, name: true, slug: true },
            },
          },
        },
        variants: {
          select: {
            id: true,
            sku: true,
            price: true,
            isActive: true,
            inventory: {
              select: {
                onHand: true,
                reserved: true,
                allowBackorder: true,
              },
            },
          },
        },
        _count: {
          select: {
            variants: true,
            images: true,
            orderItems: true,
          },
        },
      },
    }),
  ]);

  const formatted = products.map((p) => {
    const totalStock = p.variants.reduce((acc, v) => acc + (v.inventory?.onHand ?? 0), 0);
    return {
      id: p.id,
      title: p.title,
      slug: p.slug,
      status: p.status,
      minPrice: p.minPrice,
      maxPrice: p.maxPrice,
      compareAtPrice: p.compareAtPrice,
      brand: p.brand,
      material: p.material,
      isFeatured: p.isFeatured,
      isPreorder: p.isPreorder,
      tags: p.tags,
      totalStock,
      variantCount: p._count.variants,
      imageCount: p._count.images,
      salesCount: p._count.orderItems,
      images: p.images,
      categories: p.categories.map((c) => c.category),
      collections: p.collections.map((c) => c.collection),
      variants: p.variants.map((v) => ({
        id: v.id,
        title: "Default",
        sku: v.sku,
        price: v.price,
        compareAtPrice: p.compareAtPrice,
        costPrice: null,
        isActive: v.isActive,
        stock: v.inventory?.onHand ?? 0,
        available: v.inventory
          ? Math.max(0, v.inventory.onHand - v.inventory.reserved)
          : 0,
      })),
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    };
  });

  return NextResponse.json({
    products: formatted,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// ---------------------------------------------------------------------------
// POST /api/app/products
// ---------------------------------------------------------------------------

export const POST = withApiAuth(async (request: Request) => {
  const actor = await requireBearerPermission("products:write");

  const json = await request.json().catch(() => null);
  const parsed = createProductSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid product input." },
      { status: 400 },
    );
  }

  const data = parsed.data;
  const price = toMinor(data.price);
  const compareAtPrice = data.compareAtPrice != null ? toMinor(data.compareAtPrice) : null;
  const costPrice = data.costPrice != null ? toMinor(data.costPrice) : null;
  const tags = parseTags(data.tags);

  const slug = await uniqueSlug("product", data.slug || data.title);
  let sku = data.sku || `${skuFromTitle(data.title)}-01`;

  // Avoid SKU duplicate collisions
  const existingSku = await db.variant.findUnique({ where: { sku }, select: { id: true } });
  if (existingSku) {
    sku = `${sku}-${Date.now().toString(36).slice(-4).toUpperCase()}`;
  }

  const categorySet = new Set(data.categoryIds);
  if (data.isPreorder) {
    const preorderCat = await db.category.findUnique({
      where: { slug: "pre-order" },
      select: { id: true },
    });
    if (preorderCat) categorySet.add(preorderCat.id);
  }

  const product = await db.product.create({
    data: {
      title: data.title,
      slug,
      shortDescription: data.shortDescription ?? null,
      description: data.description ?? null,
      status: data.status,
      brand: data.brand ?? null,
      material: data.material ?? null,
      care: data.care ?? null,
      tags,
      isFeatured: data.isFeatured,
      isPreorder: data.isPreorder,
      preorderLeadTime: data.isPreorder ? (data.preorderLeadTime ?? "4–6 weeks") : null,
      preorderDepositPercent: data.isPreorder ? (data.preorderDepositPercent ?? 50) : null,
      preorderNote: data.isPreorder ? (data.preorderNote ?? null) : null,
      metaTitle: data.metaTitle ?? null,
      metaDescription: data.metaDescription ?? null,
      publishedAt: data.status === "ACTIVE" ? new Date() : null,
      minPrice: price,
      maxPrice: price,
      compareAtPrice,
      searchText: buildSearchText({
        title: data.title,
        tags,
        brand: data.brand,
        material: data.material,
        shortDescription: data.shortDescription,
      }),
      variants: {
        create: {
          title: "Default",
          sku,
          price,
          compareAtPrice,
          costPrice,
          inventory: {
            create: {
              onHand: data.stock,
              allowBackorder: data.isPreorder,
            },
          },
        },
      },
      categories: {
        create: [...categorySet].map((categoryId) => ({ categoryId })),
      },
      collections: {
        create: data.collectionIds.map((collectionId) => ({ collectionId })),
      },
      images: {
        create: data.imageUrls.map((url, position) => ({
          url,
          position,
        })),
      },
    },
    include: {
      variants: {
        include: { inventory: true },
      },
      images: true,
      categories: { include: { category: true } },
      collections: { include: { collection: true } },
    },
  });

  await recordAudit({
    actorId: actor.id,
    action: "product.create",
    entity: "Product",
    entityId: product.id,
    source: "admin",
    after: { title: product.title, slug, price, isPreorder: product.isPreorder },
  });

  revalidateProductCatalog(product.id);

  return NextResponse.json({ ok: true, product }, { status: 201 });
});
