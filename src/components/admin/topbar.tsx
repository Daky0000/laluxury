"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { Search, Store } from "lucide-react";

/**
 * The console topbar from the admin artboard: where you are, what this screen
 * is for, and a search that lands on whichever list you are looking at.
 *
 * The title is derived from the path rather than passed down, so a new admin
 * page picks up the bar by existing — add a row here to name it.
 */
const TITLES: { prefix: string; title: string; subtitle: string; search?: string }[] = [
  { prefix: "/admin/orders", title: "Orders", subtitle: "Manage and fulfil customer orders", search: "/admin/orders" },
  { prefix: "/admin/products", title: "Products", subtitle: "Inventory, images and variations", search: "/admin/products" },
  { prefix: "/admin/inventory", title: "Inventory", subtitle: "Stock levels and reorder points" },
  { prefix: "/admin/customers", title: "Customers", subtitle: "Your shoppers and their history", search: "/admin/customers" },
  { prefix: "/admin/discounts", title: "Discounts", subtitle: "Promo codes and offers" },
  { prefix: "/admin/agent", title: "AI agent", subtitle: "Ask it to run the shop with you" },
  { prefix: "/admin/users", title: "Staff", subtitle: "Who can get in, and how far" },
  { prefix: "/admin/activity", title: "Activity", subtitle: "Every change, and who made it" },
  { prefix: "/admin/settings", title: "Settings", subtitle: "Store configuration" },
  { prefix: "/admin", title: "Dashboard", subtitle: "Overview of your store today" },
];

export function AdminTopbar() {
  const pathname = usePathname();
  const match = TITLES.find((entry) => pathname.startsWith(entry.prefix)) ?? TITLES[TITLES.length - 1];

  return (
    <header className="sticky top-0 z-10 border-b border-[var(--border-subtle)] bg-[rgba(252,251,248,0.92)] px-5 py-4 backdrop-blur lg:px-8">
      <div className="flex flex-wrap items-center gap-4 pl-12 lg:pl-0">
        <div>
          <h1 className="font-display text-[28px] font-medium leading-none">{match.title}</h1>
          <p className="mt-1 text-xs text-[var(--text-muted)]">{match.subtitle}</p>
        </div>

        <div className="ml-auto flex items-center gap-3">
          {match.search ? (
            <form
              method="get"
              action={match.search}
              className="flex w-[240px] items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3.5 py-2.5"
            >
              <label htmlFor="admin-search" className="sr-only">
                Search {match.title.toLowerCase()}
              </label>
              <Search className="h-[15px] w-[15px] shrink-0 text-[var(--text-muted)]" aria-hidden />
              <input
                id="admin-search"
                name="q"
                type="search"
                placeholder="Search…"
                className="w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-[var(--text-muted)]"
              />
              <button type="submit" className="sr-only">
                Search
              </button>
            </form>
          ) : null}

          <Link
            href="/"
            title="View storefront"
            className="grid h-[38px] w-[38px] place-items-center rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
          >
            <Store className="h-[17px] w-[17px]" strokeWidth={1.6} aria-hidden />
            <span className="sr-only">View storefront</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
