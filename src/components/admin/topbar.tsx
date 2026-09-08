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
  { prefix: "/admin/reviews", title: "Reviews", subtitle: "What customers wrote, before it shows" },
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
    <header className="sticky top-0 z-10 border-b border-[var(--border-subtle)] bg-[color-mix(in_srgb,var(--surface-raised)_92%,transparent)] px-5 py-3 backdrop-blur lg:px-8 lg:py-4">
      {/*
        Title on the first row, search and the storefront link on the second,
        until there is room for both on one. The search box used to be a fixed
        240px and the row `flex-wrap`, which on a phone put it on a line of its
        own anyway — 240px plus the 38px button being wider than the screen.
      */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
        {/* The rail's own trigger is fixed at the top-left corner below `lg`,
            so the title starts clear of it. */}
        <div className="min-w-0 pl-12 lg:pl-0">
          <h1 className="font-display text-2xl font-medium leading-none sm:text-[28px]">
            {match.title}
          </h1>
          <p className="mt-1 text-xs text-[var(--text-muted)]">{match.subtitle}</p>
        </div>

        <div className="flex items-center gap-3 sm:ml-auto">
          {match.search ? (
            <form
              method="get"
              action={match.search}
              className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3.5 py-2 sm:w-[240px] sm:flex-none sm:py-2.5"
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
            className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] sm:h-[38px] sm:w-[38px]"
          >
            <Store className="h-[17px] w-[17px]" strokeWidth={1.6} aria-hidden />
            <span className="sr-only">View storefront</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
