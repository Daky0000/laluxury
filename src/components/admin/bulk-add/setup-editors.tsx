"use client";

import { useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import type { OptionSpec, PricingSpec, StockSpec } from "@/lib/bulk-import/schema";

/**
 * The building blocks of Bulk Product Add's setup, shared by the import
 * wizard and the Product Recipe editor. Prices are typed in cedis and kept in
 * pesewas.
 */

export type LibraryOption = { name: string; values: string[] };

const SEP = " / ";
export const comboKeyOf = (values: string[]) => (values.length ? values.join(SEP) : "Default");

export function combinations(options: OptionSpec[]): string[][] {
  return options.reduce<string[][]>((acc, o) => acc.flatMap((p) => o.values.map((v) => [...p, v])), [[]]);
}

const toCedis = (minor: number | null | undefined) => (minor == null ? "" : String(minor / 100));
const toMinor = (raw: string): number | null => {
  const n = Number(raw.replace(/[^0-9.]/g, ""));
  return raw.trim() === "" || !Number.isFinite(n) ? null : Math.round(n * 100);
};
const toQty = (raw: string): number | null => {
  const n = parseInt(raw, 10);
  return raw.trim() === "" || !Number.isFinite(n) ? null : Math.max(0, n);
};

// --- How is this product sold? ------------------------------------------------

export function SoldAsPicker({
  options,
  onChange,
  library,
}: {
  options: OptionSpec[];
  onChange: (next: OptionSpec[]) => void;
  library: LibraryOption[];
}) {
  const mode = options.length === 0 ? 0 : options.length === 1 ? 1 : 2;
  const choose = (m: number) => {
    if (m === 0) onChange([]);
    else if (m === 1) onChange(options.slice(0, 1).length ? options.slice(0, 1) : [{ name: library[0]?.name ?? "Size", values: [] }]);
    else onChange(options.length >= 2 ? options : [...(options.length ? options : [{ name: "Size", values: [] }]), { name: library.find((l) => !options.some((o) => o.name === l.name) && l.name !== "Size")?.name ?? "Colour", values: [] }]);
  };
  const choices = [
    { m: 0, title: "Just one version", body: "Example: one carpet, one price." },
    { m: 1, title: "Customers choose one thing", body: "Example: bedsheet size." },
    { m: 2, title: "Customers choose two or more things", body: "Example: curtain blind size + colour." },
  ];
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        {choices.map((c) => (
          <button
            key={c.m}
            type="button"
            onClick={() => choose(c.m)}
            className={`rounded-lg border p-4 text-left transition ${mode === c.m ? "border-[var(--accent)] bg-[var(--surface-sunken)]" : "border-[var(--border-subtle)] hover:border-[var(--text-secondary)]"}`}
          >
            <div className="text-sm font-medium">{c.title}</div>
            <div className="mt-1 text-xs text-[var(--text-secondary)]">{c.body}</div>
          </button>
        ))}
      </div>
      {mode > 0 && <OptionsEditor options={options} onChange={onChange} library={library} allowAdd={mode === 2} />}
    </div>
  );
}

export function OptionsEditor({
  options,
  onChange,
  library,
  allowAdd = true,
}: {
  options: OptionSpec[];
  onChange: (next: OptionSpec[]) => void;
  library: LibraryOption[];
  allowAdd?: boolean;
}) {
  const update = (i: number, next: OptionSpec) => onChange(options.map((o, j) => (j === i ? next : o)));
  const remove = (i: number) => onChange(options.filter((_, j) => j !== i));
  return (
    <div className="space-y-4">
      {options.map((option, i) => (
        <OptionCard
          key={i}
          index={i}
          option={option}
          library={library}
          taken={options.filter((_, j) => j !== i).map((o) => o.name)}
          onChange={(next) => update(i, next)}
          onRemove={options.length > 1 || allowAdd ? () => remove(i) : undefined}
        />
      ))}
      {allowAdd && options.length < 10 && (
        <button
          type="button"
          onClick={() => onChange([...options, { name: "", values: [] }])}
          className="inline-flex items-center gap-1.5 text-sm text-[var(--accent)] hover:underline"
        >
          <Plus className="h-4 w-4" /> Add another option
        </button>
      )}
    </div>
  );
}

function OptionCard({
  index,
  option,
  library,
  taken,
  onChange,
  onRemove,
}: {
  index: number;
  option: OptionSpec;
  library: LibraryOption[];
  taken: string[];
  onChange: (next: OptionSpec) => void;
  onRemove?: () => void;
}) {
  const [custom, setCustom] = useState(option.name !== "" && !library.some((l) => l.name === option.name));
  const [newValue, setNewValue] = useState("");
  const saved = library.find((l) => l.name === option.name)?.values ?? [];
  const all = [...saved, ...option.values.filter((v) => !saved.includes(v))];
  const toggle = (v: string) =>
    onChange({ ...option, values: option.values.includes(v) ? option.values.filter((x) => x !== v) : [...option.values, v] });
  const addValue = () => {
    const v = newValue.trim();
    if (!v || option.values.some((x) => x.toLowerCase() === v.toLowerCase())) return;
    onChange({ ...option, values: [...option.values, v] });
    setNewValue("");
  };

  return (
    <div className="rounded-lg border border-[var(--border-subtle)] p-4">
      <div className="flex items-center gap-3">
        <span className="text-xs uppercase tracking-wide text-[var(--text-secondary)]">Option {index + 1}</span>
        {custom ? (
          <input
            className="lx-field w-56 py-1.5 text-sm"
            placeholder="e.g. Finish, Pack Size"
            value={option.name}
            onChange={(e) => onChange({ ...option, name: e.target.value })}
          />
        ) : (
          <select
            className="lx-field w-56 py-1.5 text-sm"
            value={option.name}
            onChange={(e) => {
              if (e.target.value === "__custom") {
                setCustom(true);
                onChange({ name: "", values: [] });
              } else onChange({ name: e.target.value, values: [] });
            }}
          >
            <option value="">Choose…</option>
            {library
              .filter((l) => !taken.includes(l.name))
              .map((l) => (
                <option key={l.name} value={l.name}>
                  {l.name}
                </option>
              ))}
            <option value="__custom">+ Create custom option</option>
          </select>
        )}
        {custom && library.length > 0 && (
          <button type="button" className="text-xs text-[var(--text-secondary)] underline" onClick={() => setCustom(false)}>
            Pick from library
          </button>
        )}
        {onRemove && (
          <button type="button" onClick={onRemove} className="ml-auto text-[var(--text-secondary)] hover:text-danger" aria-label="Remove option">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {option.name && (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            {all.map((v) => (
              <label
                key={v}
                className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${option.values.includes(v) ? "border-[var(--accent)] bg-[var(--surface-sunken)]" : "border-[var(--border-subtle)] text-[var(--text-secondary)]"}`}
              >
                <input type="checkbox" className="sr-only" checked={option.values.includes(v)} onChange={() => toggle(v)} />
                {option.values.includes(v) ? "☑" : "☐"} {v}
                {!saved.includes(v) && <span className="text-[10px] text-[var(--text-secondary)]">(this import)</span>}
              </label>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <input
              className="lx-field w-56 py-1.5 text-sm"
              placeholder={`+ Add custom ${option.name.toLowerCase()}`}
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addValue();
                }
              }}
            />
            <button type="button" onClick={addValue} className="text-sm text-[var(--accent)] hover:underline">
              Add value
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// --- Combinations -------------------------------------------------------------

export function CombinationToggles({
  options,
  disabled,
  onChange,
}: {
  options: OptionSpec[];
  disabled: string[];
  onChange: (next: string[]) => void;
}) {
  const combos = useMemo(() => combinations(options.filter((o) => o.values.length)), [options]);
  if (options.length === 0 || combos.length <= 1) return null;
  const off = new Set(disabled);
  return (
    <div>
      <div className="text-sm">
        {options.map((o) => `${o.values.length} ${o.name.toLowerCase()}${o.values.length === 1 ? "" : "s"}`).join(" × ")} ={" "}
        <strong>{combos.length - combos.filter((c) => off.has(comboKeyOf(c))).length}</strong> versions
      </div>
      {combos.length <= 400 ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-[var(--text-secondary)]">Turn off combinations you don&apos;t sell</summary>
          <div className="mt-2 grid max-h-64 grid-cols-2 gap-1 overflow-y-auto md:grid-cols-4">
            {combos.map((c) => {
              const key = comboKeyOf(c);
              return (
                <label key={key} className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={!off.has(key)}
                    onChange={() => onChange(off.has(key) ? disabled.filter((d) => d !== key) : [...disabled, key])}
                  />
                  {key}
                </label>
              );
            })}
          </div>
        </details>
      ) : (
        <p className="mt-1 text-xs text-[var(--text-secondary)]">Too many to list; turn versions off per product during review.</p>
      )}
    </div>
  );
}

// --- How does the price change? -------------------------------------------------

export function PricingEditor({
  options,
  value,
  onChange,
  allowSource,
}: {
  options: OptionSpec[];
  value: PricingSpec;
  onChange: (next: PricingSpec) => void;
  allowSource: boolean;
}) {
  const named = options.filter((o) => o.name && o.values.length);
  const choices: { id: string; label: string; spec: () => PricingSpec }[] = [
    { id: "SAME", label: "Same price for everything", spec: () => ({ mode: "SAME", price: value.mode === "SAME" ? value.price : null }) },
    ...named.map((o) => ({
      id: `BY_OPTION:${o.name}`,
      label: `Price changes by ${o.name}`,
      spec: (): PricingSpec => ({ mode: "BY_OPTION", option: o.name, prices: value.mode === "BY_OPTION" && value.option === o.name ? value.prices : {} }),
    })),
    ...(named.length > 1
      ? [
          { id: "BY_OPTIONS", label: "More than one choice affects the price", spec: (): PricingSpec => ({ mode: "BY_OPTIONS", base: 0, adjustments: {} }) },
          { id: "BY_COMBINATION", label: "Every combination has its own price", spec: (): PricingSpec => ({ mode: "BY_COMBINATION", prices: {} }) },
        ]
      : []),
    ...(allowSource ? [{ id: "SOURCE", label: "Use spreadsheet price", spec: (): PricingSpec => ({ mode: "SOURCE" }) }] : []),
  ];
  const current = value.mode === "BY_OPTION" ? `BY_OPTION:${value.option}` : value.mode;

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        {choices.map((c) => (
          <label key={c.id} className="flex items-center gap-2 text-sm">
            <input type="radio" checked={current === c.id} onChange={() => onChange(c.spec())} />
            {c.label}
          </label>
        ))}
      </div>

      {value.mode === "SAME" && (
        <MoneyInput label="Price (GHS)" value={value.price} onChange={(price) => onChange({ mode: "SAME", price })} hint={allowSource ? "Leave blank to use the spreadsheet price." : undefined} />
      )}

      {value.mode === "BY_OPTION" && (
        <table className="text-sm">
          <thead>
            <tr className="text-left text-xs text-[var(--text-secondary)]">
              <th className="pr-6 font-normal">{value.option}</th>
              <th className="font-normal">Price (GHS)</th>
            </tr>
          </thead>
          <tbody>
            {(named.find((o) => o.name === value.option)?.values ?? []).map((v) => (
              <tr key={v}>
                <td className="py-1 pr-6">{v}</td>
                <td className="py-1">
                  <input
                    className="lx-field w-28 py-1 text-sm"
                    inputMode="decimal"
                    defaultValue={toCedis(value.prices[v])}
                    onBlur={(e) => {
                      const m = toMinor(e.target.value);
                      const prices = { ...value.prices };
                      if (m == null) delete prices[v];
                      else prices[v] = m;
                      onChange({ ...value, prices });
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {value.mode === "BY_OPTIONS" && (
        <div className="space-y-3">
          <MoneyInput label="Base price (GHS)" value={value.base} onChange={(base) => onChange({ ...value, base: base ?? 0 })} />
          {named.map((o) => (
            <div key={o.name}>
              <div className="text-xs text-[var(--text-secondary)]">Add for {o.name} (GHS, can be negative)</div>
              <div className="mt-1 flex flex-wrap gap-3">
                {o.values.map((v) => (
                  <label key={v} className="flex items-center gap-1 text-xs">
                    {v}
                    <input
                      className="lx-field w-20 py-1 text-xs"
                      defaultValue={value.adjustments[o.name]?.[v] != null ? String(value.adjustments[o.name][v] / 100) : ""}
                      onBlur={(e) => {
                        const n = Number(e.target.value);
                        const adj = { ...value.adjustments, [o.name]: { ...(value.adjustments[o.name] ?? {}) } };
                        if (e.target.value.trim() === "" || !Number.isFinite(n)) delete adj[o.name][v];
                        else adj[o.name][v] = Math.round(n * 100);
                        onChange({ ...value, adjustments: adj });
                      }}
                    />
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {value.mode === "BY_COMBINATION" && named.length >= 2 && (
        <ComboMatrix
          options={named}
          values={value.prices}
          format={toCedis}
          parse={toMinor}
          onChange={(prices) => onChange({ mode: "BY_COMBINATION", prices })}
        />
      )}
    </div>
  );
}

// --- How is stock tracked? --------------------------------------------------------

export function StockEditor({
  options,
  value,
  onChange,
  allowSource,
}: {
  options: OptionSpec[];
  value: StockSpec;
  onChange: (next: StockSpec) => void;
  allowSource: boolean;
}) {
  const named = options.filter((o) => o.name && o.values.length);
  const choices: { id: string; label: string; spec: () => StockSpec }[] = [
    { id: "SAME", label: "Same quantity for every version", spec: () => ({ mode: "SAME", quantity: value.mode === "SAME" ? value.quantity : 0 }) },
    ...named.map((o) => ({
      id: `BY_OPTION:${o.name}`,
      label: `Stock changes by ${o.name}`,
      spec: (): StockSpec => ({ mode: "BY_OPTION", option: o.name, quantities: {} }),
    })),
    ...(named.length > 1 ? [{ id: "BY_COMBINATION", label: "Stock differs for every combination", spec: (): StockSpec => ({ mode: "BY_COMBINATION", quantities: {} }) }] : []),
    ...(allowSource ? [{ id: "SOURCE", label: "Use spreadsheet stock", spec: (): StockSpec => ({ mode: "SOURCE" }) }] : []),
    { id: "UNTRACKED", label: "Don't track stock", spec: () => ({ mode: "UNTRACKED" }) },
  ];
  const current = value.mode === "BY_OPTION" ? `BY_OPTION:${value.option}` : value.mode;

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        {choices.map((c) => (
          <label key={c.id} className="flex items-center gap-2 text-sm">
            <input type="radio" checked={current === c.id} onChange={() => onChange(c.spec())} />
            {c.label}
          </label>
        ))}
      </div>
      {value.mode === "SAME" && (
        <label className="block text-xs text-[var(--text-secondary)]">
          Quantity
          <input
            className="lx-field mt-1 block w-28 py-1 text-sm"
            inputMode="numeric"
            defaultValue={String(value.quantity)}
            onBlur={(e) => onChange({ mode: "SAME", quantity: toQty(e.target.value) ?? 0 })}
          />
        </label>
      )}
      {value.mode === "BY_OPTION" && (
        <div className="flex flex-wrap gap-3">
          {(named.find((o) => o.name === value.option)?.values ?? []).map((v) => (
            <label key={v} className="flex items-center gap-1 text-xs">
              {v}
              <input
                className="lx-field w-16 py-1 text-xs"
                defaultValue={value.quantities[v] != null ? String(value.quantities[v]) : ""}
                onBlur={(e) => {
                  const q = toQty(e.target.value);
                  const quantities = { ...value.quantities };
                  if (q == null) delete quantities[v];
                  else quantities[v] = q;
                  onChange({ ...value, quantities });
                }}
              />
            </label>
          ))}
        </div>
      )}
      {value.mode === "BY_COMBINATION" && named.length >= 2 && (
        <ComboMatrix
          options={named}
          values={value.quantities}
          format={(n) => (n == null ? "" : String(n))}
          parse={toQty}
          onChange={(quantities) => onChange({ mode: "BY_COMBINATION", quantities })}
        />
      )}
    </div>
  );
}

/** Rows = first option, columns = second, extra options listed as separate tables. */
function ComboMatrix({
  options,
  values,
  format,
  parse,
  onChange,
}: {
  options: OptionSpec[];
  values: Record<string, number>;
  format: (n: number | undefined) => string;
  parse: (raw: string) => number | null;
  onChange: (next: Record<string, number>) => void;
}) {
  const [rows, cols, ...rest] = options;
  const extra = combinations(rest);
  if (rows.values.length * cols.values.length * extra.length > 2000) {
    return <p className="text-xs text-[var(--text-secondary)]">Too many combinations to type by hand — use a spreadsheet instead.</p>;
  }
  return (
    <div className="space-y-4 overflow-x-auto">
      {extra.map((tail) => (
        <table key={tail.join("|") || "main"} className="text-xs">
          <thead>
            <tr>
              <th className="pr-3 text-left font-normal text-[var(--text-secondary)]">
                {rows.name} / {cols.name}
                {tail.length ? ` (${tail.join(", ")})` : ""}
              </th>
              {cols.values.map((c) => (
                <th key={c} className="px-1 font-normal">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.values.map((r) => (
              <tr key={r}>
                <td className="pr-3">{r}</td>
                {cols.values.map((c) => {
                  const key = comboKeyOf([r, c, ...tail]);
                  return (
                    <td key={c} className="px-1 py-0.5">
                      <input
                        className="lx-field w-20 py-1 text-xs"
                        defaultValue={format(values[key])}
                        onBlur={(e) => {
                          const n = parse(e.target.value);
                          const next = { ...values };
                          if (n == null) delete next[key];
                          else next[key] = n;
                          onChange(next);
                        }}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      ))}
    </div>
  );
}

export function MoneyInput({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: number | null;
  onChange: (minor: number | null) => void;
  hint?: string;
}) {
  return (
    <label className="block text-xs text-[var(--text-secondary)]">
      {label}
      <input
        className="lx-field mt-1 block w-32 py-1 text-sm"
        inputMode="decimal"
        defaultValue={toCedis(value)}
        onBlur={(e) => onChange(toMinor(e.target.value))}
      />
      {hint && <span className="mt-1 block text-[11px]">{hint}</span>}
    </label>
  );
}
