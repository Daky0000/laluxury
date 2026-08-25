import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { ProductEditor, type EditorProduct } from "@/components/admin/product-editor";
import { Badge } from "@/components/ui";

export const metadata: Metadata = { title: "Edit product" };

export default async function EditProductPage({ params }: PageProps<"/admin/products/[id]">) {
  await requirePermission("products:write");
  const { id } = await params;

  const [product, categories, collections] = await Promise.all([
    db.product.findUnique({
      where: { id },
      include: {
        options: {
          orderBy: { position: "asc" },
          include: { values: { orderBy: { position: "asc" } } },
        },
        variants: {
          orderBy: { position: "asc" },
          include: { inventory: true },
        },
        images: { orderBy: { position: "asc" } },
        categories: { select: { categoryId: true } },
        collections: { select: { collectionId: true } },
      },
    }),
    db.category.findMany({ orderBy: { position: "asc" }, select: { id: true, name: true } }),
    db.collection.findMany({ orderBy: { position: "asc" }, select: { id: true, name: true } }),
  ]);

  if (!product) notFound();

  const editorProduct: EditorProduct = {
    id: product.id,
    title: product.title,
    slug: product.slug,
    shortDescription: product.shortDescription,
    description: product.description,
    status: product.status,
    brand: product.brand,
    material: product.material,
    care: product.care,
    tags: product.tags,
    isFeatured: product.isFeatured,
    metaTitle: product.metaTitle,
    metaDescription: product.metaDescription,
    categoryIds: product.categories.map((c) => c.categoryId),
    collectionIds: product.collections.map((c) => c.collectionId),
    options: product.options.map((o) => ({
      id: o.id,
      name: o.name,
      values: o.values.map((v) => ({ id: v.id, value: v.value, hexColor: v.hexColor })),
    })),
    variants: product.variants.map((v) => ({
      id: v.id,
      title: v.title,
      sku: v.sku,
      barcode: v.barcode,
      price: v.price,
      compareAtPrice: v.compareAtPrice,
      costPrice: v.costPrice,
      weightGrams: v.weightGrams,
      isActive: v.isActive,
      onHand: v.inventory?.onHand ?? 0,
      reserved: v.inventory?.reserved ?? 0,
    })),
    images: product.images.map((i) => ({
      id: i.id,
      url: i.url,
      alt: i.alt,
      optionValueId: i.optionValueId,
    })),
  };

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/admin/products"
        className="flex w-fit items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Products
      </Link>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl md:text-3xl">{product.title}</h1>
        <Badge
          tone={
            product.status === "ACTIVE" ? "success" : product.status === "DRAFT" ? "warning" : "neutral"
          }
        >
          {product.status.toLowerCase()}
        </Badge>
        {product.isFeatured ? <Badge tone="accent">Featured</Badge> : null}
      </div>

      <ProductEditor
        product={editorProduct}
        categories={categories}
        collections={collections}
      />
    </div>
  );
}
