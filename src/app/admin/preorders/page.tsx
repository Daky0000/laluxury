import type { Metadata } from "next";
import Link from "next/link";
import { Clock, ExternalLink, PackagePlus, Sparkles } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { formatMoney, toMajorUnits } from "@/lib/money";
import { formatPhone } from "@/lib/phone";
import { formatDate } from "@/lib/utils";
import { Badge, Card } from "@/components/ui";
import {
  updatePreorderRequestAction,
  updateOrderPreorderMilestoneAction,
  convertPreorderRequestToQuoteOrderAction,
} from "@/app/actions/admin/preorders";

export const metadata: Metadata = { title: "Pre-orders & Sourcing" };
export const dynamic = "force-dynamic";

const REQUEST_STATUS_TONES: Record<
  string,
  "accent" | "warning" | "success" | "neutral" | "danger"
> = {
  NEW: "accent",
  QUOTED: "warning",
  SOURCING: "warning",
  ARRIVED: "success",
  COMPLETED: "success",
  CANCELLED: "neutral",
};

const MILESTONE_OPTIONS = [
  { id: "DEPOSIT_CONFIRMED", label: "1. Deposit & Spec Confirmed" },
  { id: "IN_PRODUCTION", label: "2. Workshop Production" },
  { id: "QUALITY_INSPECTION", label: "3. Quality Inspection & Crating" },
  { id: "IN_TRANSIT", label: "4. In Transit / Port Clearance" },
  { id: "READY_FOR_DELIVERY", label: "5. White-Glove Delivery (Accra)" },
];

export default async function AdminPreordersPage() {
  await requirePermission("orders:read");

  const [preorderOrders, requests, preorderProducts, tradeApps] = await Promise.all([
    db.order.findMany({
      where: {
        OR: [{ hasPreorderItems: true }, { items: { some: { isPreorder: true } } }],
      },
      include: {
        items: true,
        shippingAddress: true,
      },
      orderBy: { placedAt: "desc" },
      take: 50,
    }),
    db.preorderRequest.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    db.product.findMany({
      where: { isPreorder: true },
      include: {
        variants: { include: { inventory: true } },
        images: { orderBy: { position: "asc" }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.tradeApplication.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  const totalPreorderValue = preorderOrders
    .filter((o) => o.status !== "CANCELLED")
    .reduce((sum, o) => sum + o.total, 0);

  const openRequestsCount = requests.filter((r) =>
    ["NEW", "QUOTED", "SOURCING"].includes(r.status),
  ).length;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="lx-eyebrow">Concierge &amp; Bespoke Pipeline</p>
          <h1 className="mt-1 text-2xl md:text-3xl">Pre-orders, Sourcing &amp; Trade</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/pre-order"
            target="_blank"
            className="inline-flex items-center gap-1.5 rounded-(--radius-card) border border-[var(--border-subtle)] px-4 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            View Storefront Hub
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </Link>
          <Link
            href="/admin/products/new"
            className="inline-flex items-center gap-2 rounded-(--radius-card) bg-[var(--accent)] px-4 py-2 text-sm text-[var(--accent-contrast)]"
          >
            <PackagePlus className="h-4 w-4" aria-hidden />
            Add Pre-Order Piece
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-5">
          <p className="lx-eyebrow">Pre-Order Orders</p>
          <p className="mt-2 font-display text-3xl tabular-nums">{preorderOrders.length}</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Customer orders containing pre-order items
          </p>
        </Card>

        <Card className="p-5">
          <p className="lx-eyebrow">Pre-Order Pipeline Value</p>
          <p className="mt-2 font-display text-3xl tabular-nums">
            {formatMoney(totalPreorderValue)}
          </p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Gross value across active pre-order reservations
          </p>
        </Card>

        <Card className="p-5">
          <p className="lx-eyebrow">Custom Sourcing Inquiries</p>
          <p className="mt-2 font-display text-3xl tabular-nums">{openRequestsCount}</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            {requests.length} total requests submitted
          </p>
        </Card>

        <Card className="p-5">
          <p className="lx-eyebrow">Trade Partners &amp; SKUs</p>
          <p className="mt-2 font-display text-3xl tabular-nums">
            {preorderProducts.length} SKUs · {tradeApps.length} Trade
          </p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Live made-to-order pieces &amp; trade accounts
          </p>
        </Card>
      </div>

      {/* Section 1: Customer Pre-Order Checkout Reservations + Milestone Controls */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] px-6 py-4">
          <div>
            <h2 className="text-lg font-medium">Pre-Order Checkout Reservations &amp; Milestones</h2>
            <p className="text-xs text-[var(--text-secondary)]">
              Update the 5-stage workshop &amp; transit milestone for any pre-order to notify the
              customer on their live tracking page.
            </p>
          </div>
        </div>

        {preorderOrders.length === 0 ? (
          <div className="p-8 text-center text-sm text-[var(--text-muted)]">
            No pre-order checkout reservations yet. When a customer orders a Pre-Order piece at
            checkout, it will appear here automatically.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-[var(--border-subtle)] bg-[var(--surface-sunken)] text-xs uppercase tracking-[0.12em] text-[var(--text-muted)]">
                <tr>
                  <th className="px-6 py-3.5">Order &amp; Docs</th>
                  <th className="px-6 py-3.5">Customer</th>
                  <th className="px-6 py-3.5">Pieces &amp; Deposit</th>
                  <th className="px-6 py-3.5">5-Stage Milestone Updater</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {preorderOrders.map((order) => {
                  const preorderItems = order.items.filter((i) => i.isPreorder);
                  return (
                    <tr key={order.id} className="hover:bg-[var(--surface-sunken)]/50">
                      <td className="px-6 py-4">
                        <Link
                          href={`/admin/orders/${order.id}`}
                          className="font-mono text-sm font-semibold text-[var(--accent)] hover:underline"
                        >
                          {order.orderNumber}
                        </Link>
                        <div className="mt-1 flex flex-wrap gap-2 text-[11px]">
                          <Link
                            href={`/orders/${order.orderNumber}/invoice?type=invoice`}
                            target="_blank"
                            className="text-[var(--text-secondary)] underline hover:text-[var(--text-primary)]"
                          >
                            Invoice PDF
                          </Link>
                          <Link
                            href={`/orders/${order.orderNumber}/invoice?type=waybill`}
                            target="_blank"
                            className="text-[var(--text-secondary)] underline hover:text-[var(--text-primary)]"
                          >
                            Waybill PDF
                          </Link>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-medium">
                          {order.shippingAddress
                            ? `${order.shippingAddress.firstName} ${order.shippingAddress.lastName}`
                            : order.email}
                        </div>
                        <div className="text-xs text-[var(--text-muted)]">
                          {order.phone ? formatPhone(order.phone) : order.email}
                        </div>
                        <div className="mt-1 text-xs text-[var(--text-muted)]">
                          {formatDate(order.placedAt)}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <ul className="space-y-1">
                          {(preorderItems.length > 0 ? preorderItems : order.items).map((item) => (
                            <li key={item.id} className="flex items-center gap-2 text-xs">
                              <span className="font-medium">
                                {item.quantity}× {item.productTitle}
                              </span>
                              {item.preorderLeadTime ? (
                                <Badge tone="accent">{item.preorderLeadTime}</Badge>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                        <div className="mt-2 tabular-nums text-xs">
                          <strong>Total: {formatMoney(order.total)}</strong>
                          {order.depositAmount ? (
                            <span className="ml-2 text-[var(--accent)]">
                              (50% Deposit: {formatMoney(order.depositAmount)}
                              {order.balancePaidAt ? " · Balance Paid" : " · Balance Due"})
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <form
                          action={updateOrderPreorderMilestoneAction}
                          className="flex flex-wrap items-center gap-2"
                        >
                          <input type="hidden" name="orderId" value={order.id} />
                          <select
                            name="preorderStage"
                            defaultValue={order.preorderStage}
                            className="lx-field w-52 py-1.5 text-xs"
                          >
                            {MILESTONE_OPTIONS.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.label}
                              </option>
                            ))}
                          </select>
                          <input
                            type="text"
                            name="preorderNote"
                            defaultValue={order.preorderNote ?? ""}
                            placeholder="Concierge status note for client…"
                            className="lx-field w-52 py-1.5 text-xs"
                          />
                          <button
                            type="submit"
                            className="rounded-(--radius-card) bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-[var(--accent-contrast)]"
                          >
                            Save Stage
                          </button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Section 2: Custom Sourcing & Bespoke Pre-Order Requests */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] px-6 py-4">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-medium">
              <Sparkles className="h-4 w-4 text-[var(--accent)]" aria-hidden />
              Custom Sourcing, Swatch Requests &amp; 1-Click Quote Generator
            </h2>
            <p className="text-xs text-[var(--text-secondary)]">
              Requests from customers asking us to source or custom-order specific pieces, upload
              reference photos, or deliver physical swatches in Accra.
            </p>
          </div>
        </div>

        {requests.length === 0 ? (
          <div className="p-8 text-center text-sm text-[var(--text-muted)]">
            No custom sourcing requests yet. Customers can submit requests on the{" "}
            <Link href="/pre-order" className="text-[var(--accent)] underline">
              /pre-order
            </Link>{" "}
            page or any Pre-Order product page.
          </div>
        ) : (
          <div className="divide-y divide-[var(--border-subtle)]">
            {requests.map((req) => (
              <div key={req.id} className="grid gap-4 p-6 lg:grid-cols-[1.2fr_1fr]">
                <div>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <Badge tone={REQUEST_STATUS_TONES[req.status] ?? "neutral"}>
                      {req.status}
                    </Badge>
                    <h3 className="text-base font-medium">
                      {req.productTitle}
                      {req.variantTitle ? ` (${req.variantTitle})` : ""}{" "}
                      <span className="text-xs text-[var(--text-muted)]">× {req.quantity}</span>
                    </h3>
                    <span className="text-xs text-[var(--text-muted)]">
                      · {formatDate(req.createdAt)}
                    </span>
                  </div>

                  <p className="mt-2 text-sm text-[var(--text-secondary)]">
                    <strong>Customer:</strong> {req.name} ·{" "}
                    <a href={`tel:${req.phone}`} className="text-[var(--accent)] hover:underline">
                      {formatPhone(req.phone)}
                    </a>
                    {req.email ? ` · ${req.email}` : ""}
                  </p>

                  {req.swatchRequest ? (
                    <p className="mt-1.5 text-xs font-medium text-[#8C6528]">
                      Swatches Requested: {req.swatchRequest}
                    </p>
                  ) : null}

                  {req.imageUrl ? (
                    <div className="mt-2 flex items-center gap-3">
                      <a
                        href={req.imageUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--accent)] underline"
                      >
                        View Uploaded Customer Inspiration Photo ↗
                      </a>
                    </div>
                  ) : null}

                  {req.notes ? (
                    <p className="mt-2.5 rounded border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-3 text-sm leading-relaxed">
                      {req.notes}
                    </p>
                  ) : null}

                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    {req.convertedOrderId ? (
                      <Link
                        href={`/orders/${req.convertedOrderId}/invoice`}
                        target="_blank"
                        className="inline-flex items-center gap-1.5 border border-sage-600/40 bg-sage-600/10 px-3 py-1.5 text-xs font-medium text-sage-600"
                      >
                        ✓ Quote Order {req.convertedOrderId} Created · View Pro-Forma Invoice ↗
                      </Link>
                    ) : (
                      <form action={convertPreorderRequestToQuoteOrderAction}>
                        <input type="hidden" name="requestId" value={req.id} />
                        <button
                          type="submit"
                          className="inline-flex items-center gap-1.5 border border-[var(--accent)] bg-[var(--accent)]/10 px-3 py-1.5 text-xs font-medium text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white"
                        >
                          Generate 1-Click Pro-Forma Quote Order →
                        </button>
                      </form>
                    )}

                    <a
                      href={`https://wa.me/${req.phone}?text=${encodeURIComponent(
                        `Hello ${req.name}, this is LaLuxury Concierge regarding your pre-order inquiry for "${req.productTitle}".${req.convertedOrderId ? ` Your official Pro-Forma Invoice & 50% deposit reservation is ready under reference ${req.convertedOrderId}.` : ""}`,
                      )}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-medium text-sage-600 hover:underline"
                    >
                      Message Client on WhatsApp ↗
                    </a>
                  </div>
                </div>

                <form
                  action={updatePreorderRequestAction}
                  className="grid gap-3 sm:grid-cols-2 lg:items-end"
                >
                  <input type="hidden" name="id" value={req.id} />
                  <div>
                    <label className="mb-1 block text-xs uppercase tracking-[0.12em] text-[var(--text-muted)]">
                      Status
                    </label>
                    <select
                      name="status"
                      defaultValue={req.status}
                      className="lx-field py-2 text-xs"
                    >
                      <option value="NEW">NEW</option>
                      <option value="QUOTED">QUOTED</option>
                      <option value="SOURCING">SOURCING</option>
                      <option value="ARRIVED">ARRIVED IN GHANA</option>
                      <option value="COMPLETED">COMPLETED</option>
                      <option value="CANCELLED">CANCELLED</option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs uppercase tracking-[0.12em] text-[var(--text-muted)]">
                      Quoted Unit Price (GHS)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      name="targetBudget"
                      defaultValue={req.targetBudget ? toMajorUnits(req.targetBudget) : ""}
                      placeholder="e.g. 8500"
                      className="lx-field py-2 text-xs"
                    />
                  </div>

                  <div>
                    <input
                      type="text"
                      name="staffNote"
                      defaultValue={req.staffNote ?? ""}
                      placeholder="Internal concierge / supplier note…"
                      className="lx-field py-2 text-xs"
                    />
                  </div>

                  <button
                    type="submit"
                    className="rounded-(--radius-card) bg-[var(--accent)] px-4 py-2 text-xs font-medium text-[var(--accent-contrast)]"
                  >
                    Update Request
                  </button>
                </form>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Section 3: Pre-Order Catalog Pieces */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] px-6 py-4">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-medium">
              <Clock className="h-4 w-4 text-[var(--accent)]" aria-hidden />
              Pre-Order Catalog Pieces ({preorderProducts.length})
            </h2>
            <p className="text-xs text-[var(--text-secondary)]">
              Products currently listed in the Pre-Order category with backorder reservation enabled.
            </p>
          </div>
        </div>

        <div className="grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-4">
          {preorderProducts.map((p) => (
            <div
              key={p.id}
              className="flex flex-col justify-between rounded-(--radius-card) border border-[var(--border-subtle)] p-4"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <Badge tone="accent">{p.preorderLeadTime ?? "4–6 weeks"}</Badge>
                  <span className="text-xs text-[var(--text-muted)]">
                    {p.preorderDepositPercent ?? 50}% deposit
                  </span>
                </div>
                <h3 className="mt-2.5 font-medium">{p.title}</h3>
                <p className="mt-1 text-sm tabular-nums text-[var(--text-secondary)]">
                  {formatMoney(p.minPrice)}
                </p>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-[var(--border-subtle)] pt-3 text-xs">
                <Link
                  href={`/admin/products/${p.id}`}
                  className="font-medium text-[var(--accent)] hover:underline"
                >
                  Edit settings →
                </Link>
                <Link
                  href={`/product/${p.slug}`}
                  target="_blank"
                  className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                >
                  Storefront ↗
                </Link>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Section 4: Trade Program Partners (/trade) */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] px-6 py-4">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-medium">
              <Sparkles className="h-4 w-4 text-[var(--accent)]" aria-hidden />
              Trade Program &amp; Interior Designer Partners ({tradeApps.length})
            </h2>
            <p className="text-xs text-[var(--text-secondary)]">
              Accredited interior designers, architects, and hospitality firms registered via{" "}
              <Link href="/trade" target="_blank" className="text-[var(--accent)] underline">
                /trade
              </Link>{" "}
              with active 12% trade privilege codes.
            </p>
          </div>
        </div>

        {tradeApps.length === 0 ? (
          <div className="p-8 text-center text-sm text-[var(--text-muted)]">
            No Trade Program partners registered yet. Share{" "}
            <Link href="/trade" target="_blank" className="text-[var(--accent)] underline">
              /trade
            </Link>{" "}
            with architects and interior designers to issue instant 12% trade privilege codes.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-[var(--border-subtle)] bg-[var(--surface-sunken)] text-xs uppercase tracking-[0.12em] text-[var(--text-muted)]">
                <tr>
                  <th className="px-6 py-3">Partner &amp; Studio</th>
                  <th className="px-6 py-3">Discipline</th>
                  <th className="px-6 py-3">Contact</th>
                  <th className="px-6 py-3">Active Trade Code</th>
                  <th className="px-6 py-3">Scope / Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {tradeApps.map((partner) => (
                  <tr key={partner.id}>
                    <td className="px-6 py-4">
                      <div className="font-medium">{partner.company}</div>
                      <div className="text-xs text-[var(--text-muted)]">{partner.name}</div>
                    </td>
                    <td className="px-6 py-4 text-xs">{partner.role}</td>
                    <td className="px-6 py-4 text-xs">
                      <div>{partner.email}</div>
                      <div className="text-[var(--text-muted)]">{formatPhone(partner.phone)}</div>
                    </td>
                    <td className="px-6 py-4">
                      <Badge tone="success">
                        {partner.discountCode ?? "TRADE"} ({partner.discountPercent}% OFF)
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-xs text-[var(--text-secondary)]">
                      {partner.projectScope ?? partner.portfolioUrl ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
