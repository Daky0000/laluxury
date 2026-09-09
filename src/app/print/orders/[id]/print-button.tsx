"use client";

import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-2 rounded-lg bg-[#7a2e3c] px-4 py-2 text-sm text-white"
    >
      <Printer className="h-4 w-4" aria-hidden />
      Print
    </button>
  );
}
