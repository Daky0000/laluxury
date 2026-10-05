"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { Alert, Button, Card } from "@/components/ui";
import {
  deleteLibraryOptionAction,
  deleteLibraryValueAction,
  deleteRuleAction,
  saveLibraryOptionAction,
  saveRuleAction,
} from "@/app/actions/admin/catalog-library";

type LibOption = { id: string; name: string; values: { id: string; value: string }[] };
type Rule = { id: string; field: string; fromValue: string; toValue: string };

export function LibraryManager({ options, rules }: { options: LibOption[]; rules: Rule[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newValues, setNewValues] = useState<string[]>(["", ""]);
  const [addTo, setAddTo] = useState<Record<string, string>>({});
  const [rule, setRule] = useState({ field: "", fromValue: "", toValue: "" });

  const run = (fn: () => Promise<{ ok: boolean; message?: string }>, after?: () => void) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (!res.ok) setError(res.message ?? "That did not work.");
      else {
        after?.();
        router.refresh();
      }
    });

  return (
    <div className="space-y-6">
      {error && <Alert tone="danger">{error}</Alert>}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {options.map((o) => (
          <Card key={o.id} className="p-5">
            <div className="flex items-center justify-between">
              <div className="font-medium">{o.name}</div>
              <button
                type="button"
                className="text-xs text-[var(--text-secondary)] underline"
                onClick={() => confirm(`Remove ${o.name} from the library? Existing products keep their options.`) && run(() => deleteLibraryOptionAction(o.id))}
              >
                Remove
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {o.values.map((v) => (
                <span key={v.id} className="inline-flex items-center gap-1 rounded-full border border-[var(--border-subtle)] px-2.5 py-0.5 text-xs">
                  {v.value}
                  <button type="button" aria-label={`Remove ${v.value}`} onClick={() => run(() => deleteLibraryValueAction(v.id))}>
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <input
                className="lx-field w-full py-1 text-sm"
                placeholder={`+ Add ${o.name.toLowerCase()} value`}
                value={addTo[o.id] ?? ""}
                onChange={(e) => setAddTo((a) => ({ ...a, [o.id]: e.target.value }))}
              />
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={pending || !(addTo[o.id] ?? "").trim()}
                onClick={() => run(() => saveLibraryOptionAction({ name: o.name, values: [addTo[o.id].trim()] }), () => setAddTo((a) => ({ ...a, [o.id]: "" })))}
              >
                Add
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <Card className="space-y-3 p-6">
        <h3 className="text-base font-medium">Create product option</h3>
        <label className="block text-sm">
          Option name
          <input className="lx-field mt-1 w-64" placeholder="Finish" value={newName} onChange={(e) => setNewName(e.target.value)} />
        </label>
        <div className="space-y-2">
          <div className="text-sm">Values</div>
          {newValues.map((v, i) => (
            <div key={i} className="flex items-center gap-2">
              <input className="lx-field w-64 py-1 text-sm" value={v} onChange={(e) => setNewValues((vals) => vals.map((x, j) => (j === i ? e.target.value : x)))} />
              <button type="button" aria-label="Remove value" onClick={() => setNewValues((vals) => vals.filter((_, j) => j !== i))}>
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
          <button type="button" className="text-sm text-[var(--accent)] underline" onClick={() => setNewValues((v) => [...v, ""])}>
            + Add another value
          </button>
        </div>
        <Button
          type="button"
          disabled={pending || !newName.trim()}
          onClick={() =>
            run(() => saveLibraryOptionAction({ name: newName.trim(), values: newValues.map((v) => v.trim()).filter(Boolean) }), () => {
              setNewName("");
              setNewValues(["", ""]);
            })
          }
        >
          Create option
        </Button>
      </Card>

      <Card className="space-y-3 p-6">
        <h3 className="text-base font-medium">Catalog rules</h3>
        <p className="text-sm text-[var(--text-secondary)]">Supplier spellings that always mean one of your values, e.g. Size “S-KING” → “Superking”.</p>
        <table className="text-sm">
          <tbody>
            {rules.map((r) => (
              <tr key={r.id}>
                <td className="pr-4 text-[var(--text-secondary)]">{r.field}</td>
                <td className="pr-4">“{r.fromValue}” → “{r.toValue}”</td>
                <td>
                  <button type="button" className="text-xs underline" onClick={() => run(() => deleteRuleAction(r.id))}>Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex flex-wrap items-center gap-2">
          <input className="lx-field w-32 py-1 text-sm" placeholder="Option (or *)" value={rule.field} onChange={(e) => setRule({ ...rule, field: e.target.value })} />
          <input className="lx-field w-40 py-1 text-sm" placeholder="Supplier spelling" value={rule.fromValue} onChange={(e) => setRule({ ...rule, fromValue: e.target.value })} />
          <span>→</span>
          <input className="lx-field w-40 py-1 text-sm" placeholder="Your value" value={rule.toValue} onChange={(e) => setRule({ ...rule, toValue: e.target.value })} />
          <Button type="button" size="sm" disabled={pending} onClick={() => run(() => saveRuleAction(rule), () => setRule({ field: "", fromValue: "", toValue: "" }))}>
            Save rule
          </Button>
        </div>
      </Card>
    </div>
  );
}
