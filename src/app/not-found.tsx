import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false },
};

/**
 * The last-resort 404, for a URL that matches no route group at all — so it
 * renders without the shop header, which lives in the (shop) layout.
 *
 * Deliberately free of data: Next prerenders this one at build time, and an
 * error page that needs a database is an error page that can fail when the
 * database is the thing that broke. The richer 404, with the rooms and the
 * search, is `(shop)/not-found.tsx` and covers every storefront route.
 */
export default function NotFound() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-24 text-center">
      <div className="max-w-[420px]">
        <p className="lx-eyebrow">Error 404</p>

        <h1 className="mt-3 text-[clamp(2.25rem,6vw,3.25rem)] leading-tight">
          We can&rsquo;t find that page
        </h1>

        <p className="mt-4 text-base font-light leading-relaxed text-[var(--text-muted)]">
          The link may be out of date. Everything we stock is still on the storefront.
        </p>

        <Link
          href="/"
          className="mt-8 inline-flex items-center justify-center rounded-(--radius-card) border border-transparent bg-[var(--accent)] px-6 py-3.5 text-sm font-medium tracking-wide text-[var(--accent-contrast)] transition-colors hover:bg-ink-800"
        >
          Back to LaLuxury
        </Link>
      </div>
    </main>
  );
}
