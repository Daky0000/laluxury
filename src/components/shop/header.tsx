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
import { CurrencySwitcher } from "./currency-switcher";
import { FrontendNavProvider } from "./frontend-nav-context";
import { CategoryNav, FrontendNavToggle } from "./category-nav";

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
    <FrontendNavProvider defaultHidden={settings.hideStorefrontNav}>
      {/* Announcement marquee. The list is duplicated so the loop has no seam. */}
      {announcements.length > 0 ? (
        <div className="overflow-hidden whitespace-nowrap bg-ink-900 text-xs uppercase tracking-[0.2em] text-ink-400 sm:tracking-[0.28em]">
          <div className="lx-marquee py-2.5 sm:py-3">
            {[0, 1].map((run) => (
              <span
                key={run}
                className="flex shrink-0 gap-8 pr-8 sm:gap-16 sm:pr-16"
                aria-hidden={run === 1}
              >
                {announcements.map((item, index) => (
                  <span key={`${run}-${index}`} className="flex shrink-0 gap-8 sm:gap-16">
                    <span>{item}</span>
                    <span>—</span>
                  </span>
                ))}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <header className="sticky top-0 z-30 border-b border-[var(--border-subtle)] bg-[color-mix(in_srgb,var(--surface)_88%,transparent)] backdrop-blur-md">
        <div className="lx-container flex items-center gap-3 py-3.5 sm:py-4 md:gap-8">
          <Link href="/" className="mr-auto min-w-0 leading-none">
            <span className="font-display text-[clamp(1.125rem,4.5vw,1.375rem)] font-light uppercase tracking-[0.18em] sm:text-[1.5rem] sm:tracking-[0.22em] md:text-[1.625rem]">
              {settings.storeName}
            </span>
          </Link>

          {/* Right: the menu, then currency, search, account and the bag. */}
          <CategoryNav categories={categories} />

          {/* `shrink-0` so a long store name never eats into the controls. */}
          <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
            <FrontendNavToggle />

            <CurrencySwitcher />

            <SearchDialog>
              <span className="lx-tap-tight text-[var(--text-secondary)] transition-colors hover:text-[var(--accent)]">
                <Search className="h-[19px] w-[19px]" strokeWidth={1.5} aria-hidden />
                <span className="sr-only">Search</span>
              </span>
            </SearchDialog>

            <Link
              href={user ? (isStaff(user.role) ? "/admin" : "/account") : "/login"}
              className="lx-tap-tight text-[var(--text-secondary)] transition-colors hover:text-[var(--accent)]"
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
    </FrontendNavProvider>
  );
}
