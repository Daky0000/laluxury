"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { postAlert } from "@/lib/agent/slack";

/**
 * Leaving a review, from the product page.
 *
 * Reviews come from signed-in customers only. A form anybody can post to is a
 * form that fills with spam within a week, and the moderation queue would then
 * be most of what the console shows. Requiring an account costs a genuine
 * reviewer one sign-in and costs a spammer a phone number per review.
 *
 * Nothing is published here. Every review lands unapproved and waits for a
 * manager under Admin -> Reviews; the customer is told so, and their review is
 * shown back to them on the product page with its status while it waits.
 *
 * One review per customer per product: writing again replaces the first one
 * and sends it back to the queue, so an edited review is re-read before it is
 * shown again.
 */

export type ReviewState = { ok: boolean; message?: string; fieldErrors?: Record<string, string> };

const schema = z.object({
  rating: z.coerce.number().int().min(1, "Choose a star rating.").max(5, "Choose a star rating."),
  title: z.string().trim().max(120, "Keep the title under 120 characters.").optional(),
  body: z
    .string()
    .trim()
    .min(20, "Say a little more - at least a sentence or two.")
    .max(2000, "Keep it under 2,000 characters."),
});

/** "Ama M." - a first name and an initial is enough to be somebody, and no more. */
function authorNameFor(user: { firstName: string | null; lastName: string | null }): string {
  const first = user.firstName?.trim();
  const initial = user.lastName?.trim().charAt(0);
  if (first && initial) return `${first} ${initial.toUpperCase()}.`;
  return first || "A customer";
}

export async function submitReviewAction(
  productId: string,
  _prev: ReviewState | null,
  formData: FormData,
): Promise<ReviewState> {
  const user = await currentUser();
  if (!user) return { ok: false, message: "Sign in to leave a review." };

  const parsed = schema.safeParse({
    rating: formData.get("rating"),
    title: formData.get("title") || undefined,
    body: formData.get("body"),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, fieldErrors };
  }

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
    rating: parsed.data.rating,
    title: parsed.data.title || null,
    body: parsed.data.body,
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
        body: `${parsed.data.rating}/5${parsed.data.title ? ` - ${parsed.data.title}` : ""}`,
        meta: { productId: product.id },
      },
    });
  }

  await postAlert(
    `:speech_balloon: New ${parsed.data.rating}-star review of ${product.title} from ${data.authorName}, waiting for approval.`,
  );

  revalidatePath(`/product/${product.slug}`);
  revalidatePath("/admin/reviews");

  return {
    ok: true,
    message: existing
      ? "Your review has been updated and will show again once it has been checked."
      : "Thank you. Your review will appear once it has been checked.",
  };
}
