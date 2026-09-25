"use client";

import { useState } from "react";
import { Plus, Trash2, Calculator, CreditCard, Sparkles } from "lucide-react";
import { createPosShowroomOrderAction } from "@/app/actions/admin/pos";
import { formatMoney } from "@/lib/money";

export type PosCatalogVariant = {
  id: string;
  sku: string;
  title: string;
  price: number;
  productTitle: string;
  isPreorder: boolean;
  available: number;
};

export function PosOrderBuilder({ variants }: { variants: PosCatalogVariant[] }) {
  const [lines, setLines] = useState<{ variantId: string; quantity: number }[]>([
    { variantId: variants[0]?.id ?? "", quantity: 1 },
  ]);
  const [paymentMode, setPaymentMode] = useState<"FULL_100" | "DEPOSIT_50">("FULL_100");
  const [shippingGhs, setShippingGhs] = useState<number>(0);
  const [discountGhs, setDiscountGhs] = useState<number>(0);

  const variantMap = new Map(variants.map((v) => [v.id, v]));

  const subtotalMinor = lines.reduce((sum, line) => {
    const v = variantMap.get(line.variantId);
    return sum + (v ? v.price * line.quantity : 0);
  }, 0);

  const shippingMinor = Math.max(0, Math.round(shippingGhs * 100));
  const discountMinor = Math.max(0, Math.round(discountGhs * 100));
  const totalMinor = Math.max(0, subtotalMinor - discountMinor + shippingMinor);
  const dueTodayMinor = paymentMode === "DEPOSIT_50" ? Math.round(totalMinor * 0.5) : totalMinor;
  const balanceLaterMinor = paymentMode === "DEPOSIT_50" ? totalMinor - dueTodayMinor : 0;

  function addLine() {
    if (!variants[0]) return;
    setLines((prev) => [...prev, { variantId: variants[0].id, quantity: 1 }]);
  }

  function removeLine(idx: number) {
    setLines((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateLine(idx: number, patch: Partial<{ variantId: string; quantity: number }>) {
    setLines((prev) => prev.map((item, i) => (i === idx ? { ...item, ...patch } : item)));
  }

  return (
    <form action={createPosShowroomOrderAction} className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
      <input type="hidden" name="itemsJson" value={JSON.stringify(lines)} />
      <input type="hidden" name="paymentMode" value={paymentMode} />

      <div className="space-y-6">
        {/* Step 1: Pieces Selection */}
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-6">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-4">
            <div>
              <p className="lx-eyebrow">Step 1 · Catalog Selection</p>
              <h2 className="mt-0.5 text-lg font-medium">Showroom &amp; Pre-Order Pieces</h2>
            </div>
            <button
              type="button"
              onClick={addLine}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--surface-sunken)]"
            >
              <Plus className="h-3.5 w-3.5" /> Add Another Piece
            </button>
          </div>

          <div className="mt-4 space-y-3">
            {lines.map((line, idx) => {
              const selected = variantMap.get(line.variantId);
              return (
                <div
                  key={idx}
                  className="grid gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-3.5 sm:grid-cols-[1fr_6rem_8rem_auto] sm:items-center"
                >
                  <div>
                    <label className="block text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                      Product &amp; Variant
                    </label>
                    <select
                      value={line.variantId}
                      onChange={(e) => updateLine(idx, { variantId: e.target.value })}
                      className="lx-field mt-1 w-full py-2 text-xs"
                    >
                      {variants.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.productTitle} — {v.title} ({formatMoney(v.price)})
                          {v.isPreorder ? " [PRE-ORDER]" : ` [${v.available} in stock]`}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                      Qty
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={99}
                      value={line.quantity}
                      onChange={(e) =>
                        updateLine(idx, { quantity: Math.max(1, Number(e.target.value) || 1) })
                      }
                      className="lx-field mt-1 w-full py-2 text-xs tabular-nums"
                    />
                  </div>

                  <div className="text-right">
                    <span className="block text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                      Line Total
                    </span>
                    <span className="mt-1 block text-sm font-medium tabular-nums">
                      {formatMoney((selected?.price ?? 0) * line.quantity)}
                    </span>
                  </div>

                  {lines.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => removeLine(idx)}
                      className="self-end rounded p-2 text-[var(--text-muted)] hover:text-red-500"
                      title="Remove line"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        {/* Step 2: Client & White-Glove Delivery Address */}
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-6">
          <p className="lx-eyebrow">Step 2 · Client &amp; Delivery Details</p>
          <h2 className="mt-0.5 text-lg font-medium">Walk-In, WhatsApp or Trade Client</h2>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs text-[var(--text-secondary)]">First Name *</label>
              <input
                name="firstName"
                required
                placeholder="e.g. Kwame"
                className="lx-field mt-1 w-full py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--text-secondary)]">Last Name *</label>
              <input
                name="lastName"
                required
                placeholder="e.g. Boateng"
                className="lx-field mt-1 w-full py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--text-secondary)]">Phone / WhatsApp *</label>
              <input
                name="phone"
                required
                placeholder="+233 24 000 0000"
                className="lx-field mt-1 w-full py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--text-secondary)]">Client Email</label>
              <input
                type="email"
                name="email"
                placeholder="client@example.com"
                className="lx-field mt-1 w-full py-2 text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-[var(--text-secondary)]">
                Delivery Address or Showroom Pickup Note
              </label>
              <input
                name="addressLine1"
                defaultValue="East Legon / White-Glove Residence Delivery"
                className="lx-field mt-1 w-full py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--text-secondary)]">City</label>
              <input
                name="city"
                defaultValue="Accra"
                className="lx-field mt-1 w-full py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--text-secondary)]">Region</label>
              <input
                name="region"
                defaultValue="Greater Accra"
                className="lx-field mt-1 w-full py-2 text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-[var(--text-secondary)]">
                Bespoke Dimensions / Upholstery / Installation Notes
              </label>
              <textarea
                name="customerNote"
                rows={2}
                placeholder="e.g. Ground floor salon placement, Italian Cream Bouclé swatch approved..."
                className="lx-field mt-1 w-full py-2 text-sm"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Right Column: Payment Split, Settlement & Invoice Summary */}
      <div className="space-y-6">
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-6">
          <div className="flex items-center gap-2">
            <Calculator className="h-4 w-4 text-[var(--accent)]" />
            <h2 className="text-lg font-medium">Payment Structure &amp; Billing</h2>
          </div>

          {/* 100% vs 50% Deposit Toggle */}
          <div className="mt-4 grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => setPaymentMode("FULL_100")}
              className={`rounded-lg border p-3 text-left transition ${
                paymentMode === "FULL_100"
                  ? "border-[var(--accent)] bg-[var(--accent)]/10"
                  : "border-[var(--border-subtle)]"
              }`}
            >
              <span className="block text-xs font-semibold uppercase tracking-wider">
                100% Full Payment
              </span>
              <span className="mt-1 block text-xs text-[var(--text-secondary)]">
                Standard Showroom / Immediate Dispatch
              </span>
            </button>

            <button
              type="button"
              onClick={() => setPaymentMode("DEPOSIT_50")}
              className={`rounded-lg border p-3 text-left transition ${
                paymentMode === "DEPOSIT_50"
                  ? "border-[var(--accent)] bg-[var(--accent)]/10"
                  : "border-[var(--border-subtle)]"
              }`}
            >
              <span className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-[var(--accent)]">
                <Sparkles className="h-3 w-3" /> 50% Pre-Order Deposit
              </span>
              <span className="mt-1 block text-xs text-[var(--text-secondary)]">
                50% Now · 50% Balance on Arrival
              </span>
            </button>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[var(--text-secondary)]">
                Courtesy Discount (GHS)
              </label>
              <input
                type="number"
                step="1"
                min="0"
                name="discountGhs"
                value={discountGhs}
                onChange={(e) => setDiscountGhs(Number(e.target.value) || 0)}
                className="lx-field mt-1 w-full py-2 text-sm tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--text-secondary)]">
                White-Glove Delivery (GHS)
              </label>
              <input
                type="number"
                step="1"
                min="0"
                name="shippingGhs"
                value={shippingGhs}
                onChange={(e) => setShippingGhs(Number(e.target.value) || 0)}
                className="lx-field mt-1 w-full py-2 text-sm tabular-nums"
              />
            </div>
          </div>

          <div className="mt-4">
            <label className="block text-xs text-[var(--text-secondary)]">
              Settlement Channel
            </label>
            <select
              name="settlementChannel"
              defaultValue="PUSH_MOMO_PIN"
              className="lx-field mt-1 w-full py-2 text-sm font-medium"
            >
              <option value="PUSH_MOMO_PIN">
                📱 Push Live MoMo PIN Prompt to Client’s Phone (MTN / Telecel / AT)
              </option>
              <option value="PAID_POS">Paid in Showroom (POS Card / Cash / MoMo Received)</option>
              <option value="PAID_MOMO_BANK">Paid via Bank Wire / Concierge MoMo Transfer</option>
              <option value="PENDING_INVOICE">
                Unpaid Pro-Forma Quote (Send Invoice &amp; Payment Link to Client)
              </option>
            </select>
          </div>

          {/* Totals Breakdown */}
          <dl className="mt-6 space-y-2 border-t border-[var(--border-subtle)] pt-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-[var(--text-secondary)]">Catalog Subtotal</dt>
              <dd className="tabular-nums">{formatMoney(subtotalMinor)}</dd>
            </div>
            {discountMinor > 0 ? (
              <div className="flex justify-between text-emerald-600">
                <dt>Courtesy / Trade Discount</dt>
                <dd className="tabular-nums">-{formatMoney(discountMinor)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between">
              <dt className="text-[var(--text-secondary)]">White-Glove Delivery</dt>
              <dd className="tabular-nums">{formatMoney(shippingMinor)}</dd>
            </div>
            <div className="flex justify-between border-t border-[var(--border-subtle)] pt-2 text-base font-semibold">
              <dt>Total Contract Value</dt>
              <dd className="tabular-nums">{formatMoney(totalMinor)}</dd>
            </div>
            {paymentMode === "DEPOSIT_50" ? (
              <div className="mt-2 rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/10 p-3 text-xs">
                <div className="flex justify-between font-semibold text-[var(--accent)]">
                  <span>50% Deposit Due Today:</span>
                  <span className="tabular-nums">{formatMoney(dueTodayMinor)}</span>
                </div>
                <div className="mt-1 flex justify-between text-[var(--text-secondary)]">
                  <span>50% Balance Due on Arrival:</span>
                  <span className="tabular-nums">{formatMoney(balanceLaterMinor)}</span>
                </div>
              </div>
            ) : null}
          </dl>

          <button
            type="submit"
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-5 py-3 text-sm font-medium text-[var(--accent-contrast)] hover:opacity-95"
          >
            <CreditCard className="h-4 w-4" />
            Create Order &amp; Generate Tax Invoice / Waybill
          </button>
        </div>
      </div>
    </form>
  );
}
