import { redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { currentUser, displayName } from "@/lib/auth";
import { can, isStaff, permissionsFor, ROLE_LABELS, type Permission } from "@/lib/auth/rbac";
import { logoutAction } from "@/app/actions/auth";
import { AdminNav, type NavItem } from "@/components/admin/nav";
import { AdminTopbar } from "@/components/admin/topbar";
import { AdminNavProvider } from "@/components/admin/admin-nav-context";
import { AdminHelpModal } from "@/components/admin/admin-help-modal";
import { getSettings } from "@/lib/settings";
import { initials } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Navigation is grouped logically with clear plain-language labels and helpful
 * descriptions designed for beginners and experienced store operators alike.
 * Filtered by permission, so staff never see a link they cannot open.
 */
const NAV: {
  href: string;
  label: string;
  shortLabel?: string;
  icon: string;
  permission: Permission;
  group: string;
  description: string;
}[] = [
  // --- Overview ---
  {
    href: "/admin",
    label: "Dashboard",
    icon: "dashboard",
    permission: "dashboard:view",
    group: "Overview",
    description: "Store activity, alerts & today's summary",
  },
  {
    href: "/admin/analytics",
    label: "Sales & Profits",
    icon: "analytics",
    permission: "dashboard:view",
    group: "Overview",
    description: "Revenue, profit margins & financial reports",
  },

  // --- Orders ---
  {
    href: "/admin/orders",
    label: "Orders",
    icon: "orders",
    permission: "orders:read",
    group: "Orders",
    description: "Pack, ship & manage customer purchases",
  },
  {
    href: "/admin/carts",
    label: "Unfinished Orders",
    icon: "carts",
    permission: "orders:read",
    group: "Orders",
    description: "Abandoned shopping carts ready for follow-up",
  },
  {
    href: "/admin/orders/new",
    label: "In-Store Sale (POS)",
    icon: "pos",
    permission: "orders:write",
    group: "Orders",
    description: "Cash register for showroom & walk-in sales",
  },
  {
    href: "/admin/preorders",
    label: "Pre-Orders & Sourcing",
    icon: "preorders",
    permission: "orders:read",
    group: "Orders",
    description: "Custom orders, deposits & arrivals",
  },
  {
    href: "/admin/shipments",
    label: "Shipments & Freight",
    icon: "shipments",
    permission: "orders:read",
    group: "Orders",
    description: "Shipping containers & delivery milestones",
  },

  // --- Catalog & Inventory ---
  {
    href: "/admin/products",
    label: "Products",
    icon: "products",
    permission: "products:read",
    group: "Catalog & Inventory",
    description: "Manage products, prices & photos",
  },
  {
    href: "/admin/inventory",
    label: "Stock & Inventory",
    icon: "inventory",
    permission: "inventory:read",
    group: "Catalog & Inventory",
    description: "Track on-hand stock & low inventory alerts",
  },
  {
    href: "/admin/categories",
    label: "Categories",
    icon: "categories",
    permission: "products:read",
    group: "Catalog & Inventory",
    description: "Organize items into rooms & collections",
  },
  {
    href: "/admin/products/bulk",
    label: "Quick Price Editor",
    icon: "bulk",
    permission: "products:write",
    group: "Catalog & Inventory",
    description: "Bulk change prices or update stock levels",
  },
  {
    href: "/admin/media",
    label: "Photo Library",
    icon: "media",
    permission: "products:read",
    group: "Catalog & Inventory",
    description: "Upload & browse product images",
  },

  // --- Customers ---
  {
    href: "/admin/customers",
    label: "Customers",
    icon: "customers",
    permission: "customers:read",
    group: "Customers",
    description: "Shopper directory & purchase history",
  },
  {
    href: "/admin/reviews",
    label: "Customer Reviews",
    icon: "reviews",
    permission: "reviews:moderate",
    group: "Customers",
    description: "Check & approve customer ratings & feedback",
  },
  {
    href: "/admin/discounts",
    label: "Promo Codes & Deals",
    icon: "discounts",
    permission: "discounts:read",
    group: "Customers",
    description: "Discount coupons & promotional offers",
  },

  // --- Settings & Tools ---
  {
    href: "/admin/settings",
    label: "Store Settings",
    icon: "settings",
    permission: "settings:manage",
    group: "Settings & Tools",
    description: "Payments, shipping fees & store info",
  },
  {
    href: "/app",
    label: "Mobile App",
    icon: "smartphone",
    permission: "dashboard:view",
    group: "Settings & Tools",
    description: "Download Android app for stock & showroom photos",
  },
  {
    href: "/admin/agent",
    label: "AI Store Assistant",
    icon: "agent",
    permission: "agent:use",
    group: "Settings & Tools",
    description: "Ask AI for store help, advice & copy",
  },
  {
    href: "/admin/users",
    label: "Team & Staff",
    icon: "users",
    permission: "users:manage",
    group: "Settings & Tools",
    description: "Staff accounts & access permissions",
  },
  {
    href: "/admin/activity",
    label: "Store Audit Log",
    icon: "activity",
    permission: "settings:manage",
    group: "Settings & Tools",
    description: "Timeline of changes made to the store",
  },
];

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  let user = null;
  try {
    user = await currentUser();
  } catch {
    user = null;
  }

  if (!user) redirect("/login");
  if (!isStaff(user.role)) redirect("/account");

  // Counts of action items waiting for staff attention (safe against DB hiccups)
  const [openOrders, pendingReviews, openPreorderRequests, openPreorderOrders, settings] =
    await Promise.all([
      db.order.count({ where: { status: { in: ["PAID", "PROCESSING"] } } }).catch(() => 0),
      db.review.count({ where: { isApproved: false } }).catch(() => 0),
      db.preorderRequest
        .count({ where: { status: { in: ["NEW", "QUOTED", "SOURCING"] } } })
        .catch(() => 0),
      db.order
        .count({
          where: {
            hasPreorderItems: true,
            status: { in: ["PENDING", "PAID", "PROCESSING"] },
          },
        })
        .catch(() => 0),
      getSettings().catch(() => ({})),
    ]);

  const badges: Record<string, number> = {
    "/admin/orders": openOrders,
    "/admin/preorders": openPreorderRequests + openPreorderOrders,
    "/admin/reviews": pendingReviews,
  };

  const hiddenAdminNav = new Set(settings.hiddenAdminNavItems ?? []);
  const permissions = permissionsFor(user.role);
  const items: NavItem[] = NAV.filter(
    (item) => can(user.role, item.permission) && !hiddenAdminNav.has(item.href),
  ).map((item) => ({
    ...item,
    badge: badges[item.href] || undefined,
  }));
  const name = displayName(user);

  return (
    <AdminNavProvider defaultHidden={settings.hideAdminNav}>
      <div data-theme="admin" className="flex min-h-screen bg-[var(--surface)]">
        <AdminNav
          items={items}
          user={{ name, role: ROLE_LABELS[user.role], initials: initials(name), email: user.email }}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <AdminTopbar />

          <main className="min-w-0 flex-1 px-4 pb-12 pt-6 sm:px-6 lg:px-8">{children}</main>

          <footer className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[var(--border-subtle)] bg-[var(--surface-raised)]/60 px-5 py-3 text-xs text-[var(--text-muted)] lg:px-8">
            <span className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
              <span>Signed in as <strong>{name}</strong> ({ROLE_LABELS[user.role]})</span>
              <span>· {permissions.length} store permissions</span>
            </span>

            <div className="ml-auto flex items-center gap-4">
              <Link
                href="/admin/settings"
                className="hover:text-[var(--text-primary)] transition-colors underline-offset-4 hover:underline"
              >
                Store Settings
              </Link>
              <a
                href="/"
                target="_blank"
                rel="noreferrer"
                className="hover:text-[var(--text-primary)] transition-colors underline-offset-4 hover:underline"
              >
                View Online Store ↗
              </a>
              <form action={logoutAction}>
                <button type="submit" className="text-red-700 underline-offset-4 hover:underline">
                  Sign out
                </button>
              </form>
            </div>
          </footer>
        </div>

        {/* Global Beginner Help Modal / Glossary */}
        <AdminHelpModal />
      </div>
    </AdminNavProvider>
  );
}
