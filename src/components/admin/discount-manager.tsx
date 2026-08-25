"use client";

import { useActionState, useState, useTransition } from "react";
import { Loader2, Plus, Trash2, Pencil } from "lucide-react";
import {
  saveDiscountAction,
  toggleDiscountAction,
  deleteDiscountAction,
} from "@/app/actions/admin/catalog-ops";
import type { AdminState } from "@/app/actions/admin/products";
import { Card, Field, Alert, Badge } from "@/components/ui";
import { formatMoney, toMajorUnits } from "@/lib/money";
import { formatDate, cn } from "@/lib/utils";

export type DiscountRow = {
  id: string;
  code: string;
  description: string | null;
  rule: string;
  type: "PERCENTAGE" | "FIXED_AMOUNT" | "FREE_SHIPPING";
  scope: "ENTIRE_ORDER" | "SPECIFIC_PRODUCTS" | "SPECIFIC_CATEGORIES";
  value: number;
  minSubtotal: number | null;
  minQuantity: number | null;
  usageLimit: number | null;
  usageLimitPerUser: number | null;
  firstOrderOnly: boolean;
  isActive: boolean;
  timesUsed: number;
  startsAt: string | null;
  endsAt: string | null;
  productIds: string[];
  categoryIds: string[];
  totalDiscounted: number;
};

type Ref = { id: string; name?: string; title?: string };

export function DiscountManager({
  discounts,
  categories,
  products,
  canWrite,
}: {
  discounts: DiscountRow[];
  categories: Ref[];
  products: Ref[];
  canWrite: boolean;
}) {
  const [editing, setEditing] = useState<DiscountRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, startBusy] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <div className="flex flex-col gap-6">
      {canWrite ? (
        <div className="flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => {
              setCreating(true);
              setEditing(null);
            }}
            className="flex items-center gap-1.5 rounded-[--radius-card] bg-[var(--accent)] px-4 py-2.5 text-sm text-[var(--accent-contrast)]"
          >
            <Plus className="h-4 w-4" aria-hidden />
            New discount code
          </button>
        </div>
      ) : null}

      {message ? <Alert tone={message.ok ? "success" : "danger"}>{message.text}</Alert> : null}

      {creating || editing ? (
        <DiscountForm
          key={editing?.id ?? "new"}
          discount={editing}
          categories={categories}
          products={products}
          onDone={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      ) : null}

      {discounts.length === 0 ? (
        <Card className="p-10 text-center text-sm text-[var(--text-secondary)]">
          No codes yet. Create one to run your first promotion.
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--border-subtle)] bg-[var(--surface-sunken)] text-left">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Code</th>
                  <th className="px-4 py-2.5 font-medium">Rule</th>
                  <th className="px-4 py-2.5 font-medium">Used</th>
                  <th className="px-4 py-2.5 font-medium">Given</th>
                  <th className="px-4 py-2.5 font-medium">Ends</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  {canWrite ? <th className="px-4 py-2.5 font-medium">Actions</th> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {discounts.map((discount) => {
                  const expired = discount.endsAt !== null && new Date(discount.endsAt) < new Date();
                  const exhausted =
                    discount.usageLimit !== null && discount.timesUsed >= discount.usageLimit;

                  return (
                    <tr key={discount.id} className="hover:bg-[var(--surface-sunken)]">
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs font-medium">{discount.code}</span>
                        {discount.description ? (
                          <span className="block text-xs text-[var(--text-muted)]">
                            {discount.description}
                          </span>
                        ) : null}
                      </td>

                      <td className="px-4 py-3 text-[var(--text-secondary)]">
                        {discount.rule}
                        {discount.firstOrderOnly ? " · first order" : ""}
                        {discount.minSubtotal
                          ? ` · min ${formatMoney(discount.minSubtotal)}`
                          : ""}
                      </td>

                      <td className="px-4 py-3 tabular-nums">
                        {discount.timesUsed}
                        {discount.usageLimit !== null ? (
                          <span className="text-[var(--text-muted)]">/{discount.usageLimit}</span>
                        ) : null}
                      </td>

                      <td className="px-4 py-3 tabular-nums text-[var(--text-secondary)]">
                        {formatMoney(discount.totalDiscounted)}
                      </td>

                      <td className="px-4 py-3 text-[var(--text-secondary)]">
                        {discount.endsAt ? formatDate(discount.endsAt) : "—"}
                      </td>

                      <td className="px-4 py-3">
                        {!discount.isActive ? (
                          <Badge tone="neutral">Off</Badge>
                        ) : expired ? (
                          <Badge tone="danger">Expired</Badge>
                        ) : exhausted ? (
                          <Badge tone="warning">Used up</Badge>
                        ) : (
                          <Badge tone="success">Live</Badge>
                        )}
                      </td>

                      {canWrite ? (
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setEditing(discount);
                                setCreating(false);
                              }}
                              className="rounded p-1.5 text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
                              aria-label={`Edit ${discount.code}`}
                            >
                              <Pencil className="h-3.5 w-3.5" aria-hidden />
                            </button>

                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                startBusy(async () => {
                                  const result = await toggleDiscountAction(
                                    discount.id,
                                    !discount.isActive,
                                  );
                                  setMessage({ ok: result.ok, text: result.message ?? "" });
                                })
                              }
                              className={cn(
                                "rounded px-2 py-1 text-xs",
                                discount.isActive
                                  ? "text-[var(--text-secondary)] hover:text-warning"
                                  : "text-success",
                              )}
                            >
                              {discount.isActive ? "Disable" : "Enable"}
                            </button>

                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => {
                                if (!confirm(`Delete ${discount.code}?`)) return;
                                startBusy(async () => {
                                  const result = await deleteDiscountAction(discount.id);
                                  setMessage({ ok: result.ok, text: result.message ?? "" });
                                });
                              }}
                              className="rounded p-1.5 text-[var(--text-secondary)] hover:text-danger"
                              aria-label={`Delete ${discount.code}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden />
                            </button>
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function DiscountForm({
  discount,
  categories,
  products,
  onDone,
}: {
  discount: DiscountRow | null;
  categories: Ref[];
  products: Ref[];
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState<AdminState | null, FormData>(
    saveDiscountAction.bind(null, discount?.id ?? null),
    null,
  );

  const [type, setType] = useState(discount?.type ?? "PERCENTAGE");
  const [scope, setScope] = useState(discount?.scope ?? "ENTIRE_ORDER");

  return (
    <Card className="p-5">
      <h2 className="mb-4 font-display text-xl">
        {discount ? `Edit ${discount.code}` : "New discount code"}
      </h2>

      <form action={action} className="flex flex-col gap-4">
        {state?.message ? (
          <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Code" htmlFor="code" required hint="Shoppers type this at checkout.">
            <input
              id="code"
              name="code"
              required
              defaultValue={discount?.code}
              placeholder="EASTER25"
              className="lx-field font-mono uppercase"
            />
          </Field>

          <Field label="Description" htmlFor="description" hint="Internal, and shown in the bag.">
            <input
              id="description"
              name="description"
              defaultValue={discount?.description ?? ""}
              placeholder="25% off for Easter"
              className="lx-field"
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Type" htmlFor="type">
            <select
              id="type"
              name="type"
              value={type}
              onChange={(event) => setType(event.target.value as DiscountRow["type"])}
              className="lx-field"
            >
              <option value="PERCENTAGE">Percentage off</option>
              <option value="FIXED_AMOUNT">Fixed amount off</option>
              <option value="FREE_SHIPPING">Free delivery</option>
            </select>
          </Field>

          {type !== "FREE_SHIPPING" ? (
            <Field
              label={type === "PERCENTAGE" ? "Percent" : "Amount (GHS)"}
              htmlFor="value"
              required
            >
              <input
                id="value"
                name="value"
                type="number"
                step={type === "PERCENTAGE" ? "1" : "0.01"}
                min="0"
                max={type === "PERCENTAGE" ? "100" : undefined}
                required
                defaultValue={
                  discount
                    ? type === "FIXED_AMOUNT"
                      ? toMajorUnits(discount.value)
                      : discount.value
                    : ""
                }
                className="lx-field"
              />
            </Field>
          ) : null}

          <Field label="Applies to" htmlFor="scope">
            <select
              id="scope"
              name="scope"
              value={scope}
              onChange={(event) => setScope(event.target.value as DiscountRow["scope"])}
              className="lx-field"
            >
              <option value="ENTIRE_ORDER">Whole order</option>
              <option value="SPECIFIC_PRODUCTS">Selected products</option>
              <option value="SPECIFIC_CATEGORIES">Selected categories</option>
            </select>
          </Field>
        </div>

        {scope === "SPECIFIC_CATEGORIES" ? (
          <fieldset>
            <legend className="lx-eyebrow mb-2">Categories</legend>
            <div className="flex flex-wrap gap-3">
              {categories.map((c) => (
                <label key={c.id} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    name="categoryIds"
                    value={c.id}
                    defaultChecked={discount?.categoryIds.includes(c.id)}
                    className="accent-[var(--accent)]"
                  />
                  {c.name}
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}

        {scope === "SPECIFIC_PRODUCTS" ? (
          <fieldset>
            <legend className="lx-eyebrow mb-2">Products</legend>
            <div className="grid max-h-48 gap-1.5 overflow-y-auto rounded-[--radius-card] border border-[var(--border-subtle)] p-3 sm:grid-cols-2">
              {products.map((p) => (
                <label key={p.id} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    name="productIds"
                    value={p.id}
                    defaultChecked={discount?.productIds.includes(p.id)}
                    className="accent-[var(--accent)]"
                  />
                  <span className="truncate">{p.title}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Min bag value (GHS)" htmlFor="minSubtotal">
            <input
              id="minSubtotal"
              name="minSubtotal"
              type="number"
              step="0.01"
              min="0"
              defaultValue={discount?.minSubtotal ? toMajorUnits(discount.minSubtotal) : ""}
              className="lx-field"
            />
          </Field>

          <Field label="Min items" htmlFor="minQuantity">
            <input
              id="minQuantity"
              name="minQuantity"
              type="number"
              min="0"
              defaultValue={discount?.minQuantity ?? ""}
              className="lx-field"
            />
          </Field>

          <Field label="Total uses" htmlFor="usageLimit" hint="Blank = unlimited">
            <input
              id="usageLimit"
              name="usageLimit"
              type="number"
              min="0"
              defaultValue={discount?.usageLimit ?? ""}
              className="lx-field"
            />
          </Field>

          <Field label="Uses per customer" htmlFor="usageLimitPerUser">
            <input
              id="usageLimitPerUser"
              name="usageLimitPerUser"
              type="number"
              min="0"
              defaultValue={discount?.usageLimitPerUser ?? ""}
              className="lx-field"
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Starts" htmlFor="startsAt">
            <input
              id="startsAt"
              name="startsAt"
              type="date"
              defaultValue={discount?.startsAt?.slice(0, 10) ?? ""}
              className="lx-field"
            />
          </Field>

          <Field label="Ends" htmlFor="endsAt">
            <input
              id="endsAt"
              name="endsAt"
              type="date"
              defaultValue={discount?.endsAt?.slice(0, 10) ?? ""}
              className="lx-field"
            />
          </Field>
        </div>

        <div className="flex flex-wrap gap-5">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="firstOrderOnly"
              defaultChecked={discount?.firstOrderOnly}
              className="accent-[var(--accent)]"
            />
            First order only
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="isActive"
              defaultChecked={discount?.isActive ?? true}
              className="accent-[var(--accent)]"
            />
            Active
          </label>
        </div>

        <div className="flex gap-2 border-t border-[var(--border-subtle)] pt-4">
          <button
            type="submit"
            disabled={pending}
            className="flex items-center gap-2 rounded-[--radius-card] bg-[var(--accent)] px-5 py-2.5 text-sm text-[var(--accent-contrast)] disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {discount ? "Save changes" : "Create code"}
          </button>

          <button
            type="button"
            onClick={onDone}
            className="rounded-[--radius-card] border border-[var(--border-subtle)] px-4 py-2.5 text-sm"
          >
            {state?.ok ? "Close" : "Cancel"}
          </button>
        </div>
      </form>
    </Card>
  );
}
