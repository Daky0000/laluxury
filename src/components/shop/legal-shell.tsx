import type { ReactNode } from "react";
import Link from "next/link";

/**
 * The frame the three policy pages share: a title, the date the wording last
 * changed, and a rail linking the others.
 *
 * The date is not decoration. A privacy notice has to say when it was last
 * revised, and a visitor has to be able to tell whether what they agreed to is
 * what is on the page now.
 */

export const POLICY_UPDATED = "6 September 2026";

const POLICIES = [
  { href: "/privacy", label: "Privacy notice" },
  { href: "/cookies", label: "Cookie policy" },
  { href: "/terms", label: "Terms of sale" },
] as const;

export function LegalShell({
  title,
  intro,
  current,
  children,
}: {
  title: string;
  intro: string;
  /** Which of the three this is, so it is not linked to itself. */
  current: (typeof POLICIES)[number]["href"];
  children: ReactNode;
}) {
  return (
    <div className="lx-container py-12 sm:py-16">
      <div className="max-w-[68ch]">
        <p className="lx-eyebrow">Legal</p>
        <h1 className="mt-3 text-[clamp(2.25rem,5vw,3.25rem)] leading-tight">{title}</h1>
        <p className="mt-4 text-sm sm:text-base font-light leading-relaxed text-[var(--text-muted)]">
          {intro}
        </p>
        <p className="mt-3 text-xs text-[var(--text-muted)]">Last updated {POLICY_UPDATED}</p>
      </div>

      <nav
        aria-label="Policies"
        className="mt-8 flex flex-wrap gap-x-5 gap-y-2 border-y border-[var(--border-subtle)] py-3 text-sm"
      >
        {POLICIES.map((policy) => (
          <span key={policy.href}>
            {policy.href === current ? (
              <span className="text-[var(--text-primary)]">{policy.label}</span>
            ) : (
              <Link
                href={policy.href}
                className="text-[var(--text-secondary)] underline underline-offset-4 transition-colors hover:text-[var(--accent)]"
              >
                {policy.label}
              </Link>
            )}
          </span>
        ))}
      </nav>

      <div className="lx-prose mt-10">{children}</div>
    </div>
  );
}
