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
  { href: "/admin/orders", label: "Orders", icon: "orders", permission: "orders:read" },
  { href: "/admin/products", label: "Products", icon: "products", permission: "products:read" },
  { href: "/admin/inventory", label: "Inventory", icon: "inventory", permission: "inventory:read" },
  { href: "/admin/customers", label: "Customers", icon: "customers", permission: "customers:read" },
  { href: "/admin/discounts", label: "Discounts", icon: "discounts", permission: "discounts:read" },
  { href: "/admin/agent", label: "AI agent", icon: "agent", permission: "agent:use" },
  { href: "/admin/users", label: "Staff", icon: "users", permission: "users:manage" },
  { href: "/admin/activity", label: "Activity", icon: "activity", permission: "settings:manage" },
  { href: "/admin/settings", label: "Settings", icon: "settings", permission: "settings:manage" },
];

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const user = await currentUser();

  if (!user) redirect("/login");
  if (!isStaff(user.role)) redirect("/account");

  // The count beside Orders is what is actually waiting on someone, so the rail
  // says whether there is work without opening anything.
  const openOrders = await db.order.count({
    where: { status: { in: ["PAID", "PROCESSING"] } },
  });

  const permissions = permissionsFor(user.role);
  const items = NAV.filter((item) => can(user.role, item.permission)).map((item) => ({
    ...item,
    badge: item.href === "/admin/orders" && openOrders > 0 ? openOrders : undefined,
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
            Signed in as {user.email} · {permissions.length} permissions
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
