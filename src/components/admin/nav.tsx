"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  Images,
  ShoppingCart,
  Boxes,
  Users,
  Ticket,
  Settings,
  Bot,
  UserCog,
  ScrollText,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ICONS = {
  dashboard: LayoutDashboard,
  orders: ShoppingCart,
  products: Package,
  media: Images,
  inventory: Boxes,
  customers: Users,
  discounts: Ticket,
  agent: Bot,
  users: UserCog,
  activity: ScrollText,
  settings: Settings,
} as const;

export type NavItem = { href: string; label: string; icon: string; badge?: number };

/**
 * The console rail from the admin artboard: the wordmark over "Admin console",
 * nav rows that take a wine edge when active, a count on anything waiting, and
 * whoever is signed in at the foot.
 */
export function AdminNav({
  items,
  user,
}: {
  items: NavItem[];
  user: { name: string; role: string; initials: string };
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  /** /admin only matches exactly; the rest match their subtree. */
  function isActive(href: string): boolean {
    return href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
  }

  const rail = (
    <>
      <div className="flex flex-col border-b border-white/8 px-6 pb-6">
        <Link href="/admin" className="font-display text-[26px] font-medium uppercase leading-none tracking-[0.16em] text-[#f5f4ef]">
          LaLuxury
        </Link>
        <span className="mt-1 text-sm uppercase tracking-[0.34em] text-[#85827a]">
          Admin console
        </span>
      </div>

      <ul className="flex flex-1 flex-col gap-1 px-4 py-4.5">
        {items.map((item) => {
          const Icon = ICONS[item.icon as keyof typeof ICONS] ?? LayoutDashboard;
          const active = isActive(item.href);

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={() => setOpen(false)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-r-lg border-l-[3px] px-4 py-2.5 text-sm transition-colors",
                  active
                    ? "border-[var(--color-clay-700)] bg-white/9 text-[#f5f4ef]"
                    : "border-transparent text-[#b6b3aa] hover:bg-white/5 hover:text-[#f5f4ef]",
                )}
              >
                <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.6} aria-hidden />
                {item.label}
                {item.badge ? (
                  <span className="ml-auto rounded-full bg-[var(--color-clay-700)] px-2 py-0.5 text-sm text-white tabular-nums">
                    {item.badge}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="flex items-center gap-3 border-t border-white/8 px-5 pt-4">
        <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full bg-[var(--color-clay-700)] text-sm font-semibold text-white">
          {user.initials}
        </span>
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-sm text-[#f5f4ef]">{user.name}</span>
          <span className="block text-sm text-[#85827a]">{user.role}</span>
        </span>
      </div>
    </>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed left-4 top-4 z-30 grid h-9 w-9 place-items-center rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] lg:hidden"
        aria-label="Open admin menu"
      >
        <Menu className="h-4 w-4" aria-hidden />
      </button>

      <nav
        aria-label="Admin"
        className="adm-rail sticky top-0 hidden h-screen w-[236px] shrink-0 flex-col py-6.5 lg:flex"
      >
        {rail}
      </nav>

      {open ? (
        <div
          className="fixed inset-0 z-40 bg-ink-950/50 lg:hidden"
          onClick={() => setOpen(false)}
          role="presentation"
        >
          <nav
            aria-label="Admin"
            className="adm-rail flex h-full w-[264px] flex-col py-6.5"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close menu"
              className="mb-2 self-end px-6 text-[#b6b3aa]"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
            {rail}
          </nav>
        </div>
      ) : null}
    </>
  );
}
