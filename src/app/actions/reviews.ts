"use server";

import { revalidatePath } from "next/cache";
import { currentUser } from "@/lib/auth";
import { reviewSchema, submitReview } from "@/lib/reviews";

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

export async function submitReviewAction(
  productId: string,
  _prev: ReviewState | null,
  formData: FormData,
): Promise<ReviewState> {
  const user = await currentUser();
  if (!user) return { ok: false, message: "Sign in to leave a review." };

  const parsed = reviewSchema.safeParse({
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

  const result = await submitReview(user, productId, parsed.data);
  if (!result.ok) return { ok: false, message: result.message };

  revalidatePath(`/product/${result.slug}`);
  revalidatePath("/admin/reviews");

  return {
    ok: true,
    message: result.updated
      ? "Your review has been updated and will show again once it has been checked."
      : "Thank you. Your review will appear once it has been checked.",
  };
}
