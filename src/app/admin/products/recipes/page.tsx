import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { SectionHeading } from "@/components/ui";
import { BulkAddNav, DesktopOnly } from "@/components/admin/bulk-add/desktop-only";
import { RecipeManager } from "@/components/admin/bulk-add/recipe-manager";
import { recipeConfigSchema } from "@/lib/bulk-import/schema";

export const metadata: Metadata = { title: "Product Recipes" };
export const dynamic = "force-dynamic";

export default async function RecipesPage() {
  await requirePermission("products:write");
  const [recipes, library, categories] = await Promise.all([
    db.productRecipe.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    db.catalogOptionDefinition.findMany({ orderBy: { name: "asc" }, include: { values: { orderBy: { position: "asc" } } } }),
    db.category.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <SectionHeading
        title="Product Recipes"
        description="How a product family is normally sold — options, pricing, stock and photos. Recipes fill in the answers for an import; you can always change them."
      />
      <BulkAddNav active="recipes" />
      <DesktopOnly>
        <RecipeManager
          recipes={recipes.map((r) => ({ id: r.id, name: r.name, description: r.description, version: r.version, config: recipeConfigSchema.parse(r.config ?? {}) }))}
          library={library.map((o) => ({ name: o.name, values: o.values.map((v) => v.value) }))}
          categories={categories}
        />
      </DesktopOnly>
    </div>
  );
}
