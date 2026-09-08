import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { displayName, requirePermission } from "@/lib/auth";
import { can } from "@/lib/auth/rbac";
import { buildQuery } from "@/lib/utils";
import { Card, EmptyState, SectionHeading, Stat } from "@/components/ui";
import { ReviewModeration } from "@/components/admin/review-moderation";

export const metadata: Metadata = { title: "Reviews" };

const PER_PAGE = 24;

/**
 * Everything customers have written about the pieces, waiting first.
 *
 * A review is off the storefront until somebody here says otherwise, so the
 * default view is the queue; the approved ones are a tab away for when one
 * needs pulling.
 */
export default async function AdminReviewsPage({ searchParams }: PageProps<"/admin/reviews">) {
  const user = await requirePermission("reviews:moderate");
  const params = await searchParams;

  const view = params.view === "approved" ? "approved" : "pending";
  const page = Math.max(1, Number(params.page) || 1);
  const where = { isApproved: view === "approved" };

  const [reviews, total, pendingCount, approvedCount, averages] = await Promise.all([
    db.review.findMany({
      where,
      orderBy: { createdAt: view === "pending" ? "asc" : "desc" },
      take: PER_PAGE,
      skip: (page - 1) * PER_PAGE,
      include: {
        product: { select: { title: true, slug: true } },
        user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
      },
    }),
    db.review.count({ where }),
    db.review.count({ where: { isApproved: false } }),
    db.review.count({ where: { isApproved: true } }),
    db.review.aggregate({ where: { isApproved: true }, _avg: { rating: true } }),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / PER_PAGE));
  const canWrite = can(user.role, "reviews:moderate");

  const tabs = [
    { key: "pending", label: `Waiting (${pendingCount})` },
    { key: "approved", label: `Showing (${approvedCount})` },
  ] as const;

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading
        title="Reviews"
        description="Nothing a customer writes reaches the product page until it is approved here. Hiding takes one back off without deleting it."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Waiting" value={String(pendingCount)} hint="not yet on the storefront" />
        <Stat label="Showing" value={String(approvedCount)} hint="live on product pages" />
        <Stat
          label="Average rating"
          value={averages._avg.rating ? averages._avg.rating.toFixed(1) : "—"}
          hint="across approved reviews"
        />
      </div>

      <Card className="flex flex-wrap gap-2 p-2">
        {tabs.map((tab) => (
          <Link
            key={tab.key}
            href={`/admin/reviews${buildQuery({ view: tab.key === "pending" ? undefined : tab.key })}`}
            aria-current={view === tab.key ? "page" : undefined}
            className={
              view === tab.key
                ? "rounded-lg bg-[var(--accent)] px-4 py-2 text-sm text-white"
                : "rounded-lg px-4 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
            }
          >
            {tab.label}
          </Link>
        ))}
      </Card>

      {reviews.length === 0 ? (
        <EmptyState
          title={view === "pending" ? "Nothing waiting" : "Nothing showing yet"}
          description={
            view === "pending"
              ? "New reviews land here the moment a customer posts one."
              : "Approve a review from the queue and it appears on its product page."
          }
        />
      ) : (
        <ReviewModeration
          canWrite={canWrite}
          reviews={reviews.map((review) => ({
            id: review.id,
            rating: review.rating,
            title: review.title,
            body: review.body,
            authorName: review.authorName,
            isVerifiedPurchase: review.isVerifiedPurchase,
            isApproved: review.isApproved,
            createdAt: review.createdAt.toISOString(),
            product: review.product,
            customer: review.user ? { id: review.user.id, name: displayName(review.user) } : null,
          }))}
        />
      )}

      {pageCount > 1 ? (
        <nav aria-label="Pagination" className="flex items-center justify-center gap-3 text-sm">
          {page > 1 ? (
            <Link
              href={`/admin/reviews${buildQuery({ view: view === "pending" ? undefined : view, page: page - 1 })}`}
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
              href={`/admin/reviews${buildQuery({ view: view === "pending" ? undefined : view, page: page + 1 })}`}
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
