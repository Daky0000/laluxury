import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { ProductCreateForm } from "@/components/admin/product-create-form";
import { SectionHeading } from "@/components/ui";

export const metadata: Metadata = { title: "New product" };

export default async function NewProductPage() {
  await requirePermission("products:write");

  const [categories, collections] = await Promise.all([
    db.category.findMany({ orderBy: { position: "asc" }, select: { id: true, name: true } }),
    db.collection.findMany({ orderBy: { position: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Link
        href="/admin/products"
        className="flex w-fit items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Products
      </Link>

      <SectionHeading
        title="New product"
        description="Starts with a single default variant. Add options and images once it exists, then publish."
      />

      <ProductCreateForm categories={categories} collections={collections} />
    </div>
  );
}
