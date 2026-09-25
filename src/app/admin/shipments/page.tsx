import type { Metadata } from "next";
import Link from "next/link";
import { Ship, PackageCheck, Plus, RefreshCw } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/utils";
import { Card, Badge, SectionHeading } from "@/components/ui";
import {
  getContainerManifests,
  createContainerManifestAction,
  assignOrderToContainerAction,
  cascadeContainerStageAction,
} from "@/app/actions/admin/shipments";

export const metadata: Metadata = { title: "Container & Freight Shipments" };
export const dynamic = "force-dynamic";

const STAGES = [
  { id: "DEPOSIT_CONFIRMED", label: "1. Deposit & Spec Confirmed" },
  { id: "IN_PRODUCTION", label: "2. Workshop Production" },
  { id: "QUALITY_INSPECTION", label: "3. Quality Inspection & Crating" },
  { id: "IN_TRANSIT", label: "4. In Transit / Tema Port Clearance" },
  { id: "READY_FOR_DELIVERY", label: "5. White-Glove Delivery (Accra)" },
];

export default async function AdminShipmentsPage() {
  await requirePermission("orders:read");

  const [manifests, preorderOrders] = await Promise.all([
    getContainerManifests(),
    db.order.findMany({
      where: {
        OR: [{ hasPreorderItems: true }, { trackingNumber: { not: null } }],
      },
      include: {
        shippingAddress: true,
        items: true,
      },
      orderBy: { placedAt: "desc" },
      take: 60,
    }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading
        title="Supplier & Container Shipment Tracker"
        description="Group multiple Pre-Order commissions into Sea or Air Freight Containers. Advancing a container's milestone automatically updates every customer order and live tracker inside that container."
      />

      {/* Top Row: Create New Container + Assign Orders */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Create New Container Manifest */}
        <Card className="p-6">
          <div className="flex items-center gap-2">
            <Plus className="h-4 w-4 text-[var(--accent)]" />
            <h2 className="text-base font-medium">Create New Container / Airway Manifest</h2>
          </div>
          <form action={createContainerManifestAction} className="mt-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs text-[var(--text-secondary)]">
                  Manifest / Container Code *
                </label>
                <input
                  name="code"
                  required
                  placeholder="e.g. CONT-IT-ACC-03"
                  className="lx-field mt-1 w-full py-2 text-xs uppercase"
                />
              </div>
              <div>
                <label className="block text-xs text-[var(--text-secondary)]">
                  Carrier / Vessel
                </label>
                <input
                  name="carrier"
                  placeholder="e.g. Maersk Line / DHL Global"
                  className="lx-field mt-1 w-full py-2 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs text-[var(--text-secondary)]">
                  Atelier Origin → Port
                </label>
                <input
                  name="origin"
                  placeholder="e.g. Milan → Tema Port"
                  className="lx-field mt-1 w-full py-2 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs text-[var(--text-secondary)]">
                  Estimated Arrival (ETA)
                </label>
                <input
                  type="date"
                  name="eta"
                  className="lx-field mt-1 w-full py-2 text-xs"
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs text-[var(--text-secondary)]">Initial Stage</label>
                <select name="stage" defaultValue="IN_PRODUCTION" className="lx-field mt-1 w-full py-2 text-xs">
                  {STAGES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-[var(--text-secondary)]">
                  Client-Facing Status Note
                </label>
                <input
                  name="note"
                  placeholder="e.g. Container sealed in Milan; departing Genoa."
                  className="lx-field mt-1 w-full py-2 text-xs"
                />
              </div>
            </div>

            <button
              type="submit"
              className="rounded-(--radius-card) bg-[var(--accent)] px-4 py-2 text-xs font-medium text-[var(--accent-contrast)]"
            >
              Register Container Manifest
            </button>
          </form>
        </Card>

        {/* Assign Pre-Order to Container */}
        <Card className="p-6">
          <div className="flex items-center gap-2">
            <PackageCheck className="h-4 w-4 text-[var(--accent)]" />
            <h2 className="text-base font-medium">Assign Customer Pre-Order to Container</h2>
          </div>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            Link any customer Pre-Order (`LX-XXXX`) to a container manifest so all future stage updates sync automatically.
          </p>

          <form action={assignOrderToContainerAction} className="mt-4 space-y-3">
            <div>
              <label className="block text-xs text-[var(--text-secondary)]">
                Select Customer Order
              </label>
              <select name="orderId" required className="lx-field mt-1 w-full py-2 text-xs">
                {preorderOrders.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.orderNumber} —{" "}
                    {o.shippingAddress
                      ? `${o.shippingAddress.firstName} ${o.shippingAddress.lastName}`
                      : o.email}{" "}
                    ({formatMoney(o.total)})
                    {o.trackingNumber ? ` [Currently: ${o.trackingNumber}]` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-[var(--text-secondary)]">
                Target Container / Airway Manifest
              </label>
              <select name="containerCode" required className="lx-field mt-1 w-full py-2 text-xs">
                {manifests.map((m) => (
                  <option key={m.code} value={m.code}>
                    {m.code} — {m.origin} (ETA: {m.eta})
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              className="rounded-(--radius-card) bg-[var(--accent)] px-4 py-2 text-xs font-medium text-[var(--accent-contrast)]"
            >
              Link Order to Container
            </button>
          </form>
        </Card>
      </div>

      {/* Active Containers & 1-Click Stage Cascade */}
      <div className="space-y-4">
        <h2 className="text-lg font-medium">
          Active Freight Containers ({manifests.length})
        </h2>

        {manifests.map((manifest) => {
          const assignedOrders = preorderOrders.filter(
            (o) => o.trackingNumber?.toUpperCase() === manifest.code.toUpperCase(),
          );
          const containerValue = assignedOrders.reduce((s, o) => s + o.total, 0);

          return (
            <Card key={manifest.code} className="overflow-hidden">
              <div className="grid gap-6 border-b border-[var(--border-subtle)] bg-[var(--surface-sunken)]/50 p-6 lg:grid-cols-[1.2fr_1.3fr]">
                <div>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <Ship className="h-4 w-4 text-[var(--accent)]" />
                    <span className="font-mono text-base font-bold">{manifest.code}</span>
                    <Badge tone="accent">
                      {STAGES.find((s) => s.id === manifest.stage)?.label ?? manifest.stage}
                    </Badge>
                    <Badge tone="neutral">{assignedOrders.length} orders linked</Badge>
                  </div>
                  <p className="mt-2 text-sm font-medium">{manifest.origin}</p>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Carrier: {manifest.carrier} · ETA: <strong>{manifest.eta}</strong> · Cargo Value:{" "}
                    <strong>{formatMoney(containerValue)}</strong>
                  </p>
                  <p className="mt-2 text-xs italic text-[var(--text-secondary)]">
                    “{manifest.note}”
                  </p>
                </div>

                {/* 1-Click Cascade Form */}
                <form action={cascadeContainerStageAction} className="space-y-2.5">
                  <input type="hidden" name="code" value={manifest.code} />
                  <p className="text-xs font-semibold uppercase tracking-wider text-[var(--accent)]">
                    1-Click Cascade Update ({assignedOrders.length} Client Orders)
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <select
                      name="stage"
                      defaultValue={manifest.stage}
                      className="lx-field py-1.5 text-xs"
                    >
                      {STAGES.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      name="eta"
                      defaultValue={manifest.eta}
                      placeholder="Updated ETA"
                      className="lx-field py-1.5 text-xs"
                    />
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      name="note"
                      defaultValue={manifest.note}
                      placeholder="Broadcast status note to all orders in this container…"
                      className="lx-field flex-1 py-1.5 text-xs"
                    />
                    <button
                      type="submit"
                      className="inline-flex items-center gap-1.5 rounded-(--radius-card) bg-[var(--accent)] px-3.5 py-1.5 text-xs font-medium text-[var(--accent-contrast)]"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Cascade Stage
                    </button>
                  </div>
                </form>
              </div>

              {assignedOrders.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-[var(--border-subtle)] text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                      <tr>
                        <th className="px-6 py-2.5">Order #</th>
                        <th className="px-6 py-2.5">Client</th>
                        <th className="px-6 py-2.5">Pieces</th>
                        <th className="px-6 py-2.5">Total / Balance</th>
                        <th className="px-6 py-2.5">Placed</th>
                        <th className="px-6 py-2.5 text-right">Documents</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-subtle)]">
                      {assignedOrders.map((o) => {
                        const unpaidBalance =
                          o.depositAmount && !o.balancePaidAt ? o.total - o.depositAmount : 0;
                        return (
                          <tr key={o.id}>
                            <td className="px-6 py-2.5 font-mono font-semibold">
                              <Link
                                href={`/admin/orders/${o.id}`}
                                className="text-[var(--accent)] hover:underline"
                              >
                                {o.orderNumber}
                              </Link>
                            </td>
                            <td className="px-6 py-2.5">
                              {o.shippingAddress
                                ? `${o.shippingAddress.firstName} ${o.shippingAddress.lastName}`
                                : o.email}
                            </td>
                            <td className="px-6 py-2.5">
                              {o.items.map((i) => `${i.productTitle} (×${i.quantity})`).join(", ")}
                            </td>
                            <td className="px-6 py-2.5 tabular-nums">
                              {formatMoney(o.total)}
                              {unpaidBalance > 0 ? (
                                <span className="ml-1.5 text-amber-600">
                                  ({formatMoney(unpaidBalance)} due on arrival)
                                </span>
                              ) : null}
                            </td>
                            <td className="px-6 py-2.5 text-[var(--text-muted)]">
                              {formatDate(o.placedAt)}
                            </td>
                            <td className="px-6 py-2.5 text-right">
                              <Link
                                href={`/orders/${o.orderNumber}/invoice?type=waybill`}
                                target="_blank"
                                className="text-[var(--accent)] hover:underline"
                              >
                                Print Waybill ↗
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
