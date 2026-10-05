"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { Alert, Button, Card } from "@/components/ui";
import { deleteRecipeAction, saveRecipeAction, seedRecipesAction } from "@/app/actions/admin/catalog-library";
import type { RecipeConfig } from "@/lib/bulk-import/schema";
import { CombinationToggles, PricingEditor, SoldAsPicker, StockEditor, type LibraryOption } from "./setup-editors";

type Recipe = { id: string; name: string; description: string | null; config: RecipeConfig; version: number };
type Named = { id: string; name: string };

const blank = (): RecipeConfig => ({
  categoryIds: [],
  options: [],
  pricing: { mode: "SAME", price: null },
  inventory: { mode: "SAME", quantity: 0 },
  imageRole: { mode: "SEPARATE_PRODUCTS" },
  tags: [],
});

export function RecipeManager({ recipes, library, categories }: { recipes: Recipe[]; library: LibraryOption[]; categories: Named[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<{ id?: string; name: string; description: string; config: RecipeConfig } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const save = () =>
    start(async () => {
      if (!editing) return;
      setError(null);
      const res = await saveRecipeAction(editing);
      if (!res.ok) setError(res.message);
      else {
        setEditing(null);
        router.refresh();
      }
    });

  if (editing) {
    const c = editing.config;
    const set = (p: Partial<RecipeConfig>) => setEditing({ ...editing, config: { ...c, ...p } });
    const shape = c.options.map((o) => o.name + o.values.length).join();
    return (
      <div className="space-y-6">
        {error && <Alert tone="danger">{error}</Alert>}
        <Card className="grid gap-4 p-6 md:grid-cols-2">
          <label className="block text-sm">
            Recipe name
            <input className="lx-field mt-1 w-full" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
          </label>
          <label className="block text-sm">
            Description
            <input className="lx-field mt-1 w-full" value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
          </label>
          <label className="block text-sm">
            Category
            <select className="lx-field mt-1 w-full" value={c.categoryIds[0] ?? ""} onChange={(e) => set({ categoryIds: e.target.value ? [e.target.value] : [] })}>
              <option value="">—</option>
              {categories.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            SKU prefix
            <input className="lx-field mt-1 w-full" value={c.skuPrefix ?? ""} onChange={(e) => set({ skuPrefix: e.target.value || null })} />
          </label>
          <label className="block text-sm">
            Material
            <input className="lx-field mt-1 w-full" value={c.material ?? ""} onChange={(e) => set({ material: e.target.value || null })} />
          </label>
          <label className="block text-sm">
            Care
            <input className="lx-field mt-1 w-full" value={c.care ?? ""} onChange={(e) => set({ care: e.target.value || null })} />
          </label>
          <label className="block text-sm md:col-span-2">
            Tags (comma separated)
            <input className="lx-field mt-1 w-full" defaultValue={c.tags.join(", ")} onBlur={(e) => set({ tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })} />
          </label>
        </Card>
        <Card className="space-y-4 p-6">
          <h3 className="text-base font-medium">How is this product sold?</h3>
          <SoldAsPicker options={c.options} onChange={(options) => set({ options })} library={library} />
          <CombinationToggles options={c.options} disabled={[]} onChange={() => undefined} />
        </Card>
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="p-6" key={`p-${shape}`}>
            <h3 className="mb-3 text-base font-medium">How does the price change?</h3>
            <PricingEditor options={c.options} value={c.pricing} onChange={(pricing) => set({ pricing })} allowSource />
          </Card>
          <Card className="p-6" key={`s-${shape}`}>
            <h3 className="mb-3 text-base font-medium">How is stock tracked?</h3>
            <StockEditor options={c.options} value={c.inventory} onChange={(inventory) => set({ inventory })} allowSource />
          </Card>
        </div>
        <Card className="p-6">
          <h3 className="mb-3 text-base font-medium">What does each photo usually represent?</h3>
          <select
            className="lx-field"
            value={c.imageRole.mode === "OPTION" ? `OPTION:${c.imageRole.option ?? ""}` : c.imageRole.mode}
            onChange={(e) => {
              const v = e.target.value;
              set({ imageRole: v.startsWith("OPTION:") ? { mode: "OPTION", option: v.slice(7) } : { mode: v as "SEPARATE_PRODUCTS" | "SAME_PRODUCT" } });
            }}
          >
            <option value="SEPARATE_PRODUCTS">Each photo is a separate product</option>
            <option value="SAME_PRODUCT">Several photos belong to the same product</option>
            {c.options.map((o) => <option key={o.name} value={`OPTION:${o.name}`}>Photos represent {o.name}</option>)}
          </select>
        </Card>
        <div className="flex gap-2">
          <Button type="button" onClick={save} disabled={pending}>{pending && <Loader2 className="h-4 w-4 animate-spin" />} Save recipe</Button>
          <Button type="button" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && <Alert tone="danger">{error}</Alert>}
      <div className="flex gap-2">
        <Button type="button" onClick={() => setEditing({ name: "", description: "", config: blank() })}><Plus className="h-4 w-4" /> New recipe</Button>
        <Button
          type="button"
          variant="secondary"
          disabled={pending}
          onClick={() => start(async () => { await seedRecipesAction(); router.refresh(); })}
        >
          Add starter recipes
        </Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {recipes.map((r) => (
          <Card key={r.id} className="p-5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-medium">{r.name}</div>
                {r.description && <div className="mt-1 text-xs text-[var(--text-secondary)]">{r.description}</div>}
              </div>
              <span className="text-[10px] text-[var(--text-secondary)]">v{r.version}</span>
            </div>
            <ul className="mt-3 space-y-0.5 text-xs text-[var(--text-secondary)]">
              {r.config.options.length === 0 && <li>Just one version</li>}
              {r.config.options.map((o) => <li key={o.name}>{o.name}: {o.values.join(", ") || "values chosen per import"}</li>)}
              <li>Price: {describePricing(r.config)}</li>
            </ul>
            <div className="mt-4 flex gap-3 text-sm">
              <button type="button" className="text-[var(--accent)] underline" onClick={() => setEditing({ id: r.id, name: r.name, description: r.description ?? "", config: r.config })}>Edit</button>
              <button
                type="button"
                className="text-[var(--text-secondary)] underline"
                onClick={() => {
                  if (confirm(`Archive the ${r.name} recipe?`)) start(async () => { await deleteRecipeAction(r.id); router.refresh(); });
                }}
              >
                Archive
              </button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function describePricing(c: RecipeConfig): string {
  switch (c.pricing.mode) {
    case "SAME":
      return c.pricing.price != null ? `GH₵${(c.pricing.price / 100).toFixed(2)} for everything` : "set per import";
    case "BY_OPTION":
      return `changes by ${c.pricing.option}`;
    case "BY_OPTIONS":
      return "several choices affect it";
    case "BY_COMBINATION":
      return "per combination";
    case "SOURCE":
      return "from the spreadsheet";
  }
}
