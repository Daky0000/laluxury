"use client";

import { useState, useMemo } from "react";
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
  Star,
  FolderTree,
  ShoppingBag,
  Clock,
  Ship,
  TrendingUp,
  Calculator,
  Layers,
  Menu,
  X,
  PanelLeftClose,
  BookOpen,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useOverlay } from "@/lib/use-overlay";
import { useAdminNav } from "./admin-nav-context";

const ICONS = {
  dashboard: LayoutDashboard,
  analytics: TrendingUp,
  pos: Calculator,
  orders: ShoppingCart,
  preorders: Clock,
  shipments: Ship,
  products: Package,
  categories: FolderTree,
  carts: ShoppingBag,
  media: Images,
  inventory: Boxes,
  bulk: Layers,
  customers: Users,
  discounts: Ticket,
  reviews: Star,
  agent: Bot,
  users: UserCog,
  activity: ScrollText,
  settings: Settings,
} as const;

export type NavItem = {
  href: string;
  label: string;
  icon: string;
  badge?: number;
  group?: string;
  description?: string;
};

/**
 * Modern, clean, uncluttered Admin Navigation Rail.
 * Single-line crisp links with icons, grouped by section for instant clarity.
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
  const { navHidden, toggleNav, toggleHelp } = useAdminNav();

  useOverlay(open, () => setOpen(false));

  function isActive(href: string): boolean {
    return href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
  }

  // Group items by category
  const groups = useMemo(() => {
    const map = new Map<string, NavItem[]>();
    for (const item of items) {
      const g = item.group || "Store";
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(item);
    }
    return Array.from(map.entries());
  }, [items]);

  const rail = (
    <div className="flex h-full flex-col font-sans">
      {/* Brand & Console Header */}
      <div className="flex items-center justify-between border-b border-white/10 px-5 pb-4 pt-1">
        <Link href="/admin" className="group flex flex-col">
          <span className="text-xl font-bold tracking-tight text-white">
            LaLuxury
          </span>
          <span className="text-[11px] font-medium tracking-wider uppercase text-[#a8a398] group-hover:text-white transition-colors">
            Admin Console
          </span>
        </Link>
        <button
          type="button"
          onClick={toggleNav}
          title="Hide sidebar (Ctrl+B)"
          aria-label="Hide sidebar"
          className="hidden lg:grid h-7 w-7 place-items-center rounded-md text-[#9e9a91] hover:bg-white/10 hover:text-white transition-colors"
        >
          <PanelLeftClose className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {/* Nav groups and links */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4 text-xs scrollbar-thin">
        {groups.map(([groupName, groupItems]) => (
          <div key={groupName} className="space-y-0.5">
            <h3 className="px-2.5 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[#8a857b]">
              {groupName}
            </h3>
            <ul className="space-y-0.5">
              {groupItems.map((item) => {
                const Icon = ICONS[item.icon as keyof typeof ICONS] ?? LayoutDashboard;
                const active = isActive(item.href);

                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium transition-colors",
                        active
                          ? "bg-[var(--accent)] text-white shadow-xs"
                          : "text-[#c2beb4] hover:bg-white/8 hover:text-white",
                      )}
                    >
                      <Icon
                        className={cn(
                          "h-4 w-4 shrink-0 transition-colors",
                          active ? "text-white" : "text-[#9e9a91] group-hover:text-white",
                        )}
                        strokeWidth={1.8}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1 truncate text-[13px]">{item.label}</span>
                      {item.badge ? (
                        <span
                          className={cn(
                            "shrink-0 rounded-full px-1.5 py-0.2 text-[10px] font-bold tabular-nums",
                            active ? "bg-white text-[var(--accent)]" : "bg-amber-400 text-ink-950",
                          )}
                        >
                          {item.badge}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      {/* Guide button & User profile */}
      <div className="border-t border-white/10 p-3 bg-black/20 space-y-2">
        <button
          type="button"
          onClick={toggleHelp}
          className="flex w-full items-center justify-between rounded-lg border border-amber-400/20 bg-amber-400/10 px-2.5 py-1.5 text-xs font-medium text-amber-300 hover:bg-amber-400/20 transition-colors"
        >
          <span className="flex items-center gap-2">
            <BookOpen className="h-3.5 w-3.5" />
            <span>Store Help &amp; Glossary</span>
          </span>
          <span className="text-[10px] text-amber-300/80">?</span>
        </button>

        <a
          href="/"
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs text-[#b8b4aa] hover:bg-white/8 hover:text-white transition-colors"
        >
          <span className="flex items-center gap-2">
            <ExternalLink className="h-3.5 w-3.5 text-amber-300" />
            <span>Live Storefront</span>
          </span>
          <span className="text-[10px] text-[#7d7970]">↗</span>
        </a>

        <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 bg-white/5">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--accent)] text-xs font-semibold text-white">
            {user.initials}
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-xs font-medium text-white">{user.name}</span>
            <span className="block text-[11px] text-[#8c887f]">{user.role}</span>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed left-3 top-3 z-30 grid h-10 w-10 place-items-center rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] shadow-md lg:hidden"
        aria-label="Open navigation menu"
      >
        <Menu className="h-5 w-5 text-[var(--text-primary)]" aria-hidden />
      </button>

      <nav
        aria-label="Admin navigation"
        className={cn(
          "adm-rail sticky top-0 h-dvh w-[236px] shrink-0 overflow-hidden pt-4 pb-0 bg-ink-950",
          navHidden ? "hidden" : "hidden lg:flex lg:flex-col",
        )}
      >
        {rail}
      </nav>

      {open ? (
        <div
          className="fixed inset-0 z-40 bg-ink-950/60 backdrop-blur-sm lg:hidden animate-in fade-in duration-150"
          onClick={() => setOpen(false)}
          role="presentation"
        >
          <nav
            aria-label="Admin mobile navigation"
            className="adm-rail flex h-dvh w-[260px] max-w-[85vw] flex-col overflow-hidden bg-ink-950 pt-4 pb-0 shadow-2xl animate-in slide-in-from-left duration-200"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex justify-end px-3 pb-1">
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close navigation"
                className="grid h-8 w-8 place-items-center rounded-md text-[#9e9a91] hover:bg-white/10 hover:text-white"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            {rail}
          </nav>
        </div>
      ) : null}
    </>
  );
}
