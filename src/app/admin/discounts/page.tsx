import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/auth/rbac";
import { describeDiscount } from "@/lib/discounts";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/utils";
import { Card, SectionHeading, EmptyState } from "@/components/ui";
import { DiscountManager } from "@/components/admin/discount-manager";

export const metadata: Metadata = { title: "Discounts" };

export default async function AdminDiscountsPage() {
  const user = await requirePermission("discounts:read");

  const [discounts, categories, products] = await Promise.all([
    db.discount.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        redemptions: { select: { amount: true } },
      },
    }),
    db.category.findMany({ orderBy: { position: "asc" }, select: { id: true, name: true } }),
    db.product.findMany({
      where: { status: { not: "ARCHIVED" } },
      orderBy: { title: "asc" },
      select: { id: true, title: true },
      take: 200,
    }),
  ]);

  const rows = discounts.map((d) => ({
    id: d.id,
    code: d.code,
    description: d.description,
    rule: describeDiscount(d),
    type: d.type,
    scope: d.scope,
    value: d.value,
    minSubtotal: d.minSubtotal,
    minQuantity: d.minQuantity,
    usageLimit: d.usageLimit,
    usageLimitPerUser: d.usageLimitPerUser,
    firstOrderOnly: d.firstOrderOnly,
    isActive: d.isActive,
    timesUsed: d.timesUsed,
    startsAt: d.startsAt?.toISOString() ?? null,
    endsAt: d.endsAt?.toISOString() ?? null,
    productIds: d.productIds,
    categoryIds: d.categoryIds,
    totalDiscounted: d.redemptions.reduce((sum, r) => sum + r.amount, 0),
  }));

  const canWrite = can(user.role, "discounts:write");
  const totalGiven = rows.reduce((sum, r) => sum + r.totalDiscounted, 0);

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading
        title="Discounts"
        description={`${rows.filter((r) => r.isActive).length} active of ${rows.length}. ${formatMoney(totalGiven)} given away all time.`}
      />

      {rows.length === 0 && !canWrite ? (
        <EmptyState title="No discount codes yet" />
      ) : (
        <DiscountManager
          discounts={rows}
          categories={categories}
          products={products}
          canWrite={canWrite}
        />
      )}

      <Card className="p-5">
        <h2 className="lx-eyebrow mb-3">How codes are applied</h2>
        <ul className="flex flex-col gap-1.5 text-sm text-[var(--text-secondary)]">
          <li>
            Percentage codes take a share of the eligible goods only — delivery is never discounted
            by them.
          </li>
          <li>
            A fixed amount is capped at the value of the eligible goods, so a code can never make an
            order negative.
          </li>
          <li>
            The discount is split across line items in proportion to their value, so per-item
            refunds stay accurate.
          </li>
          <li>
            Usage is counted when payment succeeds, not when the code is typed, so abandoned
            checkouts do not consume a limited code.
          </li>
        </ul>
      </Card>

      {rows.length > 0 ? (
        <p className="text-xs text-[var(--text-muted)]">
          Oldest code created {formatDate(discounts[discounts.length - 1].createdAt)}.
        </p>
      ) : null}
    </div>
  );
}
