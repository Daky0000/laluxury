"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import type { AdminState } from "./products";

/**
 * Moderating reviews.
 *
 * Approving puts a review on the product page. Hiding takes an approved one
 * back off it without losing the words, so a review that turns out to be about
 * the wrong product, or to name a member of staff, can be pulled and looked at.
 * Deleting is for spam, and is the only one of the three that cannot be undone.
 */

function revalidateReview(slug: string | null) {
  revalidatePath("/admin/reviews");
  if (slug) revalidatePath(`/product/${slug}`);
}

export async function moderateReviewAction(
  reviewId: string,
  decision: "approve" | "hide" | "delete",
): Promise<AdminState> {
  const actor = await requirePermission("reviews:moderate");

  const review = await db.review.findUnique({
    where: { id: reviewId },
    select: {
      id: true,
      isApproved: true,
      rating: true,
      authorName: true,
      product: { select: { slug: true, title: true } },
    },
  });
  if (!review) return { ok: false, message: "That review no longer exists." };

  if (decision === "delete") {
    await db.review.delete({ where: { id: reviewId } });
    await recordAudit({
      actorId: actor.id,
      action: "review.delete",
      entity: "Review",
      entityId: reviewId,
      before: { product: review.product.title, rating: review.rating, author: review.authorName },
    });
    revalidateReview(review.product.slug);
    return { ok: true, message: "Review deleted." };
  }

  const isApproved = decision === "approve";
  if (review.isApproved === isApproved) {
    return { ok: true, message: isApproved ? "Already showing." : "Already hidden." };
  }

  await db.review.update({ where: { id: reviewId }, data: { isApproved } });
  await recordAudit({
    actorId: actor.id,
    action: isApproved ? "review.approve" : "review.hide",
    entity: "Review",
    entityId: reviewId,
    after: { product: review.product.title, rating: review.rating, isApproved },
  });

  revalidateReview(review.product.slug);
  return {
    ok: true,
    message: isApproved
      ? `Now showing on ${review.product.title}.`
      : `Hidden from ${review.product.title}.`,
  };
}

/** How many are waiting, for the badge on the console rail. */
export async function pendingReviewCount(): Promise<number> {
  return db.review.count({ where: { isApproved: false } });
}
