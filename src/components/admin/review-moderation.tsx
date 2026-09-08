"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, EyeOff, Loader2, Star, Trash2 } from "lucide-react";
import { moderateReviewAction } from "@/app/actions/admin/reviews";
import type { AdminState } from "@/app/actions/admin/products";
import { Alert, Badge, Card } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";

export type ReviewRow = {
  id: string;
  rating: number;
  title: string | null;
  body: string;
  authorName: string;
  isVerifiedPurchase: boolean;
  isApproved: boolean;
  createdAt: string;
  product: { title: string; slug: string };
  customer: { id: string; name: string } | null;
};

/**
 * The moderation queue. Each card is one review with the three things a
 * manager can do to it, and the list is what the storefront will show once
 * "approve" is pressed - so the words are shown here exactly as they will read.
 */
export function ReviewModeration({ reviews, canWrite }: { reviews: ReviewRow[]; canWrite: boolean }) {
  const [busy, startBusy] = useTransition();
  const [acting, setActing] = useState<string | null>(null);
  const [notice, setNotice] = useState<AdminState | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  function act(id: string, decision: "approve" | "hide" | "delete") {
    setActing(id);
    setNotice(null);
    startBusy(async () => {
      const result = await moderateReviewAction(id, decision);
      setNotice(result);
      setActing(null);
      setConfirmDelete(null);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {notice?.message ? (
        <Alert tone={notice.ok ? "success" : "danger"}>{notice.message}</Alert>
      ) : null}

      <ul className="grid gap-4 lg:grid-cols-2">
        {reviews.map((review) => {
          const working = busy && acting === review.id;
          return (
            <li key={review.id}>
              <Card className="flex h-full flex-col gap-3 p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex" aria-label={`${review.rating} out of 5`}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star
                        key={n}
                        aria-hidden
                        className={cn(
                          "h-3.5 w-3.5",
                          n <= review.rating ? "fill-brass text-brass" : "text-[var(--text-muted)]",
                        )}
                      />
                    ))}
                  </span>
                  <Badge tone={review.isApproved ? "success" : "warning"}>
                    {review.isApproved ? "showing" : "waiting"}
                  </Badge>
                  {review.isVerifiedPurchase ? <Badge tone="info">verified purchase</Badge> : null}
                  <span className="ml-auto text-xs text-[var(--text-muted)]">
                    {formatDate(review.createdAt, true)}
                  </span>
                </div>

                <div>
                  <Link
                    href={`/product/${review.product.slug}#reviews`}
                    className="text-sm font-medium hover:underline"
                  >
                    {review.product.title}
                  </Link>
                  <p className="text-xs text-[var(--text-muted)]">
                    by {review.authorName}
                    {review.customer ? (
                      <>
                        {" "}
                        ·{" "}
                        <Link href={`/admin/customers/${review.customer.id}`} className="hover:underline">
                          {review.customer.name}
                        </Link>
                      </>
                    ) : null}
                  </p>
                </div>

                {review.title ? <p className="font-medium">{review.title}</p> : null}
                <p className="flex-1 whitespace-pre-line text-sm text-[var(--text-secondary)]">
                  {review.body}
                </p>

                {canWrite ? (
                  <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border-subtle)] pt-3">
                    {review.isApproved ? (
                      <button
                        type="button"
                        disabled={working}
                        onClick={() => act(review.id, "hide")}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] px-3 py-1.5 text-xs disabled:opacity-50"
                      >
                        <EyeOff className="h-3.5 w-3.5" aria-hidden />
                        Hide
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={working}
                        onClick={() => act(review.id, "approve")}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs text-white disabled:opacity-50"
                      >
                        {working ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                        ) : (
                          <Check className="h-3.5 w-3.5" aria-hidden />
                        )}
                        Approve
                      </button>
                    )}

                    {confirmDelete === review.id ? (
                      <span className="ml-auto flex items-center gap-2 text-xs">
                        <button
                          type="button"
                          disabled={working}
                          onClick={() => act(review.id, "delete")}
                          className="text-danger underline underline-offset-2 disabled:opacity-50"
                        >
                          {working ? "Deleting…" : "Confirm delete"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(null)}
                          className="text-[var(--text-secondary)]"
                        >
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={working}
                        onClick={() => setConfirmDelete(review.id)}
                        className="ml-auto inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)] transition-colors hover:text-danger disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        Delete
                      </button>
                    )}
                  </div>
                ) : null}
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
