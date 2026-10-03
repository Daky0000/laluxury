import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/auth/rbac";
import { SectionHeading } from "@/components/ui";
import { StoreDesignManager } from "@/components/admin/store-design-manager";

export const metadata: Metadata = { title: "Store Design" };

export default async function AdminStoreDesignPage() {
  const user = await requirePermission("products:read");

  const categories = await db.category.findMany({
    orderBy: [{ position: "asc" }, { name: "asc" }],
    include: { _count: { select: { products: true } } },
  });

  const canWrite = can(user.role, "products:write");

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading
        title="Store design"
        description="Manage the storefront category cards, room backgrounds, and visual display order across the website and mobile app."
      />

      <StoreDesignManager
        canWrite={canWrite}
        categories={categories.map((c) => ({
          id: c.id,
          name: c.name,
          slug: c.slug,
          description: c.description,
          imageUrl: c.imageUrl,
          position: c.position,
          isActive: c.isActive,
          productCount: c._count.products,
        }))}
      />
    </div>
  );
}
