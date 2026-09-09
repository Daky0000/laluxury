import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/auth/rbac";
import { SectionHeading } from "@/components/ui";
import { CategoryManager, CollectionManager } from "@/components/admin/catalog-manager";

export const metadata: Metadata = { title: "Categories" };

/**
 * The shape of the catalogue: which rooms exist, in what order, with what
 * picture, and which edits cut across them. Until this page existed the rooms
 * came from the seed alone, and a new one meant a deploy.
 */
export default async function AdminCategoriesPage() {
  const user = await requirePermission("products:read");

  const [categories, collections] = await Promise.all([
    db.category.findMany({
      orderBy: [{ position: "asc" }, { name: "asc" }],
      include: { _count: { select: { products: true } } },
    }),
    db.collection.findMany({
      orderBy: [{ position: "asc" }, { name: "asc" }],
      include: { _count: { select: { products: true } } },
    }),
  ]);

  const canWrite = can(user.role, "products:write");

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading
        title="Categories & collections"
        description="Categories are the rooms a product lives in and what the storefront navigates by. Collections are edits across rooms. A product is filed under either from its own editor."
      />

      <CategoryManager
        canWrite={canWrite}
        categories={categories.map((category) => ({
          id: category.id,
          name: category.name,
          slug: category.slug,
          description: category.description,
          imageUrl: category.imageUrl,
          parentId: category.parentId,
          position: category.position,
          isActive: category.isActive,
          productCount: category._count.products,
        }))}
      />

      <CollectionManager
        canWrite={canWrite}
        collections={collections.map((collection) => ({
          id: collection.id,
          name: collection.name,
          slug: collection.slug,
          description: collection.description,
          imageUrl: collection.imageUrl,
          isFeatured: collection.isFeatured,
          isActive: collection.isActive,
          position: collection.position,
          productCount: collection._count.products,
        }))}
      />
    </div>
  );
}
