"use client";

import { useActionState, useId, useState } from "react";
import Link from "next/link";
import { Loader2, Star } from "lucide-react";
import { submitReviewAction, type ReviewState } from "@/app/actions/reviews";
import { Alert } from "@/components/ui";
import { cn } from "@/lib/utils";

export type OwnReview = {
  rating: number;
  title: string | null;
  body: string;
  isApproved: boolean;
};

const field =
  "w-full border border-[var(--border-strong)] bg-[var(--surface-raised)] px-4 py-3.5 text-sm " +
  "outline-none transition-colors placeholder:text-ink-400 focus:border-[var(--accent)]";

/**
 * The review form under a product's reviews.
 *
 * Signed out, it is one line and a link: the point of the section is what
 * other people said, and a form that cannot be submitted is noise beside it.
 * Signed in, it opens on the customer's own review when they have one, so
 * editing is the same form as writing.
 */
export function ReviewForm({
  productId,
  signedIn,
  existing,
}: {
  productId: string;
  signedIn: boolean;
  existing: OwnReview | null;
}) {
  const [state, action, pending] = useActionState<ReviewState | null, FormData>(
    submitReviewAction.bind(null, productId),
    null,
  );
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [hover, setHover] = useState(0);
  const [open, setOpen] = useState(!existing);
  const id = useId();

  if (!signedIn) {
    return (
      <p className="text-sm text-[var(--text-secondary)]">
        Bought this piece?{" "}
        <Link href="/login" className="underline underline-offset-4 hover:text-[var(--accent)]">
          Sign in
        </Link>{" "}
        to leave a review.
      </p>
    );
  }

  if (state?.ok) {
    return <Alert tone="success">{state.message}</Alert>;
  }

  if (existing && !open) {
    return (
      <div className="border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-5">
        <p className="text-sm uppercase tracking-[0.16em] text-[var(--text-muted)]">
          Your review {existing.isApproved ? "is showing" : "is waiting to be checked"}
        </p>
        <p className="mt-2 flex" aria-label={`${existing.rating} out of 5`}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Star
              key={n}
              aria-hidden
              className={cn(
                "h-4 w-4",
                n <= existing.rating ? "fill-brass text-brass" : "text-[var(--text-muted)]",
              )}
            />
          ))}
        </p>
        {existing.title ? <p className="mt-2 font-medium">{existing.title}</p> : null}
        <p className="mt-1.5 text-sm text-[var(--text-secondary)]">{existing.body}</p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-4 text-sm underline underline-offset-4 hover:text-[var(--accent)]"
        >
          Edit your review
        </button>
      </div>
    );
  }

  const errors = state?.fieldErrors ?? {};
  const shown = hover || rating;

  return (
    <form action={action} className="flex flex-col gap-4 border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-5 sm:p-6">
      <h3 className="font-display text-2xl">{existing ? "Edit your review" : "Write a review"}</h3>

      {state?.message && !state.ok ? <Alert tone="danger">{state.message}</Alert> : null}

      <div>
        <p id={`${id}-rating`} className="mb-2 text-sm uppercase tracking-[0.16em] text-[var(--text-muted)]">
          Your rating
        </p>
        <div role="radiogroup" aria-labelledby={`${id}-rating`} className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={`${n} star${n === 1 ? "" : "s"}`}
              onClick={() => setRating(n)}
              onMouseEnter={() => setHover(n)}
              onMouseLeave={() => setHover(0)}
              className="lx-tap-tight text-[var(--text-muted)] transition-colors"
            >
              <Star
                className={cn("h-6 w-6", n <= shown ? "fill-brass text-brass" : "")}
                strokeWidth={1.5}
                aria-hidden
              />
            </button>
          ))}
        </div>
        <input type="hidden" name="rating" value={rating || ""} />
        {errors.rating ? <p className="mt-1.5 text-sm text-danger">{errors.rating}</p> : null}
      </div>

      <div>
        <label htmlFor={`${id}-title`} className="sr-only">
          Title
        </label>
        <input
          id={`${id}-title`}
          name="title"
          maxLength={120}
          defaultValue={existing?.title ?? ""}
          placeholder="Sum it up in a few words (optional)"
          className={field}
        />
        {errors.title ? <p className="mt-1.5 text-sm text-danger">{errors.title}</p> : null}
      </div>

      <div>
        <label htmlFor={`${id}-body`} className="sr-only">
          Your review
        </label>
        <textarea
          id={`${id}-body`}
          name="body"
          rows={4}
          required
          minLength={20}
          maxLength={2000}
          defaultValue={existing?.body ?? ""}
          placeholder="How does it feel, how does it wash, would you buy it again?"
          className={`${field} resize-y`}
        />
        {errors.body ? <p className="mt-1.5 text-sm text-danger">{errors.body}</p> : null}
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" disabled={pending} className="lx-cta disabled:opacity-60">
          {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
          {existing ? "Save review" : "Post review"}
        </button>
        {existing ? (
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-sm text-[var(--text-secondary)] underline-offset-4 hover:underline"
          >
            Cancel
          </button>
        ) : null}
        <p className="text-sm text-[var(--text-muted)]">Reviews are checked before they appear.</p>
      </div>
    </form>
  );
}
