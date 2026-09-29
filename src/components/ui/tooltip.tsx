"use client";

import { useState } from "react";
import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export function InfoTooltip({
  content,
  className,
  size = 14,
}: {
  content: string;
  className?: string;
  size?: number;
}) {
  const [open, setOpen] = useState(false);

  return (
    <span
      className={cn("group relative inline-flex items-center align-middle ml-1", className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="inline-flex cursor-help items-center justify-center text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
        aria-label="More information"
      >
        <HelpCircle style={{ width: size, height: size }} />
      </button>

      {/* Tooltip Popup */}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 rounded-lg bg-ink-950 px-3 py-1.5 text-xs font-normal normal-case tracking-normal text-white shadow-xl ring-1 ring-white/10 transition-all duration-150 min-w-[180px] max-w-[260px] text-center leading-snug",
          open
            ? "visible opacity-100 scale-100"
            : "invisible opacity-0 scale-95",
        )}
      >
        {content}
        <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-ink-950" />
      </span>
    </span>
  );
}
