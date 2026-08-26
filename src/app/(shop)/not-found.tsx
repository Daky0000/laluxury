import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, MessageCircle } from "lucide-react";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { LinkButton } from "@/components/ui";

export const metadata: Metadata = {
  title: "Page not found",
  description: "That page has moved or sold out. Browse the rooms instead.",
  robots: { index: false },
};

/**
 * The storefront 404, rendered inside the shop chrome so someone who lands here
 * still has the header, the search and the bag.
 *
 * Both reads are allowed to fail. This page is already what a broken request
 * fell back to, and a 404 that throws its own error turns a wrong turn into a
 * dead end — so a missing database costs the visitor a shorter list of links
 * rather than a second error page.
 */
async function rooms() {
  try {
    return await db.category.findMany({
      where: { isActive: true, parentId: null },
      orderBy: { position: "asc" },
      select: { name: true, slug: true, description: true },
      take: 4,
    });
  } catch {
    return [];
  }
}

async function whatsapp() {
  try {
    const { whatsappNumber } = await getSettings();
    return whatsappNumber ?? null;
  } catch {
    return null;
  }
}

export default async function ShopNotFound() {
  const [categories, number] = await Promise.all([rooms(), whatsapp()]);

  return (
    <div className="lx-container py-16 sm:py-24">
      <div className="mx-auto max-w-[560px] text-center">
        <p className="lx-eyebrow">Error 404</p>

        <h1 className="mt-3 text-[clamp(2.5rem,6vw,3.875rem)] leading-tight">
          We can&rsquo;t find that page
        </h1>

        <p className="mx-auto mt-4 max-w-[460px] text-[15.5px] font-light leading-relaxed text-[var(--text-muted)]">
          The link may be out of date, or the piece may have been renamed as our range changed.
          Everything we stock is still one of the rooms below.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <LinkButton href="/shop" size="lg">
            Browse everything
          </LinkButton>
          <LinkButton href="/" variant="secondary" size="lg">
            Back to home
          </LinkButton>
        </div>
      </div>

      {categories.length > 0 ? (
        <div className="mx-auto mt-14 grid max-w-[900px] gap-px border border-[var(--border-subtle)] bg-[var(--border-subtle)] sm:grid-cols-2">
          {categories.map((category) => (
            <Link
              key={category.slug}
              href={`/shop?category=${category.slug}`}
              className="group flex flex-col gap-1.5 bg-[var(--surface)] p-6 transition-colors hover:bg-[var(--surface-sunken)]"
            >
              <span className="flex items-center gap-2 text-[15px] text-[var(--text-primary)]">
                {category.name}
                <ArrowRight
                  className="h-3.5 w-3.5 -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100"
                  aria-hidden
                />
              </span>
              {category.description ? (
                <span className="text-[13px] font-light leading-relaxed text-[var(--text-muted)]">
                  {category.description}
                </span>
              ) : null}
            </Link>
          ))}
        </div>
      ) : null}

      {number ? (
        <p className="mt-10 text-center text-[13.5px] text-[var(--text-muted)]">
          Looking for something specific?{" "}
          <a
            href={`https://wa.me/${number.replace(/\D/g, "")}`}
            className="inline-flex items-center gap-1.5 text-[var(--text-primary)] underline underline-offset-4 hover:text-[var(--accent)]"
          >
            <MessageCircle className="h-3.5 w-3.5" aria-hidden />
            Ask us on WhatsApp
          </a>
        </p>
      ) : null}
    </div>
  );
}
