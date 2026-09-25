import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Percent, Clock, Layers } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { formatMoney, toMajorUnits } from "@/lib/money";
import { Card, Badge, SectionHeading } from "@/components/ui";
import {
  bulkAdjustPricesByPercentAction,
  bulkConfigurePreorderAction,
  bulkInlineVariantSaveAction,
} from "@/app/actions/admin/bulk-products";

export const metadata: Metadata = { title: "Bulk Price, Stock & Pre-Order Editor" };
export const dynamic = "force-dynamic";

export default async function BulkProductEditorPage() {
  await requirePermission("products:write");

  const [categories, variants] = await Promise.all([
    db.category.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.variant.findMany({
      include: {
        product: {
          select: {
            id: true,
            title: true,
            isPreorder: true,
            preorderDepositPercent: true,
            preorderLeadTime: true,
          },
        },
        inventory: { select: { onHand: true, reserved: true } },
      },
      orderBy: [{ product: { title: "asc" } }, { position: "asc" }],
    }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/admin/products"
        className="flex w-fit items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to Products
      </Link>

      <SectionHeading
        title="Bulk Price, FX & Pre-Order Matrix"
        description="Adjust catalog prices across categories when exchange rates move, configure Pre-Order lead times in bulk, or inline-edit unit price, cost price (COGS), and stock."
      />

      {/* Top Two-Column Batch Action Cards */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Card 1: FX / Percentage Price Adjuster */}
        <Card className="p-6">
          <div className="flex items-center gap-2">
            <Percent className="h-4 w-4 text-[var(--accent)]" />
            <h2 className="text-base font-medium">FX &amp; Inflation Percentage Price Adjuster</h2>
          </div>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            Increase or decrease all prices in a category (or the entire store) by a percentage and optionally round to the nearest ₵10.
          </p>

          <form action={bulkAdjustPricesByPercentAction} className="mt-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs text-[var(--text-secondary)]">Target Category</label>
                <select name="categoryId" className="lx-field mt-1 w-full py-2 text-xs">
                  <option value="ALL">Entire Store Catalog</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-[var(--text-secondary)]">
                  Adjustment % (e.g. +5 or -4)
                </label>
                <input
                  type="number"
                  step="0.5"
                  name="percent"
                  required
                  placeholder="e.g. 5"
                  className="lx-field mt-1 w-full py-2 text-xs tabular-nums"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
              <input type="checkbox" name="roundToNearestTen" defaultChecked />
              Round resulting prices cleanly to the nearest ₵10
            </label>

            <button
              type="submit"
              className="rounded-(--radius-card) bg-[var(--accent)] px-4 py-2 text-xs font-medium text-[var(--accent-contrast)]"
            >
              Apply Bulk Price Adjustment
            </button>
          </form>
        </Card>

        {/* Card 2: Bulk Pre-Order & Lead Time Configurator */}
        <Card className="p-6">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-[var(--accent)]" />
            <h2 className="text-base font-medium">Bulk Pre-Order &amp; Deposit Rule Setter</h2>
          </div>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            Enable or disable Pre-Order status, set the required reservation deposit %, and update estimated freight lead time in bulk.
          </p>

          <form action={bulkConfigurePreorderAction} className="mt-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs text-[var(--text-secondary)]">Target Category</label>
                <select name="categoryId" className="lx-field mt-1 w-full py-2 text-xs">
                  <option value="ALL">Entire Store Catalog</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-[var(--text-secondary)]">Pre-Order Mode</label>
                <select name="mode" className="lx-field mt-1 w-full py-2 text-xs">
                  <option value="ENABLE">Enable Pre-Order &amp; Backorder</option>
                  <option value="DISABLE">Set as In-Stock Only (Disable Pre-Order)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-[var(--text-secondary)]">Deposit %</label>
                <input
                  type="number"
                  min={10}
                  max={100}
                  defaultValue={50}
                  name="depositPercent"
                  className="lx-field mt-1 w-full py-2 text-xs tabular-nums"
                />
              </div>

              <div>
                <label className="block text-xs text-[var(--text-secondary)]">Lead Time</label>
                <input
                  type="text"
                  defaultValue="4–6 weeks"
                  name="leadTime"
                  className="lx-field mt-1 w-full py-2 text-xs"
                />
              </div>
            </div>

            <button
              type="submit"
              className="rounded-(--radius-card) bg-[var(--accent)] px-4 py-2 text-xs font-medium text-[var(--accent-contrast)]"
            >
              Apply Pre-Order Rules
            </button>
          </form>
        </Card>
      </div>

      {/* Inline Spreadsheet Matrix for Price, Cost Price (COGS) & Stock */}
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-6 py-4">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-[var(--accent)]" />
            <h2 className="text-base font-medium">
              Inline Price, Cost Margin (COGS) &amp; Stock Ledger ({variants.length} SKUs)
            </h2>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[var(--border-subtle)] bg-[var(--surface-sunken)] text-xs uppercase tracking-[0.1em] text-[var(--text-muted)]">
              <tr>
                <th className="px-5 py-3">Piece &amp; Variant</th>
                <th className="px-5 py-3">SKU</th>
                <th className="px-5 py-3">Mode</th>
                <th className="px-5 py-3">Retail Price (GHS)</th>
                <th className="px-5 py-3">Unit Cost / COGS (GHS)</th>
                <th className="px-5 py-3">Gross Margin</th>
                <th className="px-5 py-3">On-Hand Stock</th>
                <th className="px-5 py-3 text-right">Save</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {variants.map((v) => {
                const cost = v.costPrice ?? Math.round(v.price * 0.58);
                const profit = v.price - cost;
                const marginPct = v.price > 0 ? Math.round((profit / v.price) * 100) : 0;
                const formId = `inline-form-${v.id}`;

                return (
                  <tr key={v.id} className="hover:bg-[var(--surface-sunken)]/40">
                    <td className="px-5 py-3">
                      <div className="font-medium">{v.product.title}</div>
                      <div className="text-xs text-[var(--text-muted)]">{v.title}</div>
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-[var(--text-secondary)]">
                      {v.sku}
                    </td>
                    <td className="px-5 py-3">
                      {v.product.isPreorder ? (
                        <Badge tone="accent">
                          Pre-Order ({v.product.preorderDepositPercent ?? 50}%)
                        </Badge>
                      ) : (
                        <Badge tone="neutral">In Stock</Badge>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <form id={formId} action={bulkInlineVariantSaveAction} />
                      <input type="hidden" form={formId} name="variantId" value={v.id} />
                      <input
                        type="number"
                        step="0.01"
                        form={formId}
                        name="priceMajor"
                        defaultValue={toMajorUnits(v.price)}
                        className="lx-field w-28 py-1.5 text-xs tabular-nums"
                      />
                    </td>
                    <td className="px-5 py-3">
                      <input
                        type="number"
                        step="0.01"
                        form={formId}
                        name="costMajor"
                        defaultValue={toMajorUnits(cost)}
                        className="lx-field w-28 py-1.5 text-xs tabular-nums"
                      />
                    </td>
                    <td className="px-5 py-3 text-xs tabular-nums">
                      <span className="font-medium text-emerald-600">
                        {formatMoney(profit)} ({marginPct}%)
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <input
                        type="number"
                        form={formId}
                        name="onHand"
                        defaultValue={v.inventory?.onHand ?? 0}
                        className="lx-field w-20 py-1.5 text-xs tabular-nums"
                      />
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        type="submit"
                        form={formId}
                        className="rounded border border-[var(--border-subtle)] px-3 py-1.5 text-xs font-medium hover:border-[var(--accent)] hover:text-[var(--accent)]"
                      >
                        Save Row
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
