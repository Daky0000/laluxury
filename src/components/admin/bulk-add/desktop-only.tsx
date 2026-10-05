import type { ReactNode } from "react";
import Link from "next/link";
import { Monitor } from "lucide-react";

/**
 * Bulk Product Add is web-admin only and laid out for a computer. Below the
 * lg breakpoint the tool is hidden and a short note is shown instead — a width
 * rule, not browser sniffing.
 */
export function DesktopOnly({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="flex flex-col items-center gap-3 rounded-(--radius-card) border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-8 text-center lg:hidden">
        <Monitor className="h-8 w-8 text-[var(--text-secondary)]" aria-hidden />
        <p className="text-sm font-medium">Bulk Product Add is currently optimized for desktop.</p>
        <p className="text-sm text-[var(--text-secondary)]">Open Noble Enclave Admin on a computer to continue.</p>
      </div>
      <div className="hidden lg:block">{children}</div>
    </>
  );
}

export function BulkAddNav({ active }: { active: "add" | "history" | "recipes" | "options" | "settings" }) {
  const links = [
    { key: "add", href: "/admin/products/bulk-add", label: "Bulk Product Add" },
    { key: "history", href: "/admin/products/bulk-add/history", label: "Import History" },
    { key: "recipes", href: "/admin/products/recipes", label: "Product Recipes" },
    { key: "options", href: "/admin/products/options", label: "Option Library" },
    { key: "settings", href: "/admin/products/bulk-add/settings", label: "AI Settings" },
  ] as const;
  return (
    <nav className="flex flex-wrap gap-1 border-b border-[var(--border-subtle)] text-sm">
      {links.map((l) => (
        <Link
          key={l.key}
          href={l.href}
          className={`-mb-px border-b-2 px-3 py-2 ${active === l.key ? "border-[var(--accent)] text-[var(--text-primary)]" : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
