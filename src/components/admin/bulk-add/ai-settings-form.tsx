"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Alert, Button, Card } from "@/components/ui";
import { listBulkAiModelsAction, resetBulkAiSettingsAction, saveBulkAiSettingsAction, testBulkAiAction } from "@/app/actions/admin/catalog-library";
import type { BulkAiConfig } from "@/lib/bulk-ai/model-registry";
import type { CatalogModel } from "@/lib/bulk-ai/model-catalog";

const PROFILES = {
  OPENROUTER: [
    { key: "bulkAiFastModels", label: "Fast tasks" },
    { key: "bulkAiComplexModels", label: "Complex tasks" },
    { key: "bulkAiVisionModels", label: "Vision" },
  ],
  NVIDIA: [
    { key: "bulkAiNvidiaFastModels", label: "Fast tasks" },
    { key: "bulkAiNvidiaComplexModels", label: "Complex tasks" },
    { key: "bulkAiNvidiaVisionModels", label: "Vision" },
  ],
} as const;

const VENDORS = [
  { value: "OPENROUTER", label: "OpenRouter", hint: "Free “:free” models from many labs." },
  { value: "NVIDIA", label: "NVIDIA", hint: "Hosted NIM models on build.nvidia.com, free with a developer key." },
] as const;

export function AiSettingsForm({
  config,
  labels,
  hasKey,
  initialCatalog,
}: {
  config: BulkAiConfig;
  /** The current vendor's live model list, loaded on the server; null if it could not be read. */
  initialCatalog?: CatalogModel[] | null;
  labels: Record<string, string>;
  hasKey: Record<BulkAiConfig["bulkAiVendor"], boolean>;
}) {
  const router = useRouter();
  const [c, setC] = useState<BulkAiConfig>(config);
  const [advanced, setAdvanced] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [catalog, setCatalog] = useState<Record<string, CatalogModel[] | undefined>>(initialCatalog ? { [config.bulkAiVendor]: initialCatalog } : {});
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [loadingModels, setLoadingModels] = useState(false);
  const [freeOnly, setFreeOnly] = useState(true);
  const vendor = c.bulkAiVendor;
  const models = catalog[vendor];

  const loadModels = async (forVendor: BulkAiConfig["bulkAiVendor"], force = false) => {
    if (!force && catalog[forVendor]) return;
    setLoadingModels(true);
    setCatalogError(null);
    const res = await listBulkAiModelsAction(forVendor);
    setLoadingModels(false);
    if (res.ok) setCatalog((prev) => ({ ...prev, [forVendor]: res.data ?? [] }));
    else setCatalogError(res.message);
  };


  const choices = (vision: boolean) =>
    (models ?? []).filter((m) => (!freeOnly || m.free) && (!vision || m.vision));
  const known = new Map((models ?? []).map((m) => [m.id, m]));

  const run = (fn: () => Promise<{ ok: boolean; message?: string; data?: { model: string; ms: number } }>, ok: string) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) setMessage({ tone: "danger", text: res.message ?? "That did not work." });
      else {
        setMessage({ tone: "success", text: res.data ? `${ok} — ${labels[res.data.model] ?? res.data.model} answered in ${res.data.ms} ms.` : ok });
        router.refresh();
      }
    });

  return (
    <div className="max-w-3xl space-y-6">
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      {!hasKey[c.bulkAiVendor] && (
        <Alert tone="warning">
          {c.bulkAiVendor === "NVIDIA"
            ? "No NVIDIA API key is set. Add one under Settings → Integrations (or BULK_AI_NVIDIA_API_KEY)."
            : "No OpenRouter API key is set. Add one under Settings → Integrations (or BULK_AI_OPENROUTER_API_KEY)."}
        </Alert>
      )}

      <Card className="flex items-center justify-between p-6">
        <div>
          <div className="font-medium">AI Assistance: {c.bulkAiEnabled ? "On" : "Off"}</div>
          <div className="text-sm text-[var(--text-secondary)]">Imports work fully without AI; it only speeds up titles, copy and photo descriptions.</div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={c.bulkAiEnabled} onChange={(e) => setC({ ...c, bulkAiEnabled: e.target.checked })} /> Enabled
        </label>
      </Card>

      <Card className="space-y-3 p-6">
        <div className="font-medium">AI provider</div>
        <div className="grid gap-2 sm:grid-cols-2">
          {VENDORS.map((v) => (
            <label
              key={v.value}
              className={`flex cursor-pointer gap-3 rounded-lg border p-3 text-sm ${c.bulkAiVendor === v.value ? "border-[var(--accent)]" : "border-[var(--border)]"}`}
            >
              <input type="radio" name="vendor" checked={c.bulkAiVendor === v.value} onChange={() => {
                  setC({ ...c, bulkAiVendor: v.value });
                  if (hasKey[v.value] || v.value === "OPENROUTER") void loadModels(v.value);
                }} />
              <span>
                <span className="block font-medium">
                  {v.label} {!hasKey[v.value] && <span className="text-xs text-[var(--text-secondary)]">(no key)</span>}
                </span>
                <span className="block text-xs text-[var(--text-secondary)]">{v.hint}</span>
              </span>
            </label>
          ))}
        </div>
        <div className="text-xs text-[var(--text-secondary)]">Three best models per task, {c.bulkAiAttemptsPerModel} tries each before the next. Rate-limited items wait and retry on their own.</div>
      </Card>

      <Card className="space-y-5 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-medium">Models</div>
            <div className="text-xs text-[var(--text-secondary)]">
              Pick up to three per task from {vendor === "NVIDIA" ? "NVIDIA" : "OpenRouter"}&apos;s live list. The first is tried first; you can also type any model ID.
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={freeOnly} onChange={(e) => setFreeOnly(e.target.checked)} /> Free only
            </label>
            <Button type="button" variant="secondary" disabled={loadingModels} onClick={() => loadModels(vendor, true)}>
              {loadingModels && <Loader2 className="h-4 w-4 animate-spin" />} Refresh list
            </Button>
          </div>
        </div>
        {catalogError && <Alert tone="danger">{catalogError}</Alert>}
        {models && (
          <div className="text-xs text-[var(--text-secondary)]">
            {choices(false).length} text models · {choices(true).length} vision models available{freeOnly ? " (free)" : ""}.
          </div>
        )}
        {PROFILES[vendor].map((p) => {
          const vision = p.key.toLowerCase().includes("vision");
          const options = choices(vision);
          return (
            <div key={p.key}>
              <div className="text-sm font-medium">
                {p.label} {vision && <span className="text-xs font-normal text-[var(--text-secondary)]">— must accept images</span>}
              </div>
              <div className="mt-1 space-y-1">
                {[0, 1, 2].map((i) => {
                  const value = c[p.key][i] ?? "";
                  const info = known.get(value);
                  const missing = Boolean(value && models && !info);
                  const set = (v: string) => {
                    const list = [...c[p.key]];
                    list[i] = v;
                    setC({ ...c, [p.key]: list });
                  };
                  return (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <span className="w-4 text-[var(--text-secondary)]">{i + 1}.</span>
                      {models ? (
                        <select className="lx-field w-full py-1 text-xs" value={info ? value : ""} onChange={(e) => set(e.target.value)}>
                          <option value="">{value && !info ? `${value} (not in list)` : "— none —"}</option>
                          {options.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name}
                              {m.name !== m.id ? ` — ${m.id}` : ""}
                              {m.free && vendor === "OPENROUTER" ? " · free" : ""}
                            </option>
                          ))}
                          {info && !options.includes(info) && <option value={value}>{info.name}</option>}
                        </select>
                      ) : (
                        <input className="lx-field w-full py-1 font-mono text-xs" value={value} onChange={(e) => set(e.target.value)} />
                      )}
                      <span className={`w-44 truncate text-xs ${missing ? "text-[var(--danger,#b42318)]" : "text-[var(--text-secondary)]"}`}>
                        {missing ? "Not offered any more" : (labels[value] ?? "")}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </Card>

      <button type="button" className="text-sm text-[var(--accent)] underline" onClick={() => setAdvanced((a) => !a)}>
        {advanced ? "Hide" : "Show"} advanced settings
      </button>

      {advanced && (
        <Card className="space-y-5 p-6">
          {vendor === "OPENROUTER" && (
          <label className="block text-sm">
            Policy
            <select className="lx-field mt-1 w-64" value={c.bulkAiPolicy} onChange={(e) => setC({ ...c, bulkAiPolicy: e.target.value as BulkAiConfig["bulkAiPolicy"] })}>
              <option value="FREE_ONLY">Free models only</option>
              <option value="FREE_THEN_PAID">Free first, then paid</option>
              <option value="PAID_ONLY">Paid models only</option>
            </select>
            {c.bulkAiPolicy === "FREE_ONLY" && <span className="mt-1 block text-xs text-[var(--text-secondary)]">Model IDs that do not end in “:free” are never called.</span>}
          </label>
          )}
          <div className="grid grid-cols-4 gap-3">
            <NumberField label="Retries per model" value={c.bulkAiAttemptsPerModel} min={1} max={5} onChange={(n) => setC({ ...c, bulkAiAttemptsPerModel: n })} />
            <NumberField label="Fast concurrency" value={c.bulkAiFastConcurrency} min={1} max={20} onChange={(n) => setC({ ...c, bulkAiFastConcurrency: n })} />
            <NumberField label="Complex concurrency" value={c.bulkAiComplexConcurrency} min={1} max={20} onChange={(n) => setC({ ...c, bulkAiComplexConcurrency: n })} />
            <NumberField label="Vision concurrency" value={c.bulkAiVisionConcurrency} min={1} max={20} onChange={(n) => setC({ ...c, bulkAiVisionConcurrency: n })} />
          </div>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={pending} onClick={() => run(() => saveBulkAiSettingsAction(c), "Saved")}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />} Save
        </Button>
        <Button type="button" variant="secondary" disabled={pending} onClick={() => run(testBulkAiAction, "AI works")}>Test AI</Button>
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={() => confirm("Reset to the recommended free models?") && run(resetBulkAiSettingsAction, "Recommended defaults restored")}
        >
          Reset recommended defaults
        </Button>
      </div>
    </div>
  );
}

function NumberField({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
  return (
    <label className="block text-xs text-[var(--text-secondary)]">
      {label}
      <input
        type="number"
        min={min}
        max={max}
        className="lx-field mt-1 w-full py-1 text-sm"
        value={value}
        onChange={(e) => onChange(Math.min(max, Math.max(min, parseInt(e.target.value, 10) || min)))}
      />
    </label>
  );
}
