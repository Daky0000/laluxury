import { Download } from "lucide-react";

/**
 * A CSV download button. It is a plain anchor on purpose: the address is a
 * route handler that answers with an attachment, and a client-side navigation
 * to it would try to render the spreadsheet as a page.
 */
export function ExportLink({ href, label = "Export CSV" }: { href: string; label?: string }) {
  return (
    <a
      href={href}
      className="inline-flex items-center gap-2 rounded-(--radius-card) border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--surface-sunken)]"
    >
      <Download className="h-4 w-4" aria-hidden />
      {label}
    </a>
  );
}
