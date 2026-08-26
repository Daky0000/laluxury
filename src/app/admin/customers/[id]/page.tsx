import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Mail, Phone } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/auth/rbac";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/utils";
import { ORDER_STATUS_LABELS } from "@/lib/constants";
import { Card, Badge, Stat, EmptyState } from "@/components/ui";
import { CustomerPanel } from "@/components/admin/customer-panel";

export const metadata: Metadata = { title: "Customer" };

export default async function AdminCustomerPage({ params }: PageProps<"/admin/customers/[id]">) {
  const staff = await requirePermission("customers:read");
  const { id } = await params;

  const [customer, allTags] = await Promise.all([
    db.user.findUnique({
      where: { id },
      include: {
        orders: {
          orderBy: { placedAt: "desc" },
          include: {
            items: {
              select: {
                id: true,
                quantity: true,
                total: true,
                productTitle: true,
                variantTitle: true,
                imageUrl: true,
                product: { select: { slug: true } },
              },
            },
          },
        },
        addresses: { orderBy: { createdAt: "desc" }, take: 3 },
        interactions: { orderBy: { createdAt: "desc" }, take: 30 },
        tags: { include: { tag: true } },
        reviews: { include: { product: { select: { title: true, slug: true } } }, take: 5 },
      },
    }),
    db.customerTag.findMany({ orderBy: { name: "asc" } }),
  ]);

  if (!customer) notFound();

  const paidOrders = customer.orders.filter((o) => o.paymentStatus === "SUCCESS");

  // What they have actually bought, gathered across every order and counted, so
  // a repeat purchase reads as one line with a higher count rather than two.
  const bought = new Map<
    string,
    { title: string; slug: string | null; imageUrl: string | null; units: number; spent: number }
  >();

  for (const order of customer.orders) {
    for (const item of order.items) {
      const key = item.productTitle;
      const existing = bought.get(key);
      if (existing) {
        existing.units += item.quantity;
        existing.spent += item.total;
      } else {
        bought.set(key, {
          title: item.productTitle,
          slug: item.product?.slug ?? null,
          imageUrl: item.imageUrl,
          units: item.quantity,
          spent: item.total,
        });
      }
    }
  }

  const purchased = [...bought.values()].sort((a, b) => b.units - a.units);
  const lifetimeValue = paidOrders.reduce((sum, o) => sum + o.total, 0);
  const name = [customer.firstName, customer.lastName].filter(Boolean).join(" ") || customer.email;
  const canWrite = can(staff.role, "customers:write");

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/admin/customers"
        className="flex w-fit items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Customers
      </Link>

      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl md:text-3xl">{name}</h1>
          {customer.tags.map((t) => (
            <span
              key={t.tagId}
              className="rounded-full px-2.5 py-0.5 text-xs font-medium text-white"
              style={{ backgroundColor: t.tag.color }}
            >
              {t.tag.name}
            </span>
          ))}
          {!customer.isActive ? <Badge tone="danger">Disabled</Badge> : null}
        </div>

        <div className="mt-2 flex flex-wrap gap-4 text-sm text-[var(--text-secondary)]">
          <a href={`mailto:${customer.email}`} className="flex items-center gap-1.5 hover:underline">
            <Mail className="h-3.5 w-3.5" aria-hidden />
            {customer.email}
          </a>
          {customer.phone ? (
            <a href={`tel:${customer.phone}`} className="flex items-center gap-1.5 hover:underline">
              <Phone className="h-3.5 w-3.5" aria-hidden />
              {customer.phone}
            </a>
          ) : null}
          <span>Joined {formatDate(customer.createdAt)}</span>
          {customer.lastLoginAt ? (
            <span>Last seen {formatDate(customer.lastLoginAt)}</span>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Lifetime value" value={formatMoney(lifetimeValue)} />
        <Stat label="Paid orders" value={String(paidOrders.length)} />
        <Stat
          label="Average order"
          value={formatMoney(paidOrders.length ? Math.round(lifetimeValue / paidOrders.length) : 0)}
        />
        <Stat
          label="Marketing"
          value={customer.acceptsMarketing ? "Opted in" : "Opted out"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="flex flex-col gap-6">
          {/* Orders */}
          <Card className="p-5">
            <h2 className="lx-eyebrow mb-4">Order history</h2>
            {customer.orders.length === 0 ? (
              <EmptyState title="No orders yet" />
            ) : (
              <ul className="divide-y divide-[var(--border-subtle)]">
                {customer.orders.map((order) => (
                  <li key={order.id}>
                    <Link
                      href={`/admin/orders/${order.id}`}
                      className="flex items-center gap-3 py-3 text-sm transition-colors hover:bg-[var(--surface-sunken)]"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block font-mono text-xs">{order.orderNumber}</span>
                        <span className="block text-xs text-[var(--text-muted)]">
                          {formatDate(order.placedAt)} ·{" "}
                          {order.items.reduce((s, i) => s + i.quantity, 0)} items
                        </span>
                      </span>
                      <Badge
                        tone={
                          order.status === "DELIVERED"
                            ? "success"
                            : order.status === "CANCELLED" || order.status === "REFUNDED"
                              ? "danger"
                              : "info"
                        }
                      >
                        {ORDER_STATUS_LABELS[order.status]}
                      </Badge>
                      <span className="w-24 text-right tabular-nums">
                        {formatMoney(order.total)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* What they have bought */}
          <Card className="p-5">
            <h2 className="lx-eyebrow mb-4">Products bought</h2>
            {purchased.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">
                Nothing yet. If they ordered over WhatsApp or in the showroom, open that order and
                assign it to this customer — it will appear here.
              </p>
            ) : (
              <ul className="divide-y divide-[var(--border-subtle)]">
                {purchased.map((item) => (
                  <li key={item.title} className="flex items-center gap-3 py-3">
                    <span className="h-12 w-10 shrink-0 overflow-hidden bg-[var(--surface-media)]">
                      {item.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.imageUrl}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : null}
                    </span>

                    <span className="min-w-0 flex-1">
                      {item.slug ? (
                        <Link
                          href={`/product/${item.slug}`}
                          className="block truncate text-sm hover:underline"
                        >
                          {item.title}
                        </Link>
                      ) : (
                        <span className="block truncate text-sm">{item.title}</span>
                      )}
                      <span className="text-xs text-[var(--text-muted)]">
                        {item.units} bought
                      </span>
                    </span>

                    <span className="text-sm tabular-nums">{formatMoney(item.spent)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Activity */}
          <Card className="p-5">
            <h2 className="lx-eyebrow mb-4">Activity & notes</h2>
            {customer.interactions.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">Nothing logged yet.</p>
            ) : (
              <ol className="flex flex-col gap-4">
                {customer.interactions.map((interaction) => (
                  <li key={interaction.id} className="flex gap-3">
                    <Badge tone="neutral">{interaction.type.toLowerCase().replace("_", " ")}</Badge>
                    <div className="min-w-0 flex-1">
                      {interaction.subject ? (
                        <p className="text-sm font-medium">{interaction.subject}</p>
                      ) : null}
                      <p className="text-sm text-[var(--text-secondary)]">{interaction.body}</p>
                      <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                        {formatDate(interaction.createdAt, true)}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>

          {customer.reviews.length > 0 ? (
            <Card className="p-5">
              <h2 className="lx-eyebrow mb-4">Reviews left</h2>
              <ul className="flex flex-col gap-3">
                {customer.reviews.map((review) => (
                  <li key={review.id} className="text-sm">
                    <p className="font-medium">
                      {review.product.title} · {review.rating}/5
                      {!review.isApproved ? (
                        <span className="ml-2">
                          <Badge tone="warning">Pending approval</Badge>
                        </span>
                      ) : null}
                    </p>
                    <p className="text-[var(--text-secondary)]">{review.body}</p>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>

        {/* Sidebar */}
        <div className="flex flex-col gap-6">
          {customer.addresses.length > 0 ? (
            <Card className="p-5">
              <h2 className="lx-eyebrow mb-3">Addresses</h2>
              <ul className="flex flex-col gap-3 text-sm text-[var(--text-secondary)]">
                {customer.addresses.map((address) => (
                  <li key={address.id}>
                    {address.line1}
                    {address.line2 ? `, ${address.line2}` : ""}
                    <br />
                    {address.city}, {address.region}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {canWrite ? (
            <CustomerPanel
              userId={customer.id}
              firstName={customer.firstName}
              lastName={customer.lastName}
              phone={customer.phone}
              notes={customer.notes}
              acceptsMarketing={customer.acceptsMarketing}
              allTags={allTags.map((t) => ({ id: t.id, name: t.name, color: t.color }))}
              selectedTagIds={customer.tags.map((t) => t.tagId)}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
