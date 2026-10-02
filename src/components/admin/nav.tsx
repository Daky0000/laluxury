"use client";

import { useState, useMemo, useEffect, useRef, useCallback, useSyncExternalStore } from "react";
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
  BookOpen,
  ExternalLink,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Search,
  Sparkles,
  LogOut,
  Smartphone,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useOverlay } from "@/lib/use-overlay";
import { useAdminNav } from "./admin-nav-context";
import { logoutAction } from "@/app/actions/auth";

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
  smartphone: Smartphone,
} as const;

export type NavItem = {
  href: string;
  label: string;
  icon: string;
  badge?: number;
  group?: string;
  description?: string;
};

const COLLAPSED_GROUPS_STORAGE_KEY = "laluxury_admin_collapsed_groups";

function subscribeCollapsedGroups(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("laluxury:collapsed-groups-change", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("laluxury:collapsed-groups-change", callback);
  };
}

let cachedCollapsedGroupsRaw: string | null = null;
let cachedCollapsedGroups: Record<string, boolean> = {};

function getCollapsedGroupsSnapshot(): Record<string, boolean> {
  if (typeof window === "undefined") return cachedCollapsedGroups;
  try {
    const raw = localStorage.getItem(COLLAPSED_GROUPS_STORAGE_KEY) ?? "{}";
    if (raw !== cachedCollapsedGroupsRaw) {
      cachedCollapsedGroupsRaw = raw;
      cachedCollapsedGroups = JSON.parse(raw);
    }
    return cachedCollapsedGroups;
  } catch {
    return cachedCollapsedGroups;
  }
}

function getServerCollapsedGroupsSnapshot(): Record<string, boolean> {
  return {};
}

export function AdminNav({
  items,
  user,
}: {
  items: NavItem[];
  user: { name: string; role: string; initials: string; email?: string | null };
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const collapsedGroups = useSyncExternalStore(
    subscribeCollapsedGroups,
    getCollapsedGroupsSnapshot,
    getServerCollapsedGroupsSnapshot,
  );

  const { navHidden, toggleNav, toggleHelp } = useAdminNav();
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useOverlay(mobileOpen, () => setMobileOpen(false));

  // Close profile dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setProfileOpen(false);
      }
    }
    if (profileOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [profileOpen]);

  function isActive(href: string): boolean {
    return href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
  }

  // Toggle single group collapsed state
  const toggleGroup = useCallback((groupName: string) => {
    try {
      const current = getCollapsedGroupsSnapshot();
      const next = { ...current, [groupName]: !current[groupName] };
      localStorage.setItem(COLLAPSED_GROUPS_STORAGE_KEY, JSON.stringify(next));
      window.dispatchEvent(new Event("laluxury:collapsed-groups-change"));
    } catch {}
  }, []);

  // Filter items by search query if user types in quick search
  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.group?.toLowerCase().includes(q) ||
        item.description?.toLowerCase().includes(q),
    );
  }, [items, searchQuery]);

  // Group items by category/tab
  const groups = useMemo(() => {
    const map = new Map<string, NavItem[]>();
    for (const item of filteredItems) {
      const g = item.group || "Overview";
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(item);
    }
    return Array.from(map.entries());
  }, [filteredItems]);

  // Check if any item in a group is active
  function isGroupActive(groupItems: NavItem[]): boolean {
    return groupItems.some((item) => isActive(item.href));
  }

  // Sum badges in a group
  function getGroupBadgeCount(groupItems: NavItem[]): number {
    return groupItems.reduce((acc, item) => acc + (item.badge || 0), 0);
  }

  // Expand and focus search when user clicks search in collapsed rail
  function handleCollapsedSearchClick() {
    if (navHidden) {
      toggleNav();
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 150);
    }
  }

  /* -------------------------------------------------------------------------- */
  /* Profile Popup Menu (matches screenshot Anzhelika Spekter card)            */
  /* -------------------------------------------------------------------------- */
  const profilePopover = profileOpen ? (
    <div
      ref={profileMenuRef}
      className={cn(
        "absolute z-50 w-64 rounded-2xl border border-stone-200/90 bg-white p-2.5 shadow-2xl animate-in fade-in-50 zoom-in-95 duration-150 text-xs font-sans",
        navHidden ? "left-[74px] bottom-3" : "left-3 bottom-16",
      )}
    >
      <div className="flex items-center gap-3 p-2 border-b border-stone-100 mb-1.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--accent)] text-xs font-semibold text-white shadow-xs">
          {user.initials}
        </span>
        <div className="min-w-0 flex-1">
          <span className="block truncate font-semibold text-stone-900">{user.name}</span>
          <span className="block truncate text-[11px] text-stone-500">{user.email || user.role}</span>
        </div>
      </div>

      <div className="space-y-0.5">
        <Link
          href="/admin/settings"
          onClick={() => setProfileOpen(false)}
          className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-stone-600 hover:bg-stone-100/80 hover:text-stone-900 transition-colors"
        >
          <Settings className="h-4 w-4 text-stone-400" />
          <span>Account &amp; Store Settings</span>
        </Link>

        <button
          type="button"
          onClick={() => {
            setProfileOpen(false);
            toggleHelp();
          }}
          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-stone-600 hover:bg-stone-100/80 hover:text-stone-900 transition-colors text-left"
        >
          <BookOpen className="h-4 w-4 text-stone-400" />
          <span>Store Help &amp; Glossary</span>
        </button>

        <a
          href="/"
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-between rounded-lg px-2.5 py-2 text-stone-600 hover:bg-stone-100/80 hover:text-stone-900 transition-colors"
        >
          <span className="flex items-center gap-2.5">
            <ExternalLink className="h-4 w-4 text-stone-400" />
            <span>Live Storefront</span>
          </span>
          <span className="text-[10px] text-stone-400">↗</span>
        </a>
      </div>

      <div className="border-t border-stone-100 mt-1.5 pt-1.5">
        <form action={logoutAction}>
          <button
            type="submit"
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-red-600 hover:bg-red-50 transition-colors text-left font-medium"
          >
            <LogOut className="h-4 w-4" />
            <span>Sign Out</span>
          </button>
        </form>
      </div>
    </div>
  ) : null;

  /* -------------------------------------------------------------------------- */
  /* Expanded Sidebar Content                                                  */
  /* -------------------------------------------------------------------------- */
  const expandedSidebar = (
    <div className="flex h-full flex-col font-sans select-none">
      {/* Brand Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <Link href="/admin" className="group flex items-center gap-2.5">
          <div className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-tr from-[var(--accent)] to-[#a84b55] text-white shadow-xs">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-bold tracking-tight text-stone-900">
              Nobel Enclave
            </span>
            <span className="text-[10px] font-semibold tracking-wider uppercase text-stone-400">
              Admin Console
            </span>
          </div>
        </Link>
      </div>

      {/* Quick Search */}
      <div className="px-3 pt-2 pb-2">
        <div className="flex items-center gap-2 rounded-lg border border-stone-200/80 bg-stone-50/80 px-2.5 py-1.5 text-xs text-stone-500 focus-within:border-stone-400 focus-within:bg-white focus-within:text-stone-900 transition-colors">
          <Search className="h-3.5 w-3.5 shrink-0 text-stone-400" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Quick search..."
            className="w-full bg-transparent outline-none placeholder:text-stone-400 text-xs"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="text-stone-400 hover:text-stone-600"
              title="Clear search"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Nav groups with Collapsible Tabs */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3.5 text-xs scrollbar-thin">
        {groups.map(([groupName, groupItems]) => {
          const isGroupHasActive = isGroupActive(groupItems);
          // If searching, keep all expanded; otherwise check collapsedGroups.
          // If the group has the active item and user hasn't explicitly collapsed it, keep open.
          const isCollapsed = searchQuery ? false : (collapsedGroups[groupName] ?? false);
          const badgeCount = getGroupBadgeCount(groupItems);

          return (
            <div key={groupName} className="space-y-1">
              {/* Group Tab Header (Collapsible) */}
              <button
                type="button"
                onClick={() => toggleGroup(groupName)}
                className="flex w-full items-center justify-between px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-stone-400 hover:text-stone-700 transition-colors group/header"
                aria-expanded={!isCollapsed}
              >
                <span className="truncate">{groupName}</span>
                <div className="flex items-center gap-1.5 shrink-0">
                  {isCollapsed && isGroupHasActive && (
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
                  )}
                  {isCollapsed && badgeCount > 0 && (
                    <span className="rounded-full bg-amber-100 px-1.5 py-0.2 text-[10px] font-bold text-amber-900 tabular-nums">
                      {badgeCount}
                    </span>
                  )}
                  <ChevronDown
                    className={cn(
                      "h-3.5 w-3.5 transition-transform duration-200 text-stone-400 group-hover/header:text-stone-600",
                      isCollapsed && "-rotate-90",
                    )}
                  />
                </div>
              </button>

              {/* Group Items */}
              {!isCollapsed && (
                <ul className="space-y-0.5 animate-in fade-in-50 duration-150">
                  {groupItems.map((item) => {
                    const Icon = ICONS[item.icon as keyof typeof ICONS] ?? LayoutDashboard;
                    const active = isActive(item.href);

                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          onClick={() => setMobileOpen(false)}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium transition-colors",
                            active
                              ? "bg-stone-100 text-stone-950 font-semibold shadow-xs"
                              : "text-stone-600 hover:bg-stone-100/70 hover:text-stone-900",
                          )}
                        >
                          <Icon
                            className={cn(
                              "h-4 w-4 shrink-0 transition-colors",
                              active ? "text-stone-950" : "text-stone-400 group-hover:text-stone-700",
                            )}
                            strokeWidth={1.8}
                            aria-hidden
                          />
                          <span className="min-w-0 flex-1 truncate text-[13px]">{item.label}</span>
                          {item.badge ? (
                            <span
                              className={cn(
                                "shrink-0 rounded-full px-1.5 py-0.2 text-[10px] font-bold tabular-nums",
                                active
                                  ? "bg-stone-900 text-white"
                                  : "bg-stone-100 text-stone-600 group-hover:bg-amber-100 group-hover:text-amber-900",
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
              )}
            </div>
          );
        })}
      </div>

      {/* Pro Plan / Store Status Banner (matches screenshot card) */}
      <div className="px-3 pt-2">
        <div className="rounded-xl border border-stone-200/80 bg-stone-50/70 p-3 shadow-xs">
          <div className="flex items-start gap-2.5">
            <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[var(--accent)]/10 text-[var(--accent)]">
              <Sparkles className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="block text-[11px] font-semibold text-stone-900 leading-tight">
                Nobel Enclave Accra
              </span>
              <span className="block text-[10px] text-stone-500 mt-0.5 truncate">
                Store Online · Live Orders
              </span>
            </div>
          </div>
          <a
            href="/"
            target="_blank"
            rel="noreferrer"
            className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg bg-stone-900 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-stone-800 transition-colors shadow-xs"
          >
            <span>Live Storefront</span>
            <ExternalLink className="h-3 w-3 opacity-70" />
          </a>
        </div>
      </div>

      {/* Secondary Bottom Links & User Profile */}
      <div className="border-t border-stone-200/80 p-3 mt-2 space-y-1">
        <Link
          href="/admin/settings"
          onClick={() => setMobileOpen(false)}
          className={cn(
            "flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs transition-colors",
            isActive("/admin/settings")
              ? "bg-stone-100 text-stone-950 font-semibold"
              : "text-stone-600 hover:bg-stone-100/70 hover:text-stone-900 font-medium",
          )}
        >
          <span className="flex items-center gap-2">
            <Settings className="h-3.5 w-3.5 text-stone-400" />
            <span>Store Settings</span>
          </span>
        </Link>

        <button
          type="button"
          onClick={toggleHelp}
          className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs text-stone-600 hover:bg-stone-100/70 hover:text-stone-900 transition-colors font-medium text-left"
        >
          <span className="flex items-center gap-2">
            <BookOpen className="h-3.5 w-3.5 text-stone-400" />
            <span>Help &amp; Support</span>
          </span>
          <span className="text-[10px] text-stone-400">?</span>
        </button>

        {/* User Profile Bar (Click opens Flyout Menu) */}
        <div className="pt-1.5">
          <button
            type="button"
            onClick={() => setProfileOpen((prev) => !prev)}
            className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-stone-100/80 transition-colors text-left"
          >
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--accent)] text-xs font-semibold text-white shadow-xs">
              {user.initials}
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-xs font-semibold text-stone-900">{user.name}</span>
              <span className="block truncate text-[11px] text-stone-500">{user.role}</span>
            </div>
            <ChevronDown className={cn("h-3.5 w-3.5 text-stone-400 transition-transform", profileOpen && "rotate-180")} />
          </button>
        </div>
      </div>
    </div>
  );

  /* -------------------------------------------------------------------------- */
  /* Collapsed Slim Rail Content (matches left side of screenshot)              */
  /* -------------------------------------------------------------------------- */
  const collapsedRail = (
    <div className="flex h-full flex-col items-center justify-between font-sans select-none py-4 px-2">
      {/* Top section: Logo + Search + Icons */}
      <div className="flex flex-col items-center w-full">
        {/* Brand Icon */}
        <Link href="/admin" title="Nobel Enclave Admin Console" className="mb-4">
          <div className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-tr from-[var(--accent)] to-[#a84b55] text-white shadow-xs hover:opacity-90 transition-opacity">
            <Sparkles className="h-4 w-4" />
          </div>
        </Link>

        {/* Quick Search Icon Button */}
        <button
          type="button"
          onClick={handleCollapsedSearchClick}
          title="Quick search (Click to expand)"
          className="grid h-9 w-9 place-items-center rounded-lg text-stone-500 hover:bg-stone-100 hover:text-stone-900 transition-colors mb-2"
        >
          <Search className="h-4 w-4" />
        </button>

        {/* Divider */}
        <div className="w-8 h-px bg-stone-200/80 my-1" />

        {/* Groups Items (Icons only with separator lines) */}
        <div className="flex flex-col items-center gap-1 w-full mt-1 overflow-y-auto max-h-[calc(100vh-280px)] scrollbar-none">
          {groups.map(([groupName, groupItems], idx) => (
            <div key={groupName} className="flex flex-col items-center w-full">
              {idx > 0 && <div className="w-6 h-px bg-stone-200/70 my-1.5" />}
              {groupItems.map((item) => {
                const Icon = ICONS[item.icon as keyof typeof ICONS] ?? LayoutDashboard;
                const active = isActive(item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={`${item.label}${item.badge ? ` (${item.badge})` : ""}`}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative grid h-9 w-9 place-items-center rounded-lg transition-colors",
                      active
                        ? "bg-stone-100 text-stone-950 font-semibold shadow-xs"
                        : "text-stone-500 hover:bg-stone-100/70 hover:text-stone-900",
                    )}
                  >
                    <Icon className="h-4 w-4" strokeWidth={1.8} aria-hidden />
                    {item.badge ? (
                      <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-amber-500 ring-2 ring-white" />
                    ) : null}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Bottom section: Help + Live Store + Settings + Avatar */}
      <div className="flex flex-col items-center gap-2 pt-3 border-t border-stone-200/80 w-full">
        <Link
          href="/admin/settings"
          title="Store Settings"
          className={cn(
            "grid h-8 w-8 place-items-center rounded-lg transition-colors",
            isActive("/admin/settings")
              ? "bg-stone-100 text-stone-950 font-semibold shadow-xs"
              : "text-stone-500 hover:bg-stone-100/70 hover:text-stone-900",
          )}
        >
          <Settings className="h-4 w-4" />
        </Link>

        <button
          type="button"
          onClick={toggleHelp}
          title="Store Help & Glossary"
          className="grid h-8 w-8 place-items-center rounded-lg text-stone-500 hover:bg-stone-100 hover:text-stone-900 transition-colors"
        >
          <BookOpen className="h-4 w-4" />
        </button>

        <a
          href="/"
          target="_blank"
          rel="noreferrer"
          title="Live Storefront ↗"
          className="grid h-8 w-8 place-items-center rounded-lg text-stone-500 hover:bg-stone-100 hover:text-stone-900 transition-colors"
        >
          <ExternalLink className="h-4 w-4" />
        </a>

        {/* User avatar button */}
        <button
          type="button"
          onClick={() => setProfileOpen((prev) => !prev)}
          title={`${user.name} (${user.role})`}
          className="mt-1 grid h-8 w-8 place-items-center rounded-full bg-[var(--accent)] text-xs font-semibold text-white shadow-xs hover:ring-2 hover:ring-stone-300 transition-all"
        >
          {user.initials}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile Menu Open Trigger */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="fixed left-3 top-3 z-30 grid h-10 w-10 place-items-center rounded-lg border border-stone-200 bg-white text-stone-800 shadow-md lg:hidden"
        aria-label="Open navigation menu"
      >
        <Menu className="h-5 w-5" aria-hidden />
      </button>

      {/* Desktop Sidebar Rail (Expandable / Collapsible into slim rail) */}
      <aside
        aria-label="Admin navigation"
        className={cn(
          "relative sticky top-0 h-dvh shrink-0 border-r border-stone-200/80 bg-white transition-[width] duration-200 ease-in-out z-30 select-none",
          navHidden ? "w-[68px]" : "w-[248px]",
          "hidden lg:flex lg:flex-col",
        )}
      >
        {/* Protruding Circular Toggle Button on right border (matches screenshot) */}
        <button
          type="button"
          onClick={toggleNav}
          title={navHidden ? "Expand sidebar (Ctrl+B)" : "Collapse sidebar (Ctrl+B)"}
          aria-label={navHidden ? "Expand sidebar" : "Collapse sidebar"}
          className="absolute -right-3 top-5 z-40 grid h-6 w-6 place-items-center rounded-full border border-stone-200 bg-white text-stone-500 shadow-xs hover:border-stone-400 hover:text-stone-900 hover:bg-stone-50 transition-all"
        >
          {navHidden ? (
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
          )}
        </button>

        {navHidden ? collapsedRail : expandedSidebar}
        {profilePopover}
      </aside>

      {/* Mobile Drawer (always full width when open) */}
      {mobileOpen ? (
        <div
          className="fixed inset-0 z-40 bg-stone-950/40 backdrop-blur-xs lg:hidden animate-in fade-in duration-150"
          onClick={() => setMobileOpen(false)}
          role="presentation"
        >
          <nav
            aria-label="Admin mobile navigation"
            className="flex h-dvh w-[260px] max-w-[85vw] flex-col overflow-hidden bg-white pt-2 pb-0 shadow-2xl animate-in slide-in-from-left duration-200"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex justify-end px-3 pt-2">
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close navigation"
                className="grid h-8 w-8 place-items-center rounded-md text-stone-500 hover:bg-stone-100 hover:text-stone-900"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            {expandedSidebar}
            {profilePopover}
          </nav>
        </div>
      ) : null}
    </>
  );
}
