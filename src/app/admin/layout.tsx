import { redirect } from "next/navigation";
import Link from "next/link";
import { Store } from "lucide-react";
import { currentUser, displayName } from "@/lib/auth";
import { can, isStaff, permissionsFor, ROLE_LABELS, type Permission } from "@/lib/auth/rbac";
import { logoutAction } from "@/app/actions/auth";
import { AdminNav } from "@/components/admin/nav";
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

  const permissions = permissionsFor(user.role);
  const items = NAV.filter((item) => can(user.role, item.permission));
  const name = displayName(user);

  return (
    <div data-theme="admin" className="flex min-h-screen bg-[var(--surface)]">
      <AdminNav items={items} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-[var(--border-subtle)] bg-[var(--surface-raised)] px-5">
          <div className="lg:hidden" />

          <Link
            href="/"
            className="hidden items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] sm:flex"
          >
            <Store className="h-4 w-4" aria-hidden />
            View storefront
          </Link>

          <div className="ml-auto flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm leading-tight">{name}</p>
              <p className="text-xs text-[var(--text-muted)]">{ROLE_LABELS[user.role]}</p>
            </div>

            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink-900 text-xs font-medium text-white">
              {initials(name)}
            </span>

            <form action={logoutAction}>
              <button
                type="submit"
                className="text-xs text-[var(--text-secondary)] underline-offset-4 hover:underline"
              >
                Sign out
              </button>
            </form>
          </div>
        </header>

        <main className="min-w-0 flex-1 p-5 lg:p-8">{children}</main>

        <footer className="border-t border-[var(--border-subtle)] px-5 py-3 text-xs text-[var(--text-muted)]">
          Signed in as {user.email} · {permissions.length} permissions
        </footer>
      </div>
    </div>
  );
}
