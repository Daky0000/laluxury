import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { SectionHeading } from "@/components/ui";
import { HomeSectionsManager } from "@/components/admin/home-sections-manager";

export const metadata: Metadata = { title: "Home page" };

export default async function AdminHomePageSections() {
  await requirePermission("settings:manage");

  const [settings, categories, products] = await Promise.all([
    getSettings(),
    db.category.findMany({
      where: { isActive: true },
      orderBy: [{ position: "asc" }, { name: "asc" }],
      select: {
        name: true,
        slug: true,
        _count: { select: { products: { where: { product: { status: "ACTIVE" } } } } },
      },
    }),
    // Enough of the catalog to pick from by hand. The picker searches this list
    // in the browser, so it is one read rather than one per keystroke.
    db.product.findMany({
      where: { status: "ACTIVE" },
      orderBy: [{ isFeatured: "desc" }, { title: "asc" }],
      take: 400,
      select: {
        id: true,
        title: true,
        categories: { take: 1, select: { category: { select: { name: true } } } },
      },
    }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/admin/settings"
        className="inline-flex w-fit items-center gap-1.5 text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
        Settings
      </Link>

      <SectionHeading
        title="Home page"
        description="The sections the storefront home page is built from. Reorder them, hide one for a season, delete what you do not sell any more, and say which rooms or products each one shows."
      />

      <HomeSectionsManager
        initial={settings.homeSections}
        categories={categories.map((category) => ({
          name: category.name,
          slug: category.slug,
          count: category._count.products,
        }))}
        products={products.map((product) => ({
          id: product.id,
          title: product.title,
          category: product.categories[0]?.category.name ?? "",
        }))}
      />
    </div>
  );
}
