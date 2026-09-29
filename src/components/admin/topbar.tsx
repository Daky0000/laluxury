"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { Search, Store, PanelLeftOpen, PanelLeftClose, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAdminNav } from "./admin-nav-context";

/**
 * Console topbar: clear context of where the staff member is,
 * beginner-friendly plain language descriptions, global search, and instant access
 * to the step-by-step Store Guide & Glossary.
 */
const TITLES: { prefix: string; title: string; subtitle: string; search?: string }[] = [
  {
    prefix: "/admin/orders/new",
    title: "In-Store Sale (POS Register)",
    subtitle: "Create a direct order for walk-in showroom customers and print receipts",
  },
  {
    prefix: "/admin/orders",
    title: "Customer Orders",
    subtitle: "View, pack, ship, and manage all customer purchases",
    search: "/admin/orders",
  },
  {
    prefix: "/admin/products/bulk",
    title: "Quick Price & Stock Editor",
    subtitle: "Mass-update prices, exchange rates, and stock levels across multiple items",
  },
  {
    prefix: "/admin/products/new",
    title: "Add New Product",
    subtitle: "Add a new luxury furniture or decor item to your online catalog",
  },
  {
    prefix: "/admin/products",
    title: "Product Catalog",
    subtitle: "View and edit products, images, stock, and variations",
    search: "/admin/products",
  },
  {
    prefix: "/admin/categories",
    title: "Categories & Rooms",
    subtitle: "Organize items into rooms (Living Room, Bedroom, Dining) and collections",
  },
  {
    prefix: "/admin/carts",
    title: "Unfinished Orders (Abandoned Carts)",
    subtitle: "Shoppers who left items in their cart — reach out via WhatsApp to finish the sale",
  },
  {
    prefix: "/admin/inventory",
    title: "Stock & Inventory",
    subtitle: "Monitor physical stock on hand, reserved orders, and reorder warnings",
  },
  {
    prefix: "/admin/customers",
    title: "Customer Directory",
    subtitle: "Your shoppers, contact details, delivery addresses, and order history",
    search: "/admin/customers",
  },
  {
    prefix: "/admin/discounts",
    title: "Promo Codes & Discounts",
    subtitle: "Create coupons and special promotional discounts for marketing campaigns",
  },
  {
    prefix: "/admin/reviews",
    title: "Customer Reviews",
    subtitle: "Read customer feedback and approve reviews before they display on your website",
  },
  {
    prefix: "/admin/agent",
    title: "AI Store Assistant",
    subtitle: "Ask AI to help you write descriptions, analyze stock, or plan promotions",
  },
  {
    prefix: "/admin/users",
    title: "Team & Staff Accounts",
    subtitle: "Manage staff logins and decide who can view or edit store data",
  },
  {
    prefix: "/admin/activity",
    title: "Store Activity Log",
    subtitle: "Audit log of every change, order status update, and price edit",
  },
  {
    prefix: "/admin/settings/delivery",
    title: "Delivery Rates & Zones",
    subtitle: "Set up shipping prices and delivery areas across Greater Accra and regions",
  },
  {
    prefix: "/admin/settings/home",
    title: "Homepage Layout",
    subtitle: "Customize homepage banners, featured products, and room lookbooks",
  },
  {
    prefix: "/admin/settings",
    title: "Store Settings",
    subtitle: "Configure online payments (Paystack), SMS notices, store info, and policies",
  },
  {
    prefix: "/admin/analytics",
    title: "Sales & Profit Reports",
    subtitle: "Total sales, cash collected, cost of goods, and profit margins",
  },
  {
    prefix: "/admin/preorders",
    title: "Pre-Orders & Sourcing",
    subtitle: "Manage custom furniture commissions, deposit payments, and arrival dates",
  },
  {
    prefix: "/admin/shipments",
    title: "Shipments & Freight Containers",
    subtitle: "Track sea & air freight shipments and automatically notify customers",
  },
  {
    prefix: "/admin/media",
    title: "Photo & Media Library",
    subtitle: "Upload and organize product photos, swatches, and showroom pictures",
  },
  {
    prefix: "/admin",
    title: "Store Dashboard",
    subtitle: "Welcome back! Here is a simple overview of what needs your attention today",
  },
];

export function AdminTopbar() {
  const pathname = usePathname();
  const { navHidden, toggleNav, toggleHelp } = useAdminNav();
  const match = TITLES.find((entry) => pathname.startsWith(entry.prefix)) ?? TITLES[TITLES.length - 1];

  return (
    <header className="sticky top-0 z-20 border-b border-[var(--border-subtle)] bg-[color-mix(in_srgb,var(--surface-raised)_96%,transparent)] px-4 py-3 backdrop-blur-md sm:px-6 lg:px-8 lg:py-3.5">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
        {/* Title & Page Description */}
        <div className="flex items-center gap-3 min-w-0 pl-12 lg:pl-0 flex-1">
          {navHidden ? (
            <button
              type="button"
              onClick={toggleNav}
              title="Show navigation sidebar (Ctrl+B)"
              aria-label="Show navigation"
              className="hidden lg:grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] text-[var(--text-secondary)] transition-colors hover:border-[var(--color-clay-700)] hover:text-[var(--text-primary)] shadow-xs"
            >
              <PanelLeftOpen className="h-4 w-4" aria-hidden />
            </button>
          ) : null}
          <div className="min-w-0">
            <h1 className="font-display text-xl font-semibold leading-tight sm:text-2xl text-[var(--text-primary)]">
              {match.title}
            </h1>
            <p className="text-xs text-[var(--text-muted)] line-clamp-1 mt-0.5">{match.subtitle}</p>
          </div>
        </div>

        {/* Right tools: Search, Beginner Guide button, View Storefront, Toggle Sidebar */}
        <div className="flex items-center gap-2.5 sm:ml-auto">
          {/* Quick Search */}
          {match.search ? (
            <form
              method="get"
              action={match.search}
              className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3 py-1.5 sm:w-[220px] sm:flex-none shadow-xs"
            >
              <label htmlFor="admin-search" className="sr-only">
                Search {match.title.toLowerCase()}
              </label>
              <Search className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" aria-hidden />
              <input
                id="admin-search"
                name="q"
                type="search"
                placeholder="Search..."
                className="w-full min-w-0 bg-transparent text-xs outline-none placeholder:text-[var(--text-muted)]"
              />
              <button type="submit" className="sr-only">
                Search
              </button>
            </form>
          ) : null}

          {/* Quick Help & Beginner Guide Button */}
          <button
            type="button"
            onClick={toggleHelp}
            className="flex items-center gap-1.5 rounded-lg border border-amber-300/40 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-500/20 transition-colors shadow-xs"
            title="Open Step-by-Step Store Guides & Glossary"
          >
            <BookOpen className="h-3.5 w-3.5 text-amber-700" />
            <span className="hidden sm:inline">Beginner Guide</span>
          </button>

          {/* View Live Storefront */}
          <Link
            href="/"
            target="_blank"
            rel="noreferrer"
            title="Preview Live Online Store"
            className="flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--color-clay-700)] transition-colors shadow-xs"
          >
            <Store className="h-3.5 w-3.5" strokeWidth={1.7} aria-hidden />
            <span className="hidden md:inline">Live Store</span>
          </Link>

          {/* Sidebar Toggle button */}
          <button
            type="button"
            onClick={toggleNav}
            title={navHidden ? "Show navigation sidebar (Ctrl+B)" : "Hide navigation sidebar (Ctrl+B)"}
            aria-label={navHidden ? "Show navigation sidebar" : "Hide navigation sidebar"}
            className={cn(
              "grid h-8 w-8 shrink-0 place-items-center rounded-lg border transition-colors shadow-xs",
              navHidden
                ? "border-[var(--color-clay-700)] bg-[var(--color-clay-700)] text-white"
                : "border-[var(--border-subtle)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
            )}
          >
            {navHidden ? (
              <PanelLeftOpen className="h-4 w-4" strokeWidth={1.8} aria-hidden />
            ) : (
              <PanelLeftClose className="h-4 w-4" strokeWidth={1.8} aria-hidden />
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
