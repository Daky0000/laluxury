import type { Metadata } from "next";
import Link from "next/link";
import { Search, AlertTriangle } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/auth/rbac";
import { availableOf } from "@/lib/inventory";
import { formatDate } from "@/lib/utils";
import { Card, Badge, EmptyState, SectionHeading, Stat } from "@/components/ui";
import { StockRow } from "@/components/admin/stock-row";
import type { Prisma } from "@/generated/prisma";

export const metadata: Metadata = { title: "Inventory" };

export default async function AdminInventoryPage({ searchParams }: PageProps<"/admin/inventory">) {
  const user = await requirePermission("inventory:read");
  const params = await searchParams;

  const q = typeof params.q === "string" ? params.q : "";
  const filter = typeof params.filter === "string" ? params.filter : "";

  const where: Prisma.VariantWhereInput = {
    ...(q
      ? {
          OR: [
            { sku: { contains: q, mode: "insensitive" } },
            { product: { title: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const [variants, movements, totals] = await Promise.all([
    db.variant.findMany({
      where,
      include: {
        inventory: true,
        product: { select: { id: true, title: true, status: true } },
      },
      orderBy: [{ product: { title: "asc" } }, { position: "asc" }],
      take: 200,
    }),
    db.inventoryMovement.findMany({
      orderBy: { createdAt: "desc" },
      take: 15,
      include: {
        inventoryItem: {
          include: { variant: { select: { sku: true, title: true } } },
        },
      },
    }),
    db.inventoryItem.aggregate({ _sum: { onHand: true, reserved: true } }),
  ]);

  // Filtering on the derived "available" figure is easier in memory than SQL.
  const rows = variants.filter((v) => {
    if (!filter) return true;
    const available = v.inventory ? availableOf(v.inventory) : 0;
    if (filter === "low") return available <= (v.inventory?.reorderPoint ?? 0) && available > 0;
    if (filter === "out") return available <= 0;
    return true;
  });

  const outOfStock = variants.filter((v) => v.inventory && availableOf(v.inventory) <= 0).length;
  const lowStock = variants.filter(
    (v) => v.inventory && availableOf(v.inventory) > 0 && availableOf(v.inventory) <= v.inventory.reorderPoint,
  ).length;

  const canWrite = can(user.role, "inventory:write");

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading
        title="Inventory"
        description="Available is on-hand minus units reserved for unshipped orders. Every change is written to the stock ledger."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Units on hand" value={String(totals._sum.onHand ?? 0)} />
        <Stat
          label="Reserved"
          value={String(totals._sum.reserved ?? 0)}
          hint="held for open orders"
        />
        <Stat
          label="Needs attention"
          value={String(outOfStock + lowStock)}
          hint={`${outOfStock} out, ${lowStock} low`}
        />
      </div>

      <Card className="p-4">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <div className="min-w-48 flex-1">
            <label htmlFor="q" className="lx-eyebrow mb-1.5 block">
              Search
            </label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
                aria-hidden
              />
              <input id="q" name="q" defaultValue={q} placeholder="SKU or product" className="lx-field pl-9" />
            </div>
          </div>

          <div>
            <label htmlFor="filter" className="lx-eyebrow mb-1.5 block">
              Show
            </label>
            <select id="filter" name="filter" defaultValue={filter} className="lx-field w-40">
              <option value="">Everything</option>
              <option value="low">Low stock</option>
              <option value="out">Out of stock</option>
            </select>
          </div>

          <button
            type="submit"
            className="rounded-[--radius-card] bg-[var(--accent)] px-4 py-2.5 text-sm text-[var(--accent-contrast)]"
          >
            Filter
          </button>

          {q || filter ? (
            <Link href="/admin/inventory" className="px-2 py-2.5 text-sm underline-offset-4 hover:underline">
              Reset
            </Link>
          ) : null}
        </form>
      </Card>

      {rows.length === 0 ? (
        <EmptyState title="Nothing to show" description="Try clearing the filters." />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--border-subtle)] bg-[var(--surface-sunken)] text-left">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Product</th>
                  <th className="px-3 py-2.5 font-medium">SKU</th>
                  <th className="px-3 py-2.5 font-medium">On hand</th>
                  <th className="px-3 py-2.5 font-medium">Reserved</th>
                  <th className="px-3 py-2.5 font-medium">Available</th>
                  <th className="px-3 py-2.5 font-medium">Reorder at</th>
                  {canWrite ? <th className="px-3 py-2.5 font-medium">Adjust</th> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {rows.map((variant) => (
                  <StockRow
                    key={variant.id}
                    variantId={variant.id}
                    productId={variant.product.id}
                    productTitle={variant.product.title}
                    variantTitle={variant.title}
                    sku={variant.sku}
                    onHand={variant.inventory?.onHand ?? 0}
                    reserved={variant.inventory?.reserved ?? 0}
                    reorderPoint={variant.inventory?.reorderPoint ?? 0}
                    trackInventory={variant.inventory?.trackInventory ?? true}
                    canWrite={canWrite}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card className="p-5">
        <h2 className="lx-eyebrow mb-4">Recent stock movements</h2>
        {movements.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">No movements recorded yet.</p>
        ) : (
          <ul className="divide-y divide-[var(--border-subtle)]">
            {movements.map((movement) => (
              <li key={movement.id} className="flex items-center gap-3 py-2.5 text-sm">
                <Badge
                  tone={
                    movement.type === "SALE" || movement.type === "DAMAGE"
                      ? "danger"
                      : movement.type === "RESTOCK" || movement.type === "RETURN"
                        ? "success"
                        : "neutral"
                  }
                >
                  {movement.type.toLowerCase()}
                </Badge>

                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-xs">
                    {movement.inventoryItem.variant.sku}
                  </span>
                  {movement.reason ? (
                    <span className="block truncate text-xs text-[var(--text-muted)]">
                      {movement.reason}
                    </span>
                  ) : null}
                </span>

                <span
                  className={`tabular-nums ${movement.quantity < 0 ? "text-danger" : "text-success"}`}
                >
                  {movement.quantity > 0 ? "+" : ""}
                  {movement.quantity}
                </span>

                <span className="w-14 text-right text-xs tabular-nums text-[var(--text-muted)]">
                  → {movement.onHandAfter}
                </span>

                <span className="hidden w-28 text-right text-xs text-[var(--text-muted)] sm:block">
                  {formatDate(movement.createdAt, true)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {variants.length >= 200 ? (
        <p className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
          Showing the first 200 variants. Narrow the search to see more.
        </p>
      ) : null}
    </div>
  );
}
