"use client";

import { Printer } from "lucide-react";

export function PrintInvoiceButton({ label = "Print / Save as PDF" }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-2 bg-[var(--accent)] px-5 py-2.5 text-xs font-medium uppercase tracking-[0.14em] text-[var(--accent-contrast)] print:hidden"
    >
      <Printer className="h-4 w-4" aria-hidden />
      {label}
    </button>
  );
}
