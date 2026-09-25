import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser, displayName } from "@/lib/auth";
import { can, isStaff, permissionsFor, ROLE_LABELS, type Permission } from "@/lib/auth/rbac";
import { logoutAction } from "@/app/actions/auth";
import { AdminNav } from "@/components/admin/nav";
import { AdminTopbar } from "@/components/admin/topbar";
import { initials } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** Nav is filtered by permission, so staff never see a link they cannot open. */
const NAV: { href: string; label: string; icon: string; permission: Permission }[] = [
  { href: "/admin", label: "Dashboard", icon: "dashboard", permission: "dashboard:view" },
  { href: "/admin/analytics", label: "Financials & Margins", icon: "analytics", permission: "dashboard:view" },
  { href: "/admin/orders/new", label: "Showroom POS", icon: "pos", permission: "orders:write" },
  { href: "/admin/orders", label: "Orders", icon: "orders", permission: "orders:read" },
  { href: "/admin/preorders", label: "Pre-orders & Trade", icon: "preorders", permission: "orders:read" },
  { href: "/admin/shipments", label: "Containers & Freight", icon: "shipments", permission: "orders:read" },
  { href: "/admin/carts", label: "Abandoned bags", icon: "carts", permission: "orders:read" },
  { href: "/admin/products", label: "Products", icon: "products", permission: "products:read" },
  { href: "/admin/products/bulk", label: "Bulk FX & Matrix", icon: "products", permission: "products:write" },
  { href: "/admin/categories", label: "Categories", icon: "categories", permission: "products:read" },
  { href: "/admin/media", label: "Media", icon: "media", permission: "products:read" },
  { href: "/admin/inventory", label: "Inventory", icon: "inventory", permission: "inventory:read" },
  { href: "/admin/customers", label: "Customers", icon: "customers", permission: "customers:read" },
  { href: "/admin/discounts", label: "Discounts", icon: "discounts", permission: "discounts:read" },
  { href: "/admin/reviews", label: "Reviews", icon: "reviews", permission: "reviews:moderate" },
  { href: "/admin/agent", label: "AI agent", icon: "agent", permission: "agent:use" },
  { href: "/admin/users", label: "Staff", icon: "users", permission: "users:manage" },
  { href: "/admin/activity", label: "Activity", icon: "activity", permission: "settings:manage" },
  { href: "/admin/settings", label: "Settings", icon: "settings", permission: "settings:manage" },
];

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const user = await currentUser();

  if (!user) redirect("/login");
  if (!isStaff(user.role)) redirect("/account");

  // The counts beside Orders, Pre-orders, and Reviews are what is actually waiting on
  // someone, so the rail says whether there is work without opening anything.
  const [openOrders, pendingReviews, openPreorderRequests, openPreorderOrders] = await Promise.all([
    db.order.count({ where: { status: { in: ["PAID", "PROCESSING"] } } }),
    db.review.count({ where: { isApproved: false } }),
    db.preorderRequest.count({ where: { status: { in: ["NEW", "QUOTED", "SOURCING"] } } }),
    db.order.count({
      where: {
        hasPreorderItems: true,
        status: { in: ["PENDING", "PAID", "PROCESSING"] },
      },
    }),
  ]);

  const badges: Record<string, number> = {
    "/admin/orders": openOrders,
    "/admin/preorders": openPreorderRequests + openPreorderOrders,
    "/admin/reviews": pendingReviews,
  };

  const permissions = permissionsFor(user.role);
  const items = NAV.filter((item) => can(user.role, item.permission)).map((item) => ({
    ...item,
    badge: badges[item.href] || undefined,
  }));
  const name = displayName(user);

  return (
    <div data-theme="admin" className="flex min-h-screen bg-[var(--surface)]">
      <AdminNav
        items={items}
        user={{ name, role: ROLE_LABELS[user.role], initials: initials(name) }}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <AdminTopbar />

        <main className="min-w-0 flex-1 px-5 pb-11 pt-7 lg:px-8">{children}</main>

        <footer className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[var(--border-subtle)] px-5 py-3 text-xs text-[var(--text-muted)] lg:px-8">
          <span>
            Signed in as {name} · {permissions.length} permissions
          </span>
          <form action={logoutAction} className="ml-auto">
            <button type="submit" className="underline-offset-4 hover:underline">
              Sign out
            </button>
          </form>
        </footer>
      </div>
    </div>
  );
}
