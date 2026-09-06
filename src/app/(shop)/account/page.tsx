import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Package, Heart, MapPin, LogOut, ShieldCheck } from "lucide-react";
import { db } from "@/lib/db";
import { currentUser, displayName } from "@/lib/auth";
import { isStaff } from "@/lib/auth/rbac";
import { logoutAction } from "@/app/actions/auth";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/utils";
import { ORDER_STATUS_LABELS } from "@/lib/constants";
import { formatPhone } from "@/lib/phone";
import { getSettings } from "@/lib/settings";
import { Card, Badge, EmptyState, LinkButton } from "@/components/ui";
import { Thumb } from "@/components/shop/photo";
import { MarketingToggle } from "@/components/shop/marketing-toggle";

export const metadata: Metadata = { title: "Your account" };
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await currentUser();
  if (!user) redirect("/login");

  const [orders, wishlist, addresses] = await Promise.all([
    db.order.findMany({
      where: { userId: user.id },
      orderBy: { placedAt: "desc" },
      include: { items: true },
      take: 20,
    }),
    db.wishlistItem.findMany({
      where: { userId: user.id },
      include: {
        product: {
          select: {
            id: true,
            title: true,
            slug: true,
            minPrice: true,
            images: { take: 1, orderBy: { position: "asc" }, select: { url: true } },
          },
        },
      },
    }),
    db.address.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 4 }),
  ]);

  const { supportEmail } = await getSettings();
  const paid = orders.filter((o) => o.paymentStatus === "SUCCESS");
  const lifetime = paid.reduce((sum, o) => sum + o.total, 0);

  return (
    <div className="lx-container py-12">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl">Hello, {user.firstName ?? displayName(user)}</h1>
          <p className="mt-1.5 text-sm text-[var(--text-secondary)]">
            {paid.length} {paid.length === 1 ? "order" : "orders"} · {formatMoney(lifetime)} spent
            with us
          </p>
        </div>

        <div className="flex items-center gap-3">
          {isStaff(user.role) ? (
            <LinkButton href="/admin" variant="secondary" size="sm">
              Back office
            </LinkButton>
          ) : null}
          <form action={logoutAction}>
            <button
              type="submit"
              className="flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              <LogOut className="h-4 w-4" aria-hidden />
              Sign out
            </button>
          </form>
        </div>
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_18rem]">
        <section>
          <h2 className="lx-eyebrow mb-4">Your orders</h2>

          {orders.length === 0 ? (
            <EmptyState
              icon={<Package className="h-7 w-7" aria-hidden />}
              title="No orders yet"
              description="When you buy something it will show up here."
              action={<LinkButton href="/shop" size="sm">Start shopping</LinkButton>}
            />
          ) : (
            <ul className="flex flex-col gap-4">
              {orders.map((order) => (
                <li key={order.id}>
                  <Card className="p-5">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="font-mono text-sm">{order.orderNumber}</span>
                      <Badge
                        tone={
                          order.status === "DELIVERED"
                            ? "success"
                            : order.status === "CANCELLED" || order.status === "REFUNDED"
                              ? "danger"
                              : order.status === "PENDING"
                                ? "warning"
                                : "info"
                        }
                      >
                        {ORDER_STATUS_LABELS[order.status]}
                      </Badge>
                      <span className="text-sm text-[var(--text-secondary)]">
                        {formatDate(order.placedAt)}
                      </span>
                      <span className="ml-auto text-lg tabular-nums">
                        {formatMoney(order.total)}
                      </span>
                    </div>

                    <ul className="mt-4 flex flex-wrap gap-3">
                      {order.items.map((item) => (
                        <li key={item.id} className="flex items-center gap-2">
                          <span className="h-12 w-10 shrink-0 overflow-hidden rounded-sm bg-[var(--surface-sunken)]">
                            {item.imageUrl ? (
                              <Thumb src={item.imageUrl} width={40} height={48} />
                            ) : null}
                          </span>
                          <span className="text-sm">
                            <span className="block">{item.productTitle}</span>
                            <span className="block text-[var(--text-muted)]">×{item.quantity}</span>
                          </span>
                        </li>
                      ))}
                    </ul>

                    {order.trackingNumber ? (
                      <p className="mt-3 text-sm text-[var(--text-secondary)]">
                        Tracking: {order.trackingCompany} {order.trackingNumber}
                      </p>
                    ) : null}
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="flex flex-col gap-6">
          <Card className="p-5">
            <h2 className="lx-eyebrow mb-3 flex items-center gap-1.5">
              <Heart className="h-3.5 w-3.5" aria-hidden />
              Wishlist
            </h2>

            {wishlist.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">Nothing saved yet.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {wishlist.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={`/product/${item.product.slug}`}
                      className="flex items-center gap-3 text-sm hover:underline"
                    >
                      <span className="h-12 w-10 shrink-0 overflow-hidden rounded-sm bg-[var(--surface-sunken)]">
                        {item.product.images[0] ? (
                          <Thumb src={item.product.images[0].url} width={40} height={48} />
                        ) : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{item.product.title}</span>
                        <span className="block text-sm text-[var(--text-muted)] tabular-nums">
                          {formatMoney(item.product.minPrice)}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="lx-eyebrow mb-3 flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" aria-hidden />
              Saved addresses
            </h2>

            {addresses.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">
                Addresses are saved automatically when you check out.
              </p>
            ) : (
              <ul className="flex flex-col gap-3 text-sm text-[var(--text-secondary)]">
                {addresses.map((address) => (
                  <li key={address.id}>
                    {address.line1}
                    {address.line2 ? `, ${address.line2}` : ""}
                    <br />
                    {address.city}, {address.region}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-5 text-sm">
            <h2 className="lx-eyebrow mb-2">Details</h2>
            {user.phone ? (
              <p className="flex flex-wrap items-center gap-x-2 text-[var(--text-secondary)]">
                {formatPhone(user.phone)}
                {user.phoneVerified ? (
                  <span className="inline-flex items-center gap-1 text-sm text-sage-600">
                    <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
                    Verified
                  </span>
                ) : null}
              </p>
            ) : null}
            {user.email ? <p className="text-[var(--text-secondary)]">{user.email}</p> : null}
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              Member since {formatDate(user.createdAt)}
            </p>
          </Card>

          {/* The GDPR rights, where someone would actually look for them: on
              their own account, not buried three clicks into a policy page. */}
          <Card className="p-5 text-sm">
            <h2 className="lx-eyebrow mb-2">Your data</h2>

            <MarketingToggle initial={user.acceptsMarketing} />

            <p className="mt-4 border-t border-[var(--border-subtle)] pt-4 font-light leading-relaxed text-[var(--text-secondary)]">
              You can ask for a copy of everything we hold about you, have it corrected, or have
              your account deleted. We answer within a month and it costs nothing.
            </p>
            <a
              href={`mailto:${supportEmail}?subject=${encodeURIComponent("Data request")}&body=${encodeURIComponent(
                `Hello,\n\nI would like to (delete this line as needed): request a copy of my data / correct my details / delete my account.\n\nAccount: ${displayName(user)}\n`,
              )}`}
              className="mt-3 inline-flex min-h-11 items-center text-[var(--text-primary)] underline underline-offset-4 hover:text-[var(--accent)]"
            >
              Make a data request
            </a>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              More in the{" "}
              <Link href="/privacy" className="underline underline-offset-4">
                privacy notice
              </Link>
              .
            </p>
          </Card>
        </aside>
      </div>
    </div>
  );
}
