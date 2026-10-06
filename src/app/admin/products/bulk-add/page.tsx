import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { SectionHeading, Badge } from "@/components/ui";
import { BulkAddWizard } from "@/components/admin/bulk-add/bulk-add-wizard";
import { BulkAddNav, DesktopOnly } from "@/components/admin/bulk-add/desktop-only";
import { recipeConfigSchema } from "@/lib/bulk-import/schema";
import { getBulkAiConfig, vendorKey } from "@/lib/bulk-ai/model-registry";

export const metadata: Metadata = { title: "Bulk Product Add" };
export const dynamic = "force-dynamic";

export default async function BulkProductAddPage() {
  await requirePermission("products:write");

  const [recipes, library, categories, collections, profiles, recent, aiConfig] = await Promise.all([
    db.productRecipe.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    db.catalogOptionDefinition.findMany({ orderBy: [{ position: "asc" }, { name: "asc" }], include: { values: { orderBy: { position: "asc" } } } }),
    db.category.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.collection.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.catalogSourceProfile.findMany({ include: { source: { select: { name: true } } }, orderBy: { updatedAt: "desc" } }),
    db.productImportBatch.findMany({
      where: { status: { notIn: ["COMPLETED", "CANCELLED"] } },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, name: true, status: true, createdAt: true },
    }),
    getBulkAiConfig(),
  ]);
  const aiKey = await vendorKey(aiConfig);

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading
        title="Bulk Product Add"
        description="Tell us what you received, how you sell it and the facts you know. We handle the rest and only show you what needs attention."
      />
      <BulkAddNav active="add" />
      <DesktopOnly>
        {recent.length > 0 && (
          <div className="mb-6 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-[var(--text-secondary)]">Continue:</span>
            {recent.map((b) => (
              <Link key={b.id} href={`/admin/products/bulk-add/${b.id}`} className="inline-flex items-center gap-2 rounded-full border border-[var(--border-subtle)] px-3 py-1 hover:border-[var(--accent)]">
                {b.name} <Badge>{b.status.replace(/_/g, " ").toLowerCase()}</Badge>
              </Link>
            ))}
          </div>
        )}
        <BulkAddWizard
          recipes={recipes.map((r) => ({
            id: r.id,
            name: r.name,
            description: r.description,
            version: r.version,
            config: recipeConfigSchema.parse(r.config ?? {}),
          }))}
          library={library.map((o) => ({ name: o.name, values: o.values.map((v) => v.value) }))}
          categories={categories}
          collections={collections}
          profiles={profiles.map((p) => ({ id: p.id, name: p.name, sourceName: p.source.name }))}
          aiAvailable={aiConfig.bulkAiEnabled && Boolean(aiKey)}
        />
      </DesktopOnly>
    </div>
  );
}
