"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Package,
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
  inventory: Boxes,
  customers: Users,
  discounts: Ticket,
  agent: Bot,
  users: UserCog,
  activity: ScrollText,
  settings: Settings,
} as const;

export type NavItem = { href: string; label: string; icon: string };

export function AdminNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  /** /admin only matches exactly; the rest match their subtree. */
  function isActive(href: string): boolean {
    return href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
  }

  const links = (
    <ul className="flex flex-col gap-0.5">
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
                "flex items-center gap-2.5 rounded-[--radius-card] px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-ink-900 text-white"
                  : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden />
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed left-4 top-4 z-30 flex h-8 w-8 items-center justify-center rounded-[--radius-card] border border-[var(--border-subtle)] bg-[var(--surface-raised)] lg:hidden"
        aria-label="Open admin menu"
      >
        <Menu className="h-4 w-4" aria-hidden />
      </button>

      <nav
        aria-label="Admin"
        className="hidden w-56 shrink-0 flex-col border-r border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4 lg:flex"
      >
        <Link href="/admin" className="mb-6 block px-3 font-display text-xl">
          LaLuxury
          <span className="ml-1.5 align-middle text-[10px] uppercase tracking-widest text-[var(--text-muted)]">
            Admin
          </span>
        </Link>
        {links}
      </nav>

      {open ? (
        <div
          className="fixed inset-0 z-40 bg-ink-950/40 lg:hidden"
          onClick={() => setOpen(false)}
          role="presentation"
        >
          <nav
            aria-label="Admin"
            className="h-full w-64 bg-[var(--surface-raised)] p-4"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-6 flex items-center justify-between px-3">
              <span className="font-display text-xl">Admin</span>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close menu">
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            {links}
          </nav>
        </div>
      ) : null}
    </>
  );
}
