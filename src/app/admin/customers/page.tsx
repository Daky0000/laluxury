import type { Metadata } from "next";
import Link from "next/link";
import { Search, Mail } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { customerSummaries } from "@/lib/analytics";
import { formatMoney } from "@/lib/money";
import { formatDate, buildQuery } from "@/lib/utils";
import { Card, Badge, EmptyState, SectionHeading, Stat } from "@/components/ui";
import { AddCustomerPanel, RemoveCustomerButton } from "@/components/admin/customer-tools";

export const metadata: Metadata = { title: "Customers" };

const PER_PAGE = 25;

export default async function AdminCustomersPage({ searchParams }: PageProps<"/admin/customers">) {
  await requirePermission("customers:read");
  const params = await searchParams;

  const q = typeof params.q === "string" ? params.q : "";
  const page = Math.max(1, Number(params.page) || 1);

  const [{ customers, total }, marketingCount, newsletterCount] = await Promise.all([
    customerSummaries({ search: q || undefined, take: PER_PAGE, skip: (page - 1) * PER_PAGE }),
    db.user.count({ where: { role: "CUSTOMER", acceptsMarketing: true } }),
    db.newsletterSubscriber.count({ where: { isSubscribed: true } }),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / PER_PAGE));
  const repeatBuyers = customers.filter((c) => c.orderCount > 1).length;

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading
        title="Customers"
        description="Lifetime value counts paid orders only."
      />

      <AddCustomerPanel />

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Customers" value={String(total)} />
        <Stat
          label="Opted into marketing"
          value={String(marketingCount)}
          hint={`${newsletterCount} newsletter subscribers`}
        />
        <Stat
          label="Repeat buyers"
          value={String(repeatBuyers)}
          hint="on this page"
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
              <input
                id="q"
                name="q"
                defaultValue={q}
                placeholder="Name, email or phone"
                className="lx-field pl-9"
              />
            </div>
          </div>
          <button
            type="submit"
            className="rounded-(--radius-card) bg-[var(--accent)] px-4 py-2.5 text-sm text-[var(--accent-contrast)]"
          >
            Search
          </button>
          {q ? (
            <Link
              href="/admin/customers"
              className="px-2 py-2.5 text-sm underline-offset-4 hover:underline"
            >
              Reset
            </Link>
          ) : null}
        </form>
      </Card>

      {customers.length === 0 ? (
        <EmptyState
          title="No customers match"
          description={q ? "Try a different search." : "They appear here after their first visit."}
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--border-subtle)] bg-[var(--surface-sunken)] text-left">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Customer</th>
                  <th className="px-4 py-2.5 font-medium">Tags</th>
                  <th className="px-4 py-2.5 font-medium">Orders</th>
                  <th className="px-4 py-2.5 font-medium">Lifetime value</th>
                  <th className="px-4 py-2.5 font-medium">Avg order</th>
                  <th className="px-4 py-2.5 font-medium">Last order</th>
                  <th className="px-4 py-2.5 font-medium">Joined</th>
                  <th className="px-4 py-2.5 font-medium">
                    <span className="sr-only">Remove</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {customers.map((customer) => (
                  <tr key={customer.id} className="hover:bg-[var(--surface-sunken)]">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/customers/${customer.id}`}
                        className="font-medium hover:underline"
                      >
                        {[customer.firstName, customer.lastName].filter(Boolean).join(" ") ||
                          customer.email}
                      </Link>
                      <span className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                        <Mail className="h-3 w-3" aria-hidden />
                        {customer.email}
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {customer.acceptsMarketing ? <Badge tone="info">Marketing</Badge> : null}
                        {customer.tags.map((tag) => (
                          <span
                            key={tag.id}
                            className="rounded-full px-2 py-0.5 text-[11px] font-medium text-white"
                            style={{ backgroundColor: tag.color }}
                          >
                            {tag.name}
                          </span>
                        ))}
                      </div>
                    </td>

                    <td className="px-4 py-3 tabular-nums">{customer.orderCount}</td>
                    <td className="px-4 py-3 tabular-nums">{formatMoney(customer.lifetimeValue)}</td>
                    <td className="px-4 py-3 tabular-nums text-[var(--text-secondary)]">
                      {formatMoney(customer.averageOrderValue)}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">
                      {customer.lastOrderAt ? formatDate(customer.lastOrderAt) : "—"}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">
                      {formatDate(customer.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <RemoveCustomerButton
                        userId={customer.id}
                        name={
                          [customer.firstName, customer.lastName].filter(Boolean).join(" ") ||
                          customer.email
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {pageCount > 1 ? (
        <nav aria-label="Pagination" className="flex items-center justify-center gap-3 text-sm">
          {page > 1 ? (
            <Link
              href={`/admin/customers${buildQuery({ q, page: page - 1 })}`}
              className="rounded-(--radius-card) border border-[var(--border-subtle)] px-3 py-1.5"
            >
              Previous
            </Link>
          ) : null}
          <span className="tabular-nums text-[var(--text-secondary)]">
            Page {page} of {pageCount}
          </span>
          {page < pageCount ? (
            <Link
              href={`/admin/customers${buildQuery({ q, page: page + 1 })}`}
              className="rounded-(--radius-card) border border-[var(--border-subtle)] px-3 py-1.5"
            >
              Next
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
