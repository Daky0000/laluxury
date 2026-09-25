import type { Metadata } from "next";
import Link from "next/link";
import { MessageCircle, ShoppingBag } from "lucide-react";
import { db } from "@/lib/db";
import { displayName, requirePermission } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { formatPhone } from "@/lib/phone";
import { daysAgo, relativeTime } from "@/lib/utils";
import { Card, EmptyState, SectionHeading, Stat } from "@/components/ui";
import { Thumb } from "@/components/shop/photo";

export const metadata: Metadata = { title: "Abandoned bags" };

/** An hour without a tap and the shopper has gone; a month and the bag is stale. */
const IDLE_MS = 60 * 60 * 1000;
const STALE_DAYS = 30;

/**
 * Bags that were filled and left.
 *
 * Most of this shop's customers are a WhatsApp message away, and a bag with a
 * name on it is a sale that one message often finishes. The list shows who can
 * be reached and what they left, with the message ready to send. Anonymous bags
 * are counted but cannot be chased, so they sit at the bottom.
 */
export default async function AbandonedCartsPage() {
  await requirePermission("orders:read");

  const carts = await db.cart.findMany({
    where: {
      convertedOrderId: null,
      items: { some: {} },
      lastActivityAt: {
        lt: daysAgo(IDLE_MS / 86400000),
        gt: daysAgo(STALE_DAYS),
      },
    },
    orderBy: { lastActivityAt: "desc" },
    take: 100,
    include: {
      user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
      items: {
        include: {
          variant: {
            select: {
              title: true,
              product: {
                select: { title: true, images: { orderBy: { position: "asc" }, take: 1, select: { url: true } } },
              },
            },
          },
        },
      },
    },
  });

  const rows = carts.map((cart) => ({
    id: cart.id,
    lastActivityAt: cart.lastActivityAt,
    total: cart.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
    count: cart.items.reduce((sum, item) => sum + item.quantity, 0),
    email: cart.user?.email ?? cart.email ?? null,
    phone: cart.user?.phone ?? null,
    customer: cart.user ? { id: cart.user.id, name: displayName(cart.user) } : null,
    items: cart.items.map((item) => ({
      id: item.id,
      title: item.variant.product.title,
      variant: item.variant.title,
      quantity: item.quantity,
      imageUrl: item.variant.product.images[0]?.url ?? null,
    })),
  }));

  // Ensure the BAG5 courtesy 5% recovery code is active in the Discount table so any recovered shopper can use it immediately.
  await db.discount.upsert({
    where: { code: "BAG5" },
    update: { isActive: true },
    create: {
      code: "BAG5",
      description: "5% Concierge Courtesy Recovery Code",
      type: "PERCENTAGE",
      value: 5,
      minSubtotal: 0,
      isActive: true,
    },
  });

  const reachable = rows.filter((row) => row.phone || row.email);
  const anonymous = rows.length - reachable.length;
  const value = rows.reduce((sum, row) => sum + row.total, 0);

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading
        title="Abandoned bags & Concierge Recovery"
        description={`Bags left for more than an hour in the last ${STALE_DAYS} days. Courtesy code BAG5 (5% OFF) is active and ready to share via 1-click WhatsApp or Email recovery.`}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Bags" value={String(rows.length)} hint={`${anonymous} anonymous`} />
        <Stat label="Reachable" value={String(reachable.length)} hint="have a phone or email" />
        <Stat label="Left in bags" value={formatMoney(value)} hint="goods before delivery" />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<ShoppingBag className="h-6 w-6" aria-hidden />}
          title="Nothing left behind"
          description="Every recent bag either checked out or is still being filled."
        />
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {[...reachable, ...rows.filter((row) => !row.phone && !row.email)].map((row) => {
            const firstName = row.customer ? ` ${row.customer.name.split(" ")[0]}` : "";
            const pieceLabel = row.items.length === 1 ? row.items[0].title : `${row.count} curated pieces`;
            const message = encodeURIComponent(
              `Hello${firstName}, this is the LaLuxury Concierge. We noticed you left ${pieceLabel} (${formatMoney(row.total)}) in your bag. May we assist with delivery scheduling or fabric details?`,
            );
            const vipMessage = encodeURIComponent(
              `Hello${firstName}, this is the LaLuxury Concierge. Your selection (${pieceLabel}) is reserved in your bag. Use private courtesy code BAG5 at checkout for 5% off your order today.`,
            );
            const cleanPhone = row.phone ? row.phone.replace(/[^0-9]/g, "") : "";
            return (
              <li key={row.id}>
                <Card className="flex h-full flex-col gap-3 p-5">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    {row.customer ? (
                      <Link href={`/admin/customers/${row.customer.id}`} className="font-medium hover:underline">
                        {row.customer.name}
                      </Link>
                    ) : (
                      <span className="text-[var(--text-secondary)]">Guest</span>
                    )}
                    {row.phone ? (
                      <span className="text-[var(--text-muted)]">{formatPhone(row.phone)}</span>
                    ) : null}
                    {row.email ? <span className="truncate text-[var(--text-muted)]">{row.email}</span> : null}
                    <span className="ml-auto text-xs text-[var(--text-muted)]">
                      left {relativeTime(row.lastActivityAt)}
                    </span>
                  </div>

                  <ul className="flex flex-col gap-2">
                    {row.items.map((item) => (
                      <li key={item.id} className="flex items-center gap-3 text-sm">
                        <span className="h-10 w-8 shrink-0 overflow-hidden rounded-sm bg-[var(--surface-sunken)]">
                          {item.imageUrl ? <Thumb src={item.imageUrl} width={32} height={40} /> : null}
                        </span>
                        <span className="min-w-0 flex-1 truncate">
                          {item.title}
                          {item.variant !== "Default" ? (
                            <span className="text-[var(--text-muted)]"> · {item.variant}</span>
                          ) : null}
                        </span>
                        <span className="tabular-nums text-[var(--text-secondary)]">× {item.quantity}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-[var(--border-subtle)] pt-3">
                    <span className="text-sm font-medium tabular-nums">{formatMoney(row.total)}</span>
                    <div className="ml-auto flex flex-wrap items-center gap-2">
                      {row.phone ? (
                        <>
                          <a
                            href={`https://wa.me/${cleanPhone}?text=${message}`}
                            target="_blank"
                            rel="noopener"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] px-2.5 py-1.5 text-xs hover:bg-[var(--surface-sunken)]"
                          >
                            <MessageCircle className="h-3.5 w-3.5" aria-hidden />
                            WhatsApp Check-In
                          </a>
                          <a
                            href={`https://wa.me/${cleanPhone}?text=${vipMessage}`}
                            target="_blank"
                            rel="noopener"
                            className="inline-flex items-center gap-1.5 rounded-lg bg-[#25D366]/15 text-[#128C7E] border border-[#25D366]/30 px-2.5 py-1.5 text-xs font-medium hover:bg-[#25D366]/25"
                          >
                            <MessageCircle className="h-3.5 w-3.5" aria-hidden />
                            Send 5% VIP Code (BAG5)
                          </a>
                        </>
                      ) : null}
                      {row.email ? (
                        <a
                          href={`mailto:${row.email}?subject=${encodeURIComponent("Your reserved LaLuxury selection + 5% Courtesy Code (BAG5)")}&body=${vipMessage}`}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] px-2.5 py-1.5 text-xs hover:bg-[var(--surface-sunken)]"
                        >
                          Email 5% Offer
                        </a>
                      ) : null}
                    </div>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
