import Link from "next/link";
import { Search, ShoppingBag, User, Menu } from "lucide-react";
import { db } from "@/lib/db";
import { cartItemCount } from "@/lib/cart";
import { currentUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { isStaff } from "@/lib/auth/rbac";
import { SearchDialog } from "./search-dialog";
import { MobileNav } from "./mobile-nav";

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

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border-subtle)] bg-[var(--surface)]/95 backdrop-blur">
      {settings.announcementBar ? (
        <div className="bg-ink-900 px-4 py-2 text-center text-[11px] tracking-wide text-clay-100">
          {settings.announcementBar}
        </div>
      ) : null}

      <div className="lx-container flex h-16 items-center justify-between gap-6">
        <div className="flex items-center gap-3">
          <MobileNav categories={categories}>
            <Menu className="h-5 w-5" aria-hidden />
          </MobileNav>

          <Link href="/" className="font-display text-xl tracking-tight md:text-2xl">
            {settings.storeName}
          </Link>
        </div>

        <nav aria-label="Categories" className="hidden items-center gap-7 md:flex">
          <Link
            href="/shop"
            className="text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
          >
            All
          </Link>
          {categories.map((category) => (
            <Link
              key={category.slug}
              href={`/shop?category=${category.slug}`}
              className="text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
            >
              {category.name}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-1">
          <SearchDialog>
            <span className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]">
              <Search className="h-[18px] w-[18px]" aria-hidden />
              <span className="sr-only">Search</span>
            </span>
          </SearchDialog>

          <Link
            href={user ? (isStaff(user.role) ? "/admin" : "/account") : "/login"}
            className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
          >
            <User className="h-[18px] w-[18px]" aria-hidden />
            <span className="sr-only">{user ? "Your account" : "Sign in"}</span>
          </Link>

          <Link
            href="/cart"
            className="relative flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
          >
            <ShoppingBag className="h-[18px] w-[18px]" aria-hidden />
            {count > 0 ? (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-clay-700 px-1 text-[10px] font-medium tabular-nums text-white">
                {count}
              </span>
            ) : null}
            <span className="sr-only">
              Bag{count > 0 ? `, ${count} item${count === 1 ? "" : "s"}` : ", empty"}
            </span>
          </Link>
        </div>
      </div>
    </header>
  );
}
