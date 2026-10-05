"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { Alert, Badge, Button, Card } from "@/components/ui";
import {
  bulkFixAction,
  cancelBatchAction,
  importBatchAction,
  publishBatchAction,
  resolveDuplicateAction,
  retryFailedAction,
  setMediaOptionAction,
  simulateAction,
  suggestAliasesAction,
  updateItemAction,
  type BulkOp,
} from "@/app/actions/admin/bulk-import";
import type { Simulation } from "@/lib/bulk-import/import-simulation";
import type { Issue, OptionSpec } from "@/lib/bulk-import/schema";

const PROCESSING = new Set(["UPLOADING", "PARSING", "NORMALIZING", "MATCHING", "ENRICHING", "VALIDATING", "IMPORTING"]);

/** Polls the status route (which also advances the queue) and refreshes the page as work lands. */
export function BatchProgress({ batchId, status: initial, total }: { batchId: string; status: string; total: number }) {
  const router = useRouter();
  const [state, setState] = useState<{ status: string; pending: number; failedJob?: { type: string; error: string | null } | null }>({
    status: initial,
    pending: PROCESSING.has(initial) ? 1 : 0,
  });
  const last = useRef<string>("");

  useEffect(() => {
    if (!PROCESSING.has(state.status) && state.pending === 0) return;
    let stop = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/admin/bulk-import/${batchId}/status`, { cache: "no-store" });
        const json = await res.json();
        if (stop || !json.ok) return;
        setState({ status: json.status, pending: json.pending, failedJob: json.failedJob });
        const sig = `${json.status}|${json.summary?.updatedAt ?? ""}`;
        if (sig !== last.current) {
          last.current = sig;
          router.refresh();
        }
      } catch {
        /* next tick */
      }
      if (!stop) setTimeout(tick, 2500);
    };
    const t = setTimeout(tick, 500);
    return () => {
      stop = true;
      clearTimeout(t);
    };
  }, [batchId, state.status, state.pending, router]);

  if (!PROCESSING.has(state.status) && state.pending === 0) {
    return state.failedJob ? <Alert tone="warning">A {state.failedJob.type.toLowerCase().replace(/_/g, " ")} step failed: {state.failedJob.error}</Alert> : null;
  }
  return (
    <Card className="flex items-center gap-3 p-4 text-sm">
      <Loader2 className="h-4 w-4 animate-spin text-[var(--accent)]" />
      <span>
        {STATUS_TEXT[state.status] ?? "Working"}… {total ? `${total.toLocaleString()} items so far.` : ""} {state.pending ? `${state.pending} step(s) queued.` : ""}
      </span>
      <span className="ml-auto text-xs text-[var(--text-secondary)]">You can leave this page — work continues and resumes where it stopped.</span>
    </Card>
  );
}

const STATUS_TEXT: Record<string, string> = {
  UPLOADING: "Waiting for uploads",
  PARSING: "Reading the spreadsheet",
  NORMALIZING: "Normalising values",
  MATCHING: "Matching existing products",
  ENRICHING: "AI is writing listings",
  VALIDATING: "Checking items",
  IMPORTING: "Creating products",
};

// --- Review grid ----------------------------------------------------------------

export type ReviewRow = {
  id: string;
  status: string;
  rowNumber: number | null;
  title: string | null;
  titleSource: string | null;
  priceLabel: string;
  stockLabel: string;
  versions: number;
  enabledVersions: number;
  issues: Issue[];
  action: string;
  matchMethod: string | null;
  productId: string | null;
  aiStatus: string | null;
  error: string | null;
  options: OptionSpec[];
  variants: { key: string; enabled: boolean; price: number | null; stock: number | null; sku: string | null }[];
  media: { id: string; url: string; filename: string; optionName: string | null; optionValue: string | null; optionSource: string | null; duplicateKind: string | null }[];
  imageOption: string | null;
  description: string | null;
  material: string | null;
};

type Named = { id: string; name: string };

export function ReviewGrid({
  batchId,
  rows,
  filter,
  filteredCount,
  categories,
  collections,
  recipes,
  editable,
}: {
  batchId: string;
  rows: ReviewRow[];
  filter: { status?: string; issue?: string; q?: string };
  filteredCount: number;
  categories: Named[];
  collections: Named[];
  recipes: Named[];
  editable: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [allInFilter, setAllInFilter] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [pending, start] = useTransition();

  const toggle = (id: string) => {
    setAllInFilter(false);
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };
  const count = allInFilter ? filteredCount : selected.size;

  const run = (op: BulkOp) =>
    start(async () => {
      const res = await bulkFixAction(batchId, allInFilter ? { filter } : { itemIds: [...selected] }, op);
      setMessage(res.ok ? { tone: "success", text: `Applied to ${res.data?.count ?? 0} item(s). Re-checking…` } : { tone: "danger", text: res.message });
      if (res.ok) {
        setSelected(new Set());
        setAllInFilter(false);
        router.refresh();
      }
    });

  return (
    <div className="space-y-3">
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      {editable && count > 0 && <BulkBar count={count} pending={pending} run={run} categories={categories} collections={collections} recipes={recipes} />}

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[var(--surface-sunken)] text-left text-xs text-[var(--text-secondary)]">
            <tr>
              <th className="w-8 p-2">
                {editable && (
                  <input
                    type="checkbox"
                    checked={rows.length > 0 && rows.every((r) => selected.has(r.id))}
                    onChange={(e) => {
                      setAllInFilter(false);
                      setSelected(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set());
                    }}
                  />
                )}
              </th>
              <th className="w-6" />
              <th className="p-2 font-normal">Product</th>
              <th className="p-2 font-normal">Versions</th>
              <th className="p-2 font-normal">Price</th>
              <th className="p-2 font-normal">Stock</th>
              <th className="p-2 font-normal">Status</th>
            </tr>
          </thead>
          <tbody>
            {editable && rows.length > 0 && rows.every((r) => selected.has(r.id)) && filteredCount > rows.length && (
              <tr>
                <td colSpan={7} className="bg-[var(--surface-sunken)] p-2 text-center text-xs">
                  {allInFilter ? (
                    <>All {filteredCount.toLocaleString()} items in this view are selected.</>
                  ) : (
                    <button type="button" className="text-[var(--accent)] underline" onClick={() => setAllInFilter(true)}>
                      Select all {filteredCount.toLocaleString()} items in this view
                    </button>
                  )}
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <ItemRow
                key={r.id}
                row={r}
                open={open === r.id}
                onOpen={() => setOpen(open === r.id ? null : r.id)}
                checked={selected.has(r.id) || allInFilter}
                onCheck={() => toggle(r.id)}
                editable={editable}
              />
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-[var(--text-secondary)]">Nothing here.</td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function BulkBar({
  count,
  pending,
  run,
  categories,
  collections,
  recipes,
}: {
  count: number;
  pending: boolean;
  run: (op: BulkOp) => void;
  categories: Named[];
  collections: Named[];
  recipes: Named[];
}) {
  const [op, setOp] = useState("SET_PRICE");
  const [value, setValue] = useState("");
  const [value2, setValue2] = useState("");
  const [value3, setValue3] = useState("");
  const [saveRule, setSaveRule] = useState(false);

  const submit = () => {
    switch (op) {
      case "SET_PRICE":
        return run({ op, price: Math.round(Number(value) * 100) });
      case "SET_STOCK":
        return run({ op, stock: Math.max(0, parseInt(value, 10) || 0) });
      case "SET_CATEGORY":
        return run({ op, categoryIds: value ? [value] : [] });
      case "SET_COLLECTION":
        return run({ op, collectionIds: value ? [value] : [] });
      case "SET_MATERIAL":
        return run({ op, material: value });
      case "ADD_TAG":
        return run({ op, tags: value.split(",").map((t) => t.trim()).filter(Boolean) });
      case "APPLY_RECIPE":
        return run({ op, recipeId: value });
      case "REPLACE_OPTION_VALUE":
        return run({ op, option: value, from: value2, to: value3, saveRule });
      default:
        return run({ op } as BulkOp);
    }
  };

  const needsValue = ["SET_PRICE", "SET_STOCK", "SET_CATEGORY", "SET_COLLECTION", "SET_MATERIAL", "ADD_TAG", "APPLY_RECIPE", "REPLACE_OPTION_VALUE"].includes(op);
  return (
    <Card className="sticky top-2 z-10 flex flex-wrap items-center gap-2 p-3 text-sm shadow-sm">
      <strong>{count.toLocaleString()} selected</strong>
      <select className="lx-field py-1 text-sm" value={op} onChange={(e) => { setOp(e.target.value); setValue(""); }}>
        <option value="SET_PRICE">Set price</option>
        <option value="SET_STOCK">Set stock</option>
        <option value="SET_CATEGORY">Set category</option>
        <option value="SET_COLLECTION">Set collection</option>
        <option value="SET_MATERIAL">Set material</option>
        <option value="ADD_TAG">Add tag</option>
        <option value="APPLY_RECIPE">Apply Recipe</option>
        <option value="REPLACE_OPTION_VALUE">Set option value</option>
        <option value="RERUN_AI">Re-run AI</option>
        <option value="MARK_REVIEWED">Mark as reviewed</option>
        <option value="FORCE_CREATE">Create as new (not an update)</option>
        <option value="MERGE">Merge into one product</option>
        <option value="SKIP">Skip selected</option>
        <option value="UNSKIP">Un-skip</option>
      </select>
      {(op === "SET_PRICE" || op === "SET_STOCK" || op === "SET_MATERIAL" || op === "ADD_TAG") && (
        <input className="lx-field w-40 py-1 text-sm" placeholder={op === "SET_PRICE" ? "GHS" : op === "ADD_TAG" ? "tag, tag" : ""} value={value} onChange={(e) => setValue(e.target.value)} />
      )}
      {(op === "SET_CATEGORY" || op === "SET_COLLECTION" || op === "APPLY_RECIPE") && (
        <select className="lx-field py-1 text-sm" value={value} onChange={(e) => setValue(e.target.value)}>
          <option value="">Choose…</option>
          {(op === "SET_CATEGORY" ? categories : op === "SET_COLLECTION" ? collections : recipes).map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      )}
      {op === "REPLACE_OPTION_VALUE" && (
        <>
          <input className="lx-field w-28 py-1 text-sm" placeholder="Option" value={value} onChange={(e) => setValue(e.target.value)} />
          <input className="lx-field w-28 py-1 text-sm" placeholder="From" value={value2} onChange={(e) => setValue2(e.target.value)} />
          <input className="lx-field w-28 py-1 text-sm" placeholder="To" value={value3} onChange={(e) => setValue3(e.target.value)} />
          <label className="flex items-center gap-1 text-xs">
            <input type="checkbox" checked={saveRule} onChange={(e) => setSaveRule(e.target.checked)} /> Save as catalog rule
          </label>
        </>
      )}
      <Button type="button" size="sm" onClick={submit} disabled={pending || (needsValue && !value)}>
        {pending && <Loader2 className="h-4 w-4 animate-spin" />} Apply
      </Button>
    </Card>
  );
}

const STATUS_TONE: Record<string, "neutral" | "success" | "warning" | "danger" | "info" | "accent"> = {
  READY: "success",
  NEEDS_REVIEW: "warning",
  BLOCKED: "danger",
  FAILED: "danger",
  IMPORTED: "info",
  UPDATED: "info",
  SKIPPED: "neutral",
  PROCESSING: "accent",
  PENDING: "neutral",
  IMPORTING: "accent",
};

function ItemRow({
  row,
  open,
  onOpen,
  checked,
  onCheck,
  editable,
}: {
  row: ReviewRow;
  open: boolean;
  onOpen: () => void;
  checked: boolean;
  onCheck: () => void;
  editable: boolean;
}) {
  const problems = row.issues.filter((i) => i.severity !== "INFO");
  return (
    <>
      <tr className="border-t border-[var(--border-subtle)] align-top">
        <td className="p-2">{editable && <input type="checkbox" checked={checked} onChange={onCheck} />}</td>
        <td className="p-2">
          <button type="button" onClick={onOpen} aria-label="Details" className="text-[var(--text-secondary)]">
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        </td>
        <td className="p-2">
          <div className="flex items-start gap-3">
            {row.media[0] && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={row.media[0].url} alt="" className="h-12 w-12 rounded object-cover" loading="lazy" />
            )}
            <div>
              <div className="font-medium">
                {row.title ?? <span className="text-[var(--text-secondary)]">Untitled</span>}
                {row.titleSource === "AI" && <span className="ml-2 text-[10px] text-[var(--accent)]">AI</span>}
              </div>
              <div className="text-xs text-[var(--text-secondary)]">
                {row.rowNumber ? `Row ${row.rowNumber} · ` : ""}
                {row.media.length ? `${row.media.length} photo(s) · ` : ""}
                {row.action === "UPDATE" ? `Updates existing (${row.matchMethod?.toLowerCase().replace("_", " ")})` : "New product"}
              </div>
              {problems.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {problems.map((i, n) => (
                    <Badge key={n} tone={i.severity === "BLOCK" ? "danger" : "warning"}>{i.message}</Badge>
                  ))}
                </div>
              )}
              {row.error && <div className="mt-1 text-xs text-danger">{row.error}</div>}
            </div>
          </div>
        </td>
        <td className="p-2">{row.enabledVersions}{row.enabledVersions !== row.versions ? ` of ${row.versions}` : ""}</td>
        <td className="p-2">{row.priceLabel}</td>
        <td className="p-2">{row.stockLabel}</td>
        <td className="p-2">
          <Badge tone={STATUS_TONE[row.status] ?? "neutral"}>{row.status.replace(/_/g, " ").toLowerCase()}</Badge>
          {row.aiStatus === "PENDING" && <div className="mt-1 text-[10px] text-[var(--text-secondary)]">AI queued</div>}
          {row.productId && (
            <a href={`/admin/products/${row.productId}`} className="mt-1 block text-xs text-[var(--accent)] underline">Open product</a>
          )}
        </td>
      </tr>
      {open && (
        <tr className="bg-[var(--surface-sunken)]">
          <td colSpan={7} className="p-4">
            <ItemDetail row={row} editable={editable} />
          </td>
        </tr>
      )}
    </>
  );
}

function ItemDetail({ row, editable }: { row: ReviewRow; editable: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState(row.title ?? "");
  const [description, setDescription] = useState(row.description ?? "");
  const [material, setMaterial] = useState(row.material ?? "");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  const [disabled, setDisabled] = useState<string[]>(row.variants.filter((v) => !v.enabled).map((v) => v.key));
  const imageOption = row.options.find((o) => o.name === row.imageOption) ?? null;

  const save = () =>
    start(async () => {
      setError(null);
      const res = await updateItemAction(row.id, {
        title: title.trim(),
        description: description.trim(),
        material: material.trim(),
        ...(price.trim() ? { price: Math.round(Number(price) * 100) } : {}),
        ...(stock.trim() ? { stock: Math.max(0, parseInt(stock, 10) || 0) } : {}),
        disabledCombinations: disabled,
      });
      if (!res.ok) setError(res.message);
      else router.refresh();
    });

  const act = (fn: () => Promise<{ ok: boolean; message?: string }>) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) setError(res.message ?? "That did not work.");
      else router.refresh();
    });

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-3">
        {error && <Alert tone="danger">{error}</Alert>}
        <label className="block text-xs text-[var(--text-secondary)]">
          Title
          <input className="lx-field mt-1 w-full text-sm" value={title} disabled={!editable} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="block text-xs text-[var(--text-secondary)]">
          Description
          <textarea className="lx-field mt-1 w-full text-sm" rows={4} value={description} disabled={!editable} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <div className="grid grid-cols-3 gap-3">
          <label className="block text-xs text-[var(--text-secondary)]">
            Material
            <input className="lx-field mt-1 w-full text-sm" value={material} disabled={!editable} onChange={(e) => setMaterial(e.target.value)} />
          </label>
          <label className="block text-xs text-[var(--text-secondary)]">
            Price for all (GHS)
            <input className="lx-field mt-1 w-full text-sm" value={price} placeholder="keep" disabled={!editable} onChange={(e) => setPrice(e.target.value)} />
          </label>
          <label className="block text-xs text-[var(--text-secondary)]">
            Stock for all
            <input className="lx-field mt-1 w-full text-sm" value={stock} placeholder="keep" disabled={!editable} onChange={(e) => setStock(e.target.value)} />
          </label>
        </div>
        {row.variants.length > 1 && (
          <div>
            <div className="text-xs text-[var(--text-secondary)]">Versions (untick what you don&apos;t sell)</div>
            <div className="mt-1 grid max-h-56 grid-cols-2 gap-1 overflow-y-auto">
              {row.variants.map((v) => (
                <label key={v.key} className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    disabled={!editable}
                    checked={!disabled.includes(v.key)}
                    onChange={() => setDisabled((d) => (d.includes(v.key) ? d.filter((x) => x !== v.key) : [...d, v.key]))}
                  />
                  {v.key} · {v.price != null ? `GH₵${(v.price / 100).toFixed(2)}` : "no price"} · {v.stock ?? "–"}
                </label>
              ))}
            </div>
          </div>
        )}
        {editable && (
          <Button type="button" size="sm" onClick={save} disabled={pending}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />} Save item
          </Button>
        )}
        <ul className="space-y-0.5 text-xs text-[var(--text-secondary)]">
          {row.issues.filter((i) => i.severity === "INFO").map((i, n) => <li key={n}>• {i.message}</li>)}
        </ul>
      </div>

      <div className="space-y-2">
        <div className="text-xs text-[var(--text-secondary)]">Photos</div>
        <div className="grid grid-cols-3 gap-3">
          {row.media.map((m) => (
            <div key={m.id} className="space-y-1 text-xs">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={m.url} alt={m.filename} className="aspect-square w-full rounded object-cover" loading="lazy" />
              <div className="truncate text-[var(--text-secondary)]">{m.filename}</div>
              {imageOption && editable && (
                <select
                  className="lx-field w-full py-1 text-xs"
                  value={m.optionValue ?? ""}
                  onChange={(e) => act(() => setMediaOptionAction(m.id, e.target.value ? imageOption.name : null, e.target.value || null))}
                >
                  <option value="">{imageOption.name}: not set</option>
                  {imageOption.values.map((v) => (
                    <option key={v} value={v}>{imageOption.name}: {v}{m.optionValue === v && m.optionSource === "AI" ? " (AI)" : ""}</option>
                  ))}
                </select>
              )}
              {(m.duplicateKind === "SIMILAR" || m.duplicateKind === "EXISTING_PRODUCT") && editable && (
                <div className="space-y-1 rounded border border-warning/40 p-1.5">
                  <div className="text-warning">{m.duplicateKind === "EXISTING_PRODUCT" ? "Already on a live product" : "Looks like another photo"}</div>
                  <div className="flex gap-2">
                    <button type="button" className="underline" onClick={() => act(() => resolveDuplicateAction(m.id, "REMOVE"))}>Remove</button>
                    <button type="button" className="underline" onClick={() => act(() => resolveDuplicateAction(m.id, "KEEP"))}>Keep both</button>
                    {m.duplicateKind === "SIMILAR" && (
                      <button type="button" className="underline" onClick={() => act(() => resolveDuplicateAction(m.id, "GROUP"))}>Group as gallery</button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// --- Import panel ------------------------------------------------------------------

export function ImportPanel({
  batchId,
  status,
  ready,
  imported,
  failed,
  canImport,
}: {
  batchId: string;
  status: string;
  ready: number;
  imported: number;
  failed: number;
  canImport: boolean;
}) {
  const router = useRouter();
  const [sim, setSim] = useState<Simulation | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "danger" | "info"; text: string } | null>(null);
  const [aliases, setAliases] = useState<{ field: string; from: string; to: string }[] | null>(null);
  const [pending, start] = useTransition();
  const busy = PROCESSING.has(status);

  const call = <T,>(fn: () => Promise<{ ok: boolean; message?: string; data?: T }>, after?: (d: T | undefined) => void) =>
    start(async () => {
      setMessage(null);
      const res = await fn();
      if (!res.ok) setMessage({ tone: "danger", text: res.message ?? "That did not work." });
      else {
        after?.(res.data);
        router.refresh();
      }
    });

  return (
    <Card className="space-y-4 p-5">
      <h3 className="text-base font-medium">Import</h3>
      {message && <Alert tone={message.tone}>{message.text}</Alert>}

      {sim ? (
        <div className="text-sm">
          <div className="font-medium">If you continue:</div>
          <ul className="mt-2 space-y-0.5">
            <li>{sim.newProducts.toLocaleString()} new products (as drafts)</li>
            <li>{sim.updatedProducts.toLocaleString()} existing products updated</li>
            <li>{sim.stockChanges.toLocaleString()} stock changes</li>
            <li>{sim.priceChanges.toLocaleString()} price changes</li>
            <li>{sim.newImages.toLocaleString()} new images</li>
            <li className="text-warning">{sim.possibleDuplicates.toLocaleString()} possible duplicates (not imported until reviewed)</li>
            <li className="text-danger">{(sim.blocked + sim.needsReview).toLocaleString()} items held back</li>
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={pending || !canImport}
              onClick={() => call(() => importBatchAction(batchId, { publish: false }), () => { setSim(null); setMessage({ tone: "info", text: "Import started." }); })}
            >
              Confirm — create drafts
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={pending || !canImport}
              onClick={() => call(() => importBatchAction(batchId, { publish: true }), () => { setSim(null); setMessage({ tone: "info", text: "Import and publish started." }); })}
            >
              Create and publish
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setSim(null)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <Button type="button" disabled={pending || busy || ready === 0 || !canImport} onClick={() => call(() => simulateAction(batchId), (d) => setSim(d ?? null))}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />} Preview import of {ready.toLocaleString()} ready item(s)
        </Button>
      )}

      {imported > 0 && (
        <Button type="button" variant="secondary" disabled={pending || !canImport} onClick={() => call(() => publishBatchAction(batchId), () => setMessage({ tone: "info", text: "Publishing valid drafts…" }))}>
          Publish all valid drafts ({imported.toLocaleString()})
        </Button>
      )}

      <div className="flex flex-wrap gap-2 border-t border-[var(--border-subtle)] pt-3">
        {failed > 0 && (
          <Button type="button" size="sm" variant="ghost" disabled={pending || !canImport} onClick={() => call(() => retryFailedAction(batchId))}>
            Retry failed ({failed})
          </Button>
        )}
        {canImport && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => call(() => suggestAliasesAction(batchId), (d) => setAliases(d ?? []))}
          >
            Suggest catalog rules
          </Button>
        )}
        {canImport && !["COMPLETED", "CANCELLED"].includes(status) && (
          <Button
            type="button"
            size="sm"
            variant="danger"
            disabled={pending}
            onClick={() => {
              if (confirm("Cancel this import? Products already created stay in the catalog.")) call(() => cancelBatchAction(batchId));
            }}
          >
            Cancel import
          </Button>
        )}
      </div>

      {aliases && (
        <div className="text-xs">
          {aliases.length === 0 ? (
            <p className="text-[var(--text-secondary)]">No new spellings to suggest.</p>
          ) : (
            <ul className="space-y-1">
              {aliases.map((a) => (
                <li key={`${a.field}|${a.from}`} className="flex items-center gap-2">
                  {a.field}: “{a.from}” → “{a.to}”
                  <button
                    type="button"
                    className="text-[var(--accent)] underline"
                    onClick={() =>
                      call(() => bulkFixAction(batchId, { filter: {} }, { op: "REPLACE_OPTION_VALUE", option: a.field, from: a.from, to: a.to, saveRule: true }), () =>
                        setAliases((list) => list?.filter((x) => x !== a) ?? null),
                      )
                    }
                  >
                    Save rule
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}
