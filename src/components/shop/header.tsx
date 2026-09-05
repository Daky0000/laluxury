import Link from "next/link";
import { Search, User, Menu } from "lucide-react";
import { db } from "@/lib/db";
import { cartItemCount } from "@/lib/cart";
import { currentUser } from "@/lib/auth";
import { announcementItems, getSettings } from "@/lib/settings";
import { isStaff } from "@/lib/auth/rbac";
import { SearchDialog } from "./search-dialog";
import { MobileNav } from "./mobile-nav";
import { BagButton } from "./bag-button";

export async function Header() {
  const [settings, count, user, categories] = await Promise.all([
    getSettings(),
    cartItemCount(),
    currentUser(),
    db.category.findMany({
      where: { isActive: true, parentId: null },
      orderBy: { position: "asc" },
      select: { name: true, slug: true },
    }),
  ]);

  const announcements = announcementItems(settings);

  return (
    <>
      {/* Announcement marquee. The list is duplicated so the loop has no seam. */}
      {announcements.length > 0 ? (
        <div className="overflow-hidden whitespace-nowrap border-b border-[var(--border-subtle)] text-sm uppercase tracking-[0.28em] text-[var(--text-muted)]">
          <div className="lx-marquee py-2.5">
            {[0, 1].map((run) => (
              <span key={run} className="flex shrink-0 gap-16 pr-16" aria-hidden={run === 1}>
                {announcements.map((item, index) => (
                  <span key={`${run}-${index}`} className="flex shrink-0 gap-16">
                    <span>{item}</span>
                    <span>—</span>
                  </span>
                ))}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <header className="sticky top-0 z-30 border-b border-[var(--border-subtle)] bg-[rgba(244,238,228,0.85)] backdrop-blur-md">
        <div className="lx-container flex items-center gap-4 py-4 md:gap-10 md:py-5">
          {/* Left: the wordmark, and nothing else. */}
          <Link href="/" className="mr-auto leading-none">
            <span className="font-display text-2xl font-medium uppercase tracking-[0.18em] md:text-3xl">
              {settings.storeName}
            </span>
          </Link>

          {/* Right: the menu, then search, account and the bag. */}
          <nav
            aria-label="Categories"
            className="hidden items-center gap-7 text-sm tracking-[0.06em] md:flex"
          >
            {categories.map((category) => (
              <Link
                key={category.slug}
                href={`/shop?category=${category.slug}`}
                className="text-[var(--text-secondary)] transition-colors hover:text-[var(--accent)]"
              >
                {category.name}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-4 sm:gap-5">
            <SearchDialog>
              <span className="grid place-items-center text-[var(--text-secondary)] transition-colors hover:text-[var(--accent)]">
                <Search className="h-[19px] w-[19px]" strokeWidth={1.5} aria-hidden />
                <span className="sr-only">Search</span>
              </span>
            </SearchDialog>

            <Link
              href={user ? (isStaff(user.role) ? "/admin" : "/account") : "/login"}
              className="grid place-items-center text-[var(--text-secondary)] transition-colors hover:text-[var(--accent)]"
            >
              <User className="h-[19px] w-[19px]" strokeWidth={1.5} aria-hidden />
              <span className="sr-only">{user ? "Your account" : "Sign in"}</span>
            </Link>

            <BagButton count={count} />

            {/* The categories collapse into this on a phone, so the menu keeps
                the same side of the header at every width. */}
            <MobileNav categories={categories}>
              <Menu className="h-5 w-5" aria-hidden />
            </MobileNav>
          </div>
        </div>
      </header>
    </>
  );
}
