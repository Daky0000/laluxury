"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, FileSpreadsheet, Images, Loader2, Sparkles, Upload } from "lucide-react";
import { Alert, Button, Card } from "@/components/ui";
import {
  createBatchAction,
  parseInstructionAction,
  startProcessingAction,
  updateBatchSetupAction,
} from "@/app/actions/admin/bulk-import";
import { saveLibraryOptionAction } from "@/app/actions/admin/catalog-library";
import type { BatchInstruction } from "@/lib/bulk-ai/schemas";
import {
  DEFAULT_AI_FIELDS,
  TARGET_FIELDS,
  type AiFields,
  type BatchSetup,
  type OptionSpec,
  type RecipeConfig,
} from "@/lib/bulk-import/schema";
import {
  CombinationToggles,
  PricingEditor,
  SoldAsPicker,
  StockEditor,
  type LibraryOption,
} from "./setup-editors";

type SourceKind = "PHOTOS" | "SPREADSHEET" | "PHOTOS_SPREADSHEET";
type Recipe = { id: string; name: string; description: string | null; version: number; config: RecipeConfig };
type Named = { id: string; name: string };
type Profile = { id: string; name: string; sourceName: string };

const FIELD_LABELS: Record<string, string> = {
  externalKey: "Supplier product key",
  parentSku: "Parent / style code",
  sku: "SKU",
  barcode: "Barcode",
  title: "Product title",
  shortDescription: "Short description",
  description: "Description",
  price: "Price",
  compareAtPrice: "Was-price",
  costPrice: "Cost price",
  stock: "Stock",
  category: "Category",
  collection: "Collection",
  brand: "Brand",
  material: "Material",
  care: "Care",
  tags: "Tags",
  imageFile: "Image file name",
  imageUrl: "Image URL",
  weightGrams: "Weight (g)",
};

const AI_LABELS: Record<keyof AiFields, string> = {
  titles: "Titles",
  descriptions: "Descriptions",
  seo: "SEO",
  altText: "Alt text",
  visual: "Visible colour/pattern",
  category: "Category",
  optionDetection: "Option detection",
};

const emptySetup = (): BatchSetup => ({
  recipeId: null,
  options: [],
  disabledCombinations: [],
  pricing: { mode: "SAME", price: null },
  stock: { mode: "SAME", quantity: 0 },
  imageRole: { mode: "SEPARATE_PRODUCTS" },
  aiEnabled: true,
  aiFields: DEFAULT_AI_FIELDS,
  defaults: { categoryIds: [], collectionIds: [], tags: [] },
});

export function BulkAddWizard({
  recipes,
  library,
  categories,
  collections,
  profiles,
  aiAvailable,
}: {
  recipes: Recipe[];
  library: LibraryOption[];
  categories: Named[];
  collections: Named[];
  profiles: Profile[];
  aiAvailable: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [kind, setKind] = useState<SourceKind>("PHOTOS");
  const [name, setName] = useState("");
  const [setup, setSetup] = useState<BatchSetup>(() => ({ ...emptySetup(), aiEnabled: aiAvailable }));
  const [resetKey, setResetKey] = useState(0);
  const [saveToLibrary, setSaveToLibrary] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [batchId, setBatchId] = useState<string | null>(null);
  const [photoProgress, setPhotoProgress] = useState<{ done: number; total: number; failed: string[]; duplicates: number } | null>(null);
  const [sheet, setSheet] = useState<{ headers: string[]; sample: Record<string, string>[]; rowCount: number; aiUsed: boolean } | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [profileId, setProfileId] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [profileName, setProfileName] = useState("");
  const [saveProfile, setSaveProfile] = useState(false);

  const [note, setNote] = useState("");
  const [parsed, setParsed] = useState<BatchInstruction | null>(null);

  const usesPhotos = kind !== "SPREADSHEET";
  const usesSheet = kind !== "PHOTOS";
  const patch = (p: Partial<BatchSetup>) => setSetup((s) => ({ ...s, ...p }));

  const applyRecipe = (id: string) => {
    const recipe = recipes.find((r) => r.id === id);
    if (!recipe) {
      patch({ recipeId: null });
      return;
    }
    const c = recipe.config;
    setSetup((s) => ({
      ...s,
      recipeId: recipe.id,
      recipeVersion: recipe.version,
      options: c.options,
      disabledCombinations: [],
      pricing: c.pricing,
      stock: c.inventory,
      imageRole: c.imageRole,
      defaults: {
        ...s.defaults,
        categoryIds: c.categoryIds.length ? c.categoryIds : s.defaults.categoryIds,
        material: c.material ?? s.defaults.material,
        care: c.care ?? s.defaults.care,
        tags: c.tags,
        skuPrefix: c.skuPrefix ?? s.defaults.skuPrefix,
      },
    }));
    setResetKey((k) => k + 1);
  };

  const readNote = async () => {
    setBusy("note");
    setError(null);
    const res = await parseInstructionAction(note);
    setBusy(null);
    if (!res.ok) setError(res.message);
    else setParsed(res.data ?? null);
  };

  const applyParsed = () => {
    if (!parsed) return;
    const recipe = parsed.recipeName ? recipes.find((r) => r.name.toLowerCase() === parsed.recipeName!.toLowerCase()) : null;
    if (recipe) applyRecipe(recipe.id);
    setSetup((s) => {
      const options: OptionSpec[] = [...(recipe ? recipe.config.options : s.options)];
      for (const o of parsed.options) {
        const i = options.findIndex((x) => x.name.toLowerCase() === o.name.toLowerCase());
        if (i >= 0) options[i] = { name: options[i].name, values: o.values };
        else options.push(o);
      }
      const category = parsed.category ? categories.find((c) => c.name.toLowerCase() === parsed.category!.toLowerCase()) : null;
      return {
        ...s,
        options,
        pricing: parsed.price != null ? { mode: "SAME", price: Math.round(parsed.price * 100) } : s.pricing,
        stock: parsed.stock != null ? { mode: "SAME", quantity: parsed.stock } : s.stock,
        imageRole: parsed.imageRole ? { mode: parsed.imageRole, option: parsed.imageOption ?? null } : s.imageRole,
        defaults: {
          ...s.defaults,
          material: parsed.material ?? s.defaults.material,
          categoryIds: category ? [category.id] : s.defaults.categoryIds,
        },
        instruction: note,
      };
    });
    setParsed(null);
    setResetKey((k) => k + 1);
  };

  const unsavedOptions = useMemo(
    () =>
      setup.options
        .filter((o) => o.name.trim())
        .map((o) => {
          const saved = library.find((l) => l.name === o.name)?.values ?? null;
          return { name: o.name, newValues: saved ? o.values.filter((v) => !saved.includes(v)) : o.values, isNew: !saved };
        })
        .filter((o) => o.isNew || o.newValues.length),
    [setup.options, library],
  );

  const goToUpload = async () => {
    setError(null);
    if (setup.options.some((o) => !o.name.trim() || o.values.length === 0)) {
      setError("Every option needs a name and at least one value.");
      return;
    }
    setBusy("batch");
    const res = batchId
      ? await updateBatchSetupAction(batchId, setup)
      : await createBatchAction({ name: name || defaultName(kind), sourceKind: kind, setup });
    setBusy(null);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    if (!batchId && res.data && "batchId" in res.data) setBatchId(res.data.batchId);
    setStep(3);
  };

  const uploadPhotos = async (files: FileList | null) => {
    if (!files?.length || !batchId) return;
    const list = [...files].filter((f) => f.type.startsWith("image/"));
    setPhotoProgress((p) => ({ done: p?.done ?? 0, total: (p?.total ?? 0) + list.length, failed: p?.failed ?? [], duplicates: p?.duplicates ?? 0 }));
    const groups: File[][] = [];
    for (let i = 0; i < list.length; i += 5) groups.push(list.slice(i, i + 5));
    let next = 0;
    const worker = async () => {
      while (next < groups.length) {
        const group = groups[next++];
        const form = new FormData();
        group.forEach((f) => form.append("files", f));
        try {
          const res = await fetch(`/api/admin/bulk-import/${batchId}/photos`, { method: "POST", body: form });
          const json = (await res.json()) as { ok: boolean; message?: string; results?: { name: string; ok: boolean; duplicate?: boolean; message?: string }[] };
          const failed = json.ok ? (json.results ?? []).filter((r) => !r.ok).map((r) => `${r.name}: ${r.message}`) : group.map((f) => `${f.name}: ${json.message}`);
          const dups = (json.results ?? []).filter((r) => r.duplicate).length;
          setPhotoProgress((p) => p && { ...p, done: p.done + group.length, failed: [...p.failed, ...failed], duplicates: p.duplicates + dups });
        } catch {
          setPhotoProgress((p) => p && { ...p, done: p.done + group.length, failed: [...p.failed, ...group.map((f) => `${f.name}: network error`)] });
        }
      }
    };
    await Promise.all([worker(), worker()]);
  };

  const uploadSheet = async (file: File | null) => {
    if (!file || !batchId) return;
    setBusy("sheet");
    setError(null);
    const form = new FormData();
    form.append("file", file);
    if (profileId) form.append("profileId", profileId);
    const res = await fetch(`/api/admin/bulk-import/${batchId}/file`, { method: "POST", body: form });
    const json = await res.json();
    setBusy(null);
    if (!json.ok) {
      setError(json.message);
      return;
    }
    setSheet({ headers: json.headers, sample: json.sample, rowCount: json.rowCount, aiUsed: json.aiUsed });
    setMapping(json.mapping);
    if (json.sourceName) setSourceName(json.sourceName);
  };

  const prepare = async () => {
    if (!batchId) return;
    setError(null);
    setBusy("prepare");
    for (const o of unsavedOptions) {
      if (saveToLibrary[o.name]) await saveLibraryOptionAction({ name: o.name, values: o.newValues });
    }
    const res = await startProcessingAction(batchId, {
      setup,
      columnMapping: usesSheet ? mapping : null,
      sourceName: sourceName || null,
      saveProfile: saveProfile && sourceName && profileName ? { sourceName, profileName } : null,
    });
    setBusy(null);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    router.push(`/admin/products/bulk-add/${batchId}`);
  };

  const optionTargets = [...new Set([...setup.options.map((o) => o.name), ...library.map((l) => l.name)].filter(Boolean))];

  // --- Step 1 --------------------------------------------------------------
  if (step === 1) {
    const cards: { k: SourceKind; icon: React.ReactNode; title: string; body: string }[] = [
      { k: "PHOTOS", icon: <Camera className="h-6 w-6" />, title: "Upload Photos", body: "When you mainly have product photos." },
      { k: "SPREADSHEET", icon: <FileSpreadsheet className="h-6 w-6" />, title: "Upload Spreadsheet", body: "XLSX or CSV product data." },
      { k: "PHOTOS_SPREADSHEET", icon: <Images className="h-6 w-6" />, title: "Photos + Spreadsheet", body: "Large catalogs where data and images are separate." },
    ];
    return (
      <div className="space-y-6">
        <h2 className="text-lg font-medium">How are you adding products?</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {cards.map((c) => (
            <button
              key={c.k}
              type="button"
              onClick={() => {
                setKind(c.k);
                setStep(2);
              }}
              className="rounded-(--radius-card) border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-6 text-left transition hover:border-[var(--accent)]"
            >
              <div className="text-[var(--accent)]">{c.icon}</div>
              <div className="mt-3 text-base font-medium">{c.title}</div>
              <div className="mt-1 text-sm text-[var(--text-secondary)]">{c.body}</div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // --- Step 2: setup ----------------------------------------------------------
  if (step === 2) {
    return (
      <div className="space-y-6">
        {error && <Alert tone="danger">{error}</Alert>}

        <Card className="space-y-4 p-6">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm">
              Name this import
              <input className="lx-field mt-1 w-full" placeholder={defaultName(kind)} value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="block text-sm">
              Product Recipe
              <select className="lx-field mt-1 w-full" value={setup.recipeId ?? ""} onChange={(e) => applyRecipe(e.target.value)}>
                <option value="">No recipe — set up from scratch</option>
                {recipes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-[var(--text-secondary)]">A recipe fills in the answers below. You can still change anything.</span>
            </label>
          </div>

          {aiAvailable && (
            <div>
              <label className="block text-sm">
                Or just describe the batch
                <textarea
                  className="lx-field mt-1 w-full"
                  rows={3}
                  placeholder="These are new Superking bedsheets. Each photo is a different design. They are GHS 180 each. Stock is 4 each."
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </label>
              <Button type="button" variant="secondary" size="sm" className="mt-2" onClick={readNote} disabled={!note.trim() || busy === "note"}>
                {busy === "note" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Read my note
              </Button>
              {parsed && (
                <div className="mt-3 rounded-lg border border-[var(--accent)] p-4 text-sm">
                  <div className="font-medium">Check these before they are used:</div>
                  <ul className="mt-2 space-y-1 text-[var(--text-secondary)]">
                    {parsed.recipeName && <li>Recipe: <strong>{parsed.recipeName}</strong></li>}
                    {parsed.imageRole && <li>Each image: <strong>{IMAGE_ROLE_LABEL[parsed.imageRole]}</strong></li>}
                    {parsed.options.map((o) => (
                      <li key={o.name}>{o.name}: <strong>{o.values.join(", ")}</strong></li>
                    ))}
                    <li>Price: <strong>{parsed.price != null ? `GHS ${parsed.price}` : "not stated"}</strong></li>
                    <li>Stock: <strong>{parsed.stock ?? "not stated"}</strong></li>
                    {parsed.material && <li>Material: <strong>{parsed.material}</strong></li>}
                    {parsed.category && <li>Category: <strong>{parsed.category}</strong></li>}
                  </ul>
                  <div className="mt-3 flex gap-2">
                    <Button type="button" size="sm" onClick={applyParsed}>Apply these</Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setParsed(null)}>Discard</Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>

        <Card className="p-6" key={`sold-${resetKey}`}>
          <h3 className="mb-4 text-base font-medium">How is this product sold?</h3>
          <SoldAsPicker options={setup.options} onChange={(options) => patch({ options })} library={library} />
          <div className="mt-4">
            <CombinationToggles options={setup.options} disabled={setup.disabledCombinations} onChange={(disabledCombinations) => patch({ disabledCombinations })} />
          </div>
          {unsavedOptions.length > 0 && (
            <div className="mt-4 space-y-1 border-t border-[var(--border-subtle)] pt-3">
              {unsavedOptions.map((o) => (
                <label key={o.name} className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                  <input type="checkbox" checked={Boolean(saveToLibrary[o.name])} onChange={(e) => setSaveToLibrary((s) => ({ ...s, [o.name]: e.target.checked }))} />
                  {o.isNew ? `Save the ${o.name} option for future products` : `Save ${o.newValues.join(", ")} to ${o.name} for future products`}
                  <span>(otherwise only this import)</span>
                </label>
              ))}
            </div>
          )}
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="p-6" key={`price-${resetKey}-${setup.options.map((o) => o.name + o.values.length).join()}`}>
            <h3 className="mb-3 text-base font-medium">How does the price change?</h3>
            <PricingEditor options={setup.options} value={setup.pricing} onChange={(pricing) => patch({ pricing })} allowSource={usesSheet} />
          </Card>
          <Card className="p-6" key={`stock-${resetKey}-${setup.options.map((o) => o.name + o.values.length).join()}`}>
            <h3 className="mb-3 text-base font-medium">How is stock tracked?</h3>
            <StockEditor options={setup.options} value={setup.stock} onChange={(stock) => patch({ stock })} allowSource={usesSheet} />
          </Card>
        </div>

        {usesPhotos && (
          <Card className="p-6">
            <h3 className="mb-3 text-base font-medium">What does each photo represent?</h3>
            <div className="space-y-1.5">
              {(["SEPARATE_PRODUCTS", "SAME_PRODUCT", "OPTION"] as const).map((m) => (
                <label key={m} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    checked={setup.imageRole.mode === m}
                    onChange={() => patch({ imageRole: { mode: m, option: m === "OPTION" ? (setup.options[setup.options.length - 1]?.name ?? null) : null } })}
                  />
                  {IMAGE_ROLE_LABEL[m]}
                </label>
              ))}
            </div>
            {setup.imageRole.mode === "OPTION" && (
              <label className="mt-3 block text-sm">
                These photos represent:
                <select
                  className="lx-field ml-2 py-1 text-sm"
                  value={setup.imageRole.option ?? ""}
                  onChange={(e) => patch({ imageRole: { mode: "OPTION", option: e.target.value } })}
                >
                  {setup.options.map((o) => (
                    <option key={o.name} value={o.name}>
                      {o.name}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-xs text-[var(--text-secondary)]">
                  Photos are matched by file name first (e.g. blind-black.jpg); AI can suggest the rest, and you confirm.
                </span>
              </label>
            )}
            {setup.imageRole.mode === "SAME_PRODUCT" && (
              <p className="mt-2 text-xs text-[var(--text-secondary)]">Photos are grouped by file name (rug-01-a.jpg, rug-01-b.jpg → one product). You can merge or split during review.</p>
            )}
          </Card>
        )}

        <Card className="grid gap-4 p-6 md:grid-cols-3" key={`facts-${resetKey}`}>
          <h3 className="text-base font-medium md:col-span-3">Facts these products share</h3>
          <label className="block text-sm">
            Category
            <select
              className="lx-field mt-1 w-full"
              value={setup.defaults.categoryIds[0] ?? ""}
              onChange={(e) => patch({ defaults: { ...setup.defaults, categoryIds: e.target.value ? [e.target.value] : [] } })}
            >
              <option value="">—</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            Collection
            <select
              className="lx-field mt-1 w-full"
              value={setup.defaults.collectionIds[0] ?? ""}
              onChange={(e) => patch({ defaults: { ...setup.defaults, collectionIds: e.target.value ? [e.target.value] : [] } })}
            >
              <option value="">—</option>
              {collections.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
          <TextFact label="Material" value={setup.defaults.material} onChange={(material) => patch({ defaults: { ...setup.defaults, material } })} />
          <TextFact label="Care" value={setup.defaults.care} onChange={(care) => patch({ defaults: { ...setup.defaults, care } })} />
          <TextFact label="Tags (comma separated)" value={setup.defaults.tags.join(", ")} onChange={(t) => patch({ defaults: { ...setup.defaults, tags: (t ?? "").split(",").map((x) => x.trim()).filter(Boolean) } })} />
          <TextFact label="SKU prefix" value={setup.defaults.skuPrefix} onChange={(skuPrefix) => patch({ defaults: { ...setup.defaults, skuPrefix } })} />
          <p className="text-xs text-[var(--text-secondary)] md:col-span-3">
            Prices, stock, sizes, materials and other facts only ever come from you or your spreadsheet — AI never invents them.
          </p>
        </Card>

        <Card className="p-6">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={setup.aiEnabled} disabled={!aiAvailable} onChange={(e) => patch({ aiEnabled: e.target.checked })} />
            AI assistance {aiAvailable ? "" : "(switched off in settings)"}
          </label>
          {setup.aiEnabled && (
            <div className="mt-3 flex flex-wrap gap-4">
              <span className="text-xs text-[var(--text-secondary)]">AI should help with:</span>
              {(Object.keys(AI_LABELS) as (keyof AiFields)[]).map((k) => (
                <label key={k} className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" checked={setup.aiFields[k]} onChange={(e) => patch({ aiFields: { ...setup.aiFields, [k]: e.target.checked } })} />
                  {AI_LABELS[k]}
                </label>
              ))}
            </div>
          )}
        </Card>

        <div className="flex justify-between">
          <Button type="button" variant="ghost" onClick={() => setStep(1)}>Back</Button>
          <Button type="button" onClick={goToUpload} disabled={busy === "batch"}>
            {busy === "batch" && <Loader2 className="h-4 w-4 animate-spin" />} Continue to upload
          </Button>
        </div>
      </div>
    );
  }

  // --- Step 3: upload + mapping -----------------------------------------------
  const photosDone = !usesPhotos || (photoProgress && photoProgress.done === photoProgress.total && photoProgress.done > 0);
  const sheetDone = !usesSheet || Boolean(sheet);
  return (
    <div className="space-y-6">
      {error && <Alert tone="danger">{error}</Alert>}

      {usesSheet && (
        <Card className="space-y-4 p-6">
          <h3 className="text-base font-medium">Spreadsheet</h3>
          <div className="flex flex-wrap items-end gap-4">
            {profiles.length > 0 && (
              <label className="block text-sm">
                Saved import profile
                <select className="lx-field mt-1 w-64" value={profileId} onChange={(e) => setProfileId(e.target.value)}>
                  <option value="">None</option>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>{p.sourceName} — {p.name}</option>
                  ))}
                </select>
              </label>
            )}
            <FilePick accept=".xlsx,.csv,.tsv,.txt" label={sheet ? "Replace file" : "Choose .xlsx or .csv"} busy={busy === "sheet"} onPick={(f) => uploadSheet(f?.[0] ?? null)} />
          </div>

          {sheet && (
            <>
              <p className="text-sm text-[var(--text-secondary)]">
                {sheet.rowCount.toLocaleString()} rows found. Check how each column maps{sheet.aiUsed ? " (AI suggested some of these)" : ""}.
              </p>
              <div className="lx-table-scroll max-h-[28rem] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-[var(--surface-raised)]">
                    <tr className="text-left text-xs text-[var(--text-secondary)]">
                      <th className="py-2 pr-4 font-normal">Supplier column</th>
                      <th className="py-2 pr-4 font-normal">Example</th>
                      <th className="py-2 font-normal">Noble Enclave field</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sheet.headers.map((h) => (
                      <tr key={h} className="border-t border-[var(--border-subtle)]">
                        <td className="py-1.5 pr-4">{h}</td>
                        <td className="max-w-56 truncate py-1.5 pr-4 text-xs text-[var(--text-secondary)]">{sheet.sample.find((r) => r[h])?.[h] ?? ""}</td>
                        <td className="py-1.5">
                          <MappingSelect value={mapping[h] ?? "ignore"} optionNames={optionTargets} onChange={(v) => setMapping((m) => ({ ...m, [h]: v }))} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <label className="block text-sm">
                  Supplier / source name
                  <input className="lx-field mt-1 w-full" placeholder="e.g. Dubai Bedsheet Supplier" value={sourceName} onChange={(e) => setSourceName(e.target.value)} />
                  <span className="mt-1 block text-xs text-[var(--text-secondary)]">Naming the source lets the next file from them update products instead of duplicating them.</span>
                </label>
                <label className="flex items-center gap-2 self-center text-sm">
                  <input type="checkbox" checked={saveProfile} onChange={(e) => setSaveProfile(e.target.checked)} />
                  Save this mapping as an import profile
                </label>
                {saveProfile && (
                  <label className="block text-sm">
                    Profile name
                    <input className="lx-field mt-1 w-full" placeholder="Standard price list" value={profileName} onChange={(e) => setProfileName(e.target.value)} />
                  </label>
                )}
              </div>
            </>
          )}
        </Card>
      )}

      {usesPhotos && (
        <Card className="space-y-3 p-6">
          <h3 className="text-base font-medium">Photos</h3>
          <FilePick accept="image/*" multiple label="Choose photos" onPick={uploadPhotos} />
          {photoProgress && (
            <div className="text-sm">
              <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-sunken)]">
                <div className="h-full bg-[var(--accent)] transition-all" style={{ width: `${(photoProgress.done / Math.max(1, photoProgress.total)) * 100}%` }} />
              </div>
              <p className="mt-1 text-[var(--text-secondary)]">
                {photoProgress.done} of {photoProgress.total} uploaded
                {photoProgress.duplicates ? ` · ${photoProgress.duplicates} already in this import` : ""}
                {photoProgress.failed.length ? ` · ${photoProgress.failed.length} failed` : ""}
              </p>
              {photoProgress.failed.length > 0 && (
                <ul className="mt-1 max-h-24 overflow-y-auto text-xs text-danger">
                  {photoProgress.failed.slice(0, 50).map((f) => <li key={f}>{f}</li>)}
                </ul>
              )}
            </div>
          )}
        </Card>
      )}

      <div className="flex justify-between">
        <Button type="button" variant="ghost" onClick={() => setStep(2)}>Back to setup</Button>
        <Button type="button" onClick={prepare} disabled={!photosDone || !sheetDone || busy === "prepare"}>
          {busy === "prepare" && <Loader2 className="h-4 w-4 animate-spin" />} Prepare products
        </Button>
      </div>
    </div>
  );
}

const IMAGE_ROLE_LABEL = {
  SEPARATE_PRODUCTS: "Each photo is a separate product",
  SAME_PRODUCT: "Several photos belong to the same product",
  OPTION: "Photos represent an option such as Colour or Pattern",
} as const;

function defaultName(kind: SourceKind) {
  const d = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return `${kind === "PHOTOS" ? "Photo" : kind === "SPREADSHEET" ? "Spreadsheet" : "Catalog"} import ${d}`;
}

function TextFact({ label, value, onChange }: { label: string; value: string | null | undefined; onChange: (v: string | null) => void }) {
  return (
    <label className="block text-sm">
      {label}
      <input className="lx-field mt-1 w-full" defaultValue={value ?? ""} onBlur={(e) => onChange(e.target.value.trim() || null)} />
    </label>
  );
}

function MappingSelect({ value, optionNames, onChange }: { value: string; optionNames: string[]; onChange: (v: string) => void }) {
  const [custom, setCustom] = useState(false);
  if (custom) {
    return (
      <input
        autoFocus
        className="lx-field w-56 py-1 text-sm"
        placeholder="Option name, e.g. Finish"
        onBlur={(e) => {
          if (e.target.value.trim()) onChange(`option:${e.target.value.trim()}`);
          setCustom(false);
        }}
      />
    );
  }
  const optionValue = value.startsWith("option:") ? value : null;
  return (
    <select
      className="lx-field w-56 py-1 text-sm"
      value={value}
      onChange={(e) => (e.target.value === "__custom" ? setCustom(true) : onChange(e.target.value))}
    >
      <option value="ignore">Don&apos;t import</option>
      <optgroup label="Product fields">
        {TARGET_FIELDS.map((f) => (
          <option key={f} value={f}>{FIELD_LABELS[f] ?? f}</option>
        ))}
      </optgroup>
      <optgroup label="Customer choice (option)">
        {[...new Set([...optionNames, ...(optionValue ? [optionValue.slice(7)] : [])])].map((n) => (
          <option key={n} value={`option:${n}`}>{n}</option>
        ))}
        <option value="__custom">+ Create custom option</option>
      </optgroup>
    </select>
  );
}

function FilePick({
  accept,
  multiple,
  label,
  busy,
  onPick,
}: {
  accept: string;
  multiple?: boolean;
  label: string;
  busy?: boolean;
  onPick: (files: FileList | null) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          onPick(e.target.files);
          e.target.value = "";
        }}
      />
      <Button type="button" variant="secondary" onClick={() => ref.current?.click()} disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} {label}
      </Button>
    </>
  );
}
