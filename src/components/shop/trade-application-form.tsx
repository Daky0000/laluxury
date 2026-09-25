"use client";

import { useActionState, useState } from "react";
import { CheckCircle2, Copy, Check, Sparkles } from "lucide-react";
import { submitTradeApplicationAction, type TradeFormState } from "@/app/actions/trade";

const INITIAL_STATE: TradeFormState = {
  ok: false,
};

export function TradeApplicationForm() {
  const [state, formAction, isPending] = useActionState(submitTradeApplicationAction, INITIAL_STATE);
  const [copied, setCopied] = useState(false);

  function copyCode() {
    if (!state.discountCode) return;
    navigator.clipboard.writeText(state.discountCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  if (state.ok && state.discountCode) {
    return (
      <div className="rounded-sm border border-[var(--gold)]/40 bg-[#FAF6EF] p-8 shadow-sm">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-[var(--success)]" />
          <div className="flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">
              Trade Membership Approved
            </p>
            <h3 className="mt-1 font-serif text-2xl font-medium text-[var(--text-primary)]">
              Welcome to the LaLuxury Trade Atelier
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
              {state.message} Apply your personal trade privilege code at checkout for an immediate{" "}
              <strong>{state.discountPercent}% trade reduction</strong> across all in-stock pieces and bespoke pre-orders.
            </p>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-sm border border-[var(--border-subtle)] bg-white p-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">
                  Your Active Trade Privilege Code
                </p>
                <p className="mt-1 font-mono text-xl font-bold tracking-wider text-[var(--text-primary)]">
                  {state.discountCode}
                </p>
              </div>
              <button
                type="button"
                onClick={copyCode}
                className="inline-flex items-center gap-2 rounded-sm bg-[var(--text-primary)] px-4 py-2.5 text-xs font-medium uppercase tracking-[0.14em] text-white transition hover:opacity-90"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied to Clipboard" : "Copy Trade Code"}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5 rounded-sm border border-[var(--border-subtle)] bg-white p-6 sm:p-8 shadow-sm">
      <div>
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--gold)]">
          <Sparkles className="h-3.5 w-3.5" /> Instant Trade Accreditation
        </span>
        <h2 className="mt-1 font-serif text-2xl font-medium text-[var(--text-primary)]">
          Apply for a Trade Account
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">
          Verified interior designers, architects, real estate developers, and boutique hoteliers receive an instant{" "}
          <strong>12% Trade Privilege Code</strong>, complimentary finish swatches, and dedicated container scheduling.
        </p>
      </div>

      {state.message && !state.ok ? (
        <div className="rounded-sm border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
          {state.message}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
            Full Name *
          </label>
          <input
            name="name"
            required
            placeholder="e.g. Nana Ama Mensah"
            className="mt-1.5 w-full rounded-sm border border-[var(--border-default)] bg-[var(--surface-page)] px-3.5 py-2.5 text-sm focus:border-[var(--text-primary)] focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
            Studio / Firm Name *
          </label>
          <input
            name="company"
            required
            placeholder="e.g. Studio Akoma Interiors"
            className="mt-1.5 w-full rounded-sm border border-[var(--border-default)] bg-[var(--surface-page)] px-3.5 py-2.5 text-sm focus:border-[var(--text-primary)] focus:outline-none"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
            Discipline *
          </label>
          <select
            name="role"
            defaultValue="Interior Designer"
            className="mt-1.5 w-full rounded-sm border border-[var(--border-default)] bg-[var(--surface-page)] px-3.5 py-2.5 text-sm focus:border-[var(--text-primary)] focus:outline-none"
          >
            <option value="Interior Designer">Interior Designer / Decorator</option>
            <option value="Architect">Architect / Architectural Firm</option>
            <option value="Hospitality / Hotelier">Hospitality / Boutique Hotelier</option>
            <option value="Real Estate Developer">Luxury Real Estate Developer</option>
            <option value="Stylist / Set Designer">Editorial Stylist / Set Designer</option>
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
            Phone / WhatsApp *
          </label>
          <input
            name="phone"
            required
            placeholder="+233 24 000 0000"
            className="mt-1.5 w-full rounded-sm border border-[var(--border-default)] bg-[var(--surface-page)] px-3.5 py-2.5 text-sm focus:border-[var(--text-primary)] focus:outline-none"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
            Business Email *
          </label>
          <input
            type="email"
            name="email"
            required
            placeholder="studio@example.com"
            className="mt-1.5 w-full rounded-sm border border-[var(--border-default)] bg-[var(--surface-page)] px-3.5 py-2.5 text-sm focus:border-[var(--text-primary)] focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
            Website or Instagram Handle
          </label>
          <input
            name="portfolioUrl"
            placeholder="@studioakoma or website"
            className="mt-1.5 w-full rounded-sm border border-[var(--border-default)] bg-[var(--surface-page)] px-3.5 py-2.5 text-sm focus:border-[var(--text-primary)] focus:outline-none"
          />
        </div>
      </div>

      <div>
        <label className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
          Upcoming Project Scope & Timeline
        </label>
        <textarea
          name="projectScope"
          rows={3}
          placeholder="Tell us about your active residential or hospitality projects, target hand-over date, or custom finish requirements..."
          className="mt-1.5 w-full rounded-sm border border-[var(--border-default)] bg-[var(--surface-page)] px-3.5 py-2.5 text-sm focus:border-[var(--text-primary)] focus:outline-none"
        />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-sm bg-[var(--text-primary)] px-6 py-3.5 text-xs font-semibold uppercase tracking-[0.18em] text-white transition hover:opacity-90 disabled:opacity-50"
      >
        {isPending ? "Generating Trade Credentials..." : "Unlock 12% Trade Privilege Code"}
      </button>
    </form>
  );
}
