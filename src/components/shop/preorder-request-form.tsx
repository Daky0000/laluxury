"use client";

import { useActionState } from "react";
import { CheckCircle2, Clock, Loader2, Sparkles } from "lucide-react";
import { submitPreorderRequestAction, type PreorderActionState } from "@/app/actions/preorder";

const fieldClass =
  "w-full border border-[var(--border-strong)] bg-[var(--surface-raised)] px-4 py-3.5 text-sm " +
  "outline-none transition-colors placeholder:text-ink-400 focus:border-[var(--accent)]";

export function PreorderRequestForm({
  defaultProductTitle = "",
  defaultProductId = "",
  defaultVariantTitle = "",
  compact = false,
}: {
  defaultProductTitle?: string;
  defaultProductId?: string;
  defaultVariantTitle?: string;
  compact?: boolean;
}) {
  const [state, action, pending] = useActionState<PreorderActionState | null, FormData>(
    submitPreorderRequestAction,
    null,
  );

  if (state?.ok) {
    return (
      <div className="border border-amber-800/30 bg-[#231B12] p-6 text-[#F4E6C8]">
        <div className="flex items-start gap-3.5">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#D4AF37]" aria-hidden />
          <div>
            <h3 className="font-display text-xl text-white">Pre-Order Request Registered</h3>
            <p className="mt-2 text-sm leading-relaxed text-[#E2D4B7]">{state.message}</p>
            <p className="mt-3 text-xs uppercase tracking-[0.16em] text-[#D4AF37]">
              Reference #{state.requestId?.slice(-6).toUpperCase()}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const errors = state?.fieldErrors ?? {};

  return (
    <form
      action={action}
      className={
        compact
          ? "border border-amber-800/30 bg-[var(--surface-raised)] p-5"
          : "border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-6 sm:p-8"
      }
    >
      <div className="mb-5 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-[#8C6528]">
        <Sparkles className="h-3.5 w-3.5 text-[#D4AF37]" aria-hidden />
        Bespoke Pre-Order &amp; Sourcing Service
      </div>

      <h3 className={compact ? "font-display text-xl" : "font-display text-2xl sm:text-3xl"}>
        {compact
          ? "Want us to source or order this piece for you?"
          : "Tell us what you want ordered for your home"}
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
        If a piece, size or colour is not currently in stock, our team can order or custom-source
        it directly for you. Fill in the details below and we will confirm lead time and pricing.
      </p>

      {state?.message && !state.ok ? (
        <p
          role="alert"
          className="mt-4 border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger"
        >
          {state.message}
        </p>
      ) : null}

      {defaultProductId ? (
        <input type="hidden" name="productId" value={defaultProductId} />
      ) : null}
      {defaultVariantTitle ? (
        <input type="hidden" name="variantTitle" value={defaultVariantTitle} />
      ) : null}

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label
            htmlFor="preorder-productTitle"
            className="mb-1.5 block text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]"
          >
            Item / Piece to Pre-Order *
          </label>
          <input
            id="preorder-productTitle"
            name="productTitle"
            required
            defaultValue={
              defaultVariantTitle
                ? `${defaultProductTitle} — ${defaultVariantTitle}`
                : defaultProductTitle
            }
            placeholder="e.g. King Size Velvet Bed Frame, 300×400cm Salon Carpet, Custom Blinds..."
            className={fieldClass}
          />
          {errors.productTitle ? (
            <p className="mt-1 text-xs text-danger">{errors.productTitle}</p>
          ) : null}
        </div>

        <div>
          <label
            htmlFor="preorder-quantity"
            className="mb-1.5 block text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]"
          >
            Quantity *
          </label>
          <input
            id="preorder-quantity"
            name="quantity"
            type="number"
            min={1}
            max={200}
            defaultValue={1}
            required
            className={fieldClass}
          />
        </div>

        <div>
          <label
            htmlFor="preorder-budget"
            className="mb-1.5 block text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]"
          >
            Target Budget (GH₵, optional)
          </label>
          <input
            id="preorder-budget"
            name="targetBudgetMajor"
            type="number"
            step="0.01"
            min={0}
            placeholder="e.g. 1500"
            className={fieldClass}
          />
        </div>

        <div>
          <label
            htmlFor="preorder-name"
            className="mb-1.5 block text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]"
          >
            Your Name *
          </label>
          <input
            id="preorder-name"
            name="name"
            required
            autoComplete="name"
            placeholder="Full name"
            className={fieldClass}
          />
          {errors.name ? <p className="mt-1 text-xs text-danger">{errors.name}</p> : null}
        </div>

        <div>
          <label
            htmlFor="preorder-phone"
            className="mb-1.5 block text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]"
          >
            WhatsApp / Phone Number *
          </label>
          <input
            id="preorder-phone"
            name="phone"
            type="tel"
            required
            autoComplete="tel"
            placeholder="e.g. 024 000 0000"
            className={fieldClass}
          />
          {errors.phone ? <p className="mt-1 text-xs text-danger">{errors.phone}</p> : null}
        </div>

        <div className="sm:col-span-2">
          <label
            htmlFor="preorder-email"
            className="mb-1.5 block text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]"
          >
            Email Address *
          </label>
          <input
            id="preorder-email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            className={fieldClass}
          />
          {errors.email ? <p className="mt-1 text-xs text-danger">{errors.email}</p> : null}
        </div>

        <div className="sm:col-span-2">
          <label
            htmlFor="preorder-photo"
            className="mb-1.5 block text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]"
          >
            Upload Inspiration Photo / Screenshot (Optional, JPG/PNG/WebP)
          </label>
          <input
            id="preorder-photo"
            name="photoFile"
            type="file"
            accept="image/*"
            className={`${fieldClass} cursor-pointer file:mr-3 file:border-0 file:bg-[#231B12] file:px-3 file:py-1.5 file:text-xs file:font-medium file:uppercase file:tracking-[0.12em] file:text-[#F4E6C8]`}
          />
        </div>

        <div className="sm:col-span-2">
          <span className="mb-2 block text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">
            Request Physical Material Swatches in Accra (Optional)
          </span>
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              "Italian Velvet Swatch Pack",
              "Ivory & Warm Bouclé Fabrics",
              "Calacatta & Travertine Stone Samples",
              "Brushed Brass & Smoked Oak Finishes",
            ].map((swatch) => (
              <label
                key={swatch}
                className="flex cursor-pointer items-center gap-2.5 border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2.5 text-xs transition-colors hover:border-[var(--border-strong)]"
              >
                <input
                  type="checkbox"
                  name="swatchRequest"
                  value={swatch}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                <span>{swatch}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="sm:col-span-2">
          <label
            htmlFor="preorder-notes"
            className="mb-1.5 block text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]"
          >
            Preferred Size, Colour, Dimensions or Notes
          </label>
          <textarea
            id="preorder-notes"
            name="notes"
            rows={3}
            placeholder="Share preferred colours, room dimensions, or when you need it delivered..."
            className={`${fieldClass} resize-y`}
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="mt-6 flex min-h-12 w-full items-center justify-center gap-2 bg-[#231B12] px-6 py-4 text-sm font-medium uppercase tracking-[0.14em] text-[#F4E6C8] transition-colors hover:bg-[#36291B] disabled:opacity-50"
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Clock className="h-4 w-4 text-[#D4AF37]" aria-hidden />
        )}
        {pending ? "Submitting request…" : "Request Pre-Order / Reserve Piece"}
      </button>
    </form>
  );
}
