"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Alert, Button, Card } from "@/components/ui";
import { resetBulkAiSettingsAction, saveBulkAiSettingsAction, testBulkAiAction } from "@/app/actions/admin/catalog-library";
import type { BulkAiConfig } from "@/lib/bulk-ai/model-registry";

const PROFILES = [
  { key: "bulkAiFastModels", label: "Fast tasks" },
  { key: "bulkAiComplexModels", label: "Complex tasks" },
  { key: "bulkAiVisionModels", label: "Vision" },
] as const;

export function AiSettingsForm({ config, labels, hasKey }: { config: BulkAiConfig; labels: Record<string, string>; hasKey: boolean }) {
  const router = useRouter();
  const [c, setC] = useState<BulkAiConfig>(config);
  const [advanced, setAdvanced] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [pending, start] = useTransition();

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
      {!hasKey && <Alert tone="warning">No OpenRouter API key is set. Add one under Settings → Integrations (or BULK_AI_OPENROUTER_API_KEY).</Alert>}

      <Card className="flex items-center justify-between p-6">
        <div>
          <div className="font-medium">AI Assistance: {c.bulkAiEnabled ? "On" : "Off"}</div>
          <div className="text-sm text-[var(--text-secondary)]">Imports work fully without AI; it only speeds up titles, copy and photo descriptions.</div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={c.bulkAiEnabled} onChange={(e) => setC({ ...c, bulkAiEnabled: e.target.checked })} /> Enabled
        </label>
      </Card>

      <button type="button" className="text-sm text-[var(--accent)] underline" onClick={() => setAdvanced((a) => !a)}>
        {advanced ? "Hide" : "Show"} advanced model settings
      </button>

      {advanced && (
        <Card className="space-y-5 p-6">
          <label className="block text-sm">
            Policy
            <select className="lx-field mt-1 w-64" value={c.bulkAiPolicy} onChange={(e) => setC({ ...c, bulkAiPolicy: e.target.value as BulkAiConfig["bulkAiPolicy"] })}>
              <option value="FREE_ONLY">Free models only</option>
              <option value="FREE_THEN_PAID">Free first, then paid</option>
              <option value="PAID_ONLY">Paid models only</option>
            </select>
            {c.bulkAiPolicy === "FREE_ONLY" && <span className="mt-1 block text-xs text-[var(--text-secondary)]">Model IDs that do not end in “:free” are never called.</span>}
          </label>
          {PROFILES.map((p) => (
            <div key={p.key}>
              <div className="text-sm font-medium">{p.label}</div>
              <div className="mt-1 space-y-1">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <span className="w-4 text-[var(--text-secondary)]">{i + 1}.</span>
                    <input
                      className="lx-field w-full py-1 font-mono text-xs"
                      value={c[p.key][i] ?? ""}
                      onChange={(e) => {
                        const list = [...c[p.key]];
                        list[i] = e.target.value;
                        setC({ ...c, [p.key]: list });
                      }}
                    />
                    <span className="w-48 truncate text-xs text-[var(--text-secondary)]">{labels[c[p.key][i] ?? ""] ?? ""}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
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
