import { z } from "zod";
import { db } from "@/lib/db";
import { postAlert } from "@/lib/agent/slack";

/**
 * Product reviews, shared by the web product page and the app.
 *
 * Reviews come from signed-in customers only and every one lands unapproved,
 * waiting for a manager under Admin -> Reviews. One review per customer per
 * product: writing again replaces the first and sends it back to the queue.
 */

export const reviewSchema = z.object({
  rating: z.coerce.number().int().min(1, "Choose a star rating.").max(5, "Choose a star rating."),
  title: z.string().trim().max(120, "Keep the title under 120 characters.").optional(),
  body: z
    .string()
    .trim()
    .min(20, "Say a little more - at least a sentence or two.")
    .max(2000, "Keep it under 2,000 characters."),
});

export type ReviewInput = z.infer<typeof reviewSchema>;

/** "Ama M." - a first name and an initial is enough to be somebody, and no more. */
export function authorNameFor(user: { firstName: string | null; lastName: string | null }): string {
  const first = user.firstName?.trim();
  const initial = user.lastName?.trim().charAt(0);
  if (first && initial) return `${first} ${initial.toUpperCase()}.`;
  return first || "A customer";
}

export type SubmitReviewResult =
  | { ok: true; updated: boolean; slug: string }
  | { ok: false; message: string };

export async function submitReview(
  user: { id: string; firstName: string | null; lastName: string | null },
  productId: string,
  input: ReviewInput,
): Promise<SubmitReviewResult> {
  const product = await db.product.findFirst({
    where: { id: productId, status: "ACTIVE" },
    select: { id: true, title: true, slug: true },
  });
  if (!product) return { ok: false, message: "That product is no longer on sale." };

  // "Verified purchase" means a paid order of this product on this account.
  const bought = await db.order.findFirst({
    where: {
      userId: user.id,
      paymentStatus: "SUCCESS",
      items: { some: { productId: product.id } },
    },
    select: { id: true },
  });

  const data = {
    authorName: authorNameFor(user),
    rating: input.rating,
    title: input.title || null,
    body: input.body,
    isVerifiedPurchase: Boolean(bought),
    // Back to the queue, whether it is new or an edit.
    isApproved: false,
  };

  const existing = await db.review.findFirst({
    where: { productId: product.id, userId: user.id },
    select: { id: true },
  });

  if (existing) {
    await db.review.update({ where: { id: existing.id }, data });
  } else {
    await db.review.create({ data: { ...data, productId: product.id, userId: user.id } });
    await db.customerInteraction.create({
      data: {
        userId: user.id,
        type: "REVIEW_LEFT",
        subject: product.title,
        body: `${input.rating}/5${input.title ? ` - ${input.title}` : ""}`,
        meta: { productId: product.id },
      },
    });
  }

  await postAlert(
    `:speech_balloon: New ${input.rating}-star review of ${product.title} from ${data.authorName}, waiting for approval.`,
  );

  return { ok: true, updated: Boolean(existing), slug: product.slug };
}

/** Approved reviews for a product, newest first, with the summary numbers. */
export async function productReviews(productId: string, limit = 20) {
  const [reviews, summary] = await Promise.all([
    db.review.findMany({
      where: { productId, isApproved: true },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        authorName: true,
        rating: true,
        title: true,
        body: true,
        isVerifiedPurchase: true,
        createdAt: true,
      },
    }),
    db.review.aggregate({
      where: { productId, isApproved: true },
      _avg: { rating: true },
      _count: { _all: true },
    }),
  ]);
  return {
    reviews,
    average: summary._avg.rating ? Math.round(summary._avg.rating * 10) / 10 : null,
    count: summary._count._all,
  };
}
