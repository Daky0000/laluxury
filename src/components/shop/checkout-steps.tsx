import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/** The four stages a shopper moves through, shown on checkout and confirmation. */
export const CHECKOUT_STEPS = ["Delivery", "Payment", "Approve", "Receipt"] as const;

export function CheckoutSteps({ current }: { current: number }) {
  return (
    <ol className="mb-8 flex items-center gap-2 sm:gap-3" aria-label="Checkout progress">
      {CHECKOUT_STEPS.map((label, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <li key={label} className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
            <span
              aria-current={active ? "step" : undefined}
              className={cn(
                "grid h-7 w-7 shrink-0 place-items-center rounded-full border text-xs font-medium tabular-nums",
                done && "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)]",
                active && "border-[var(--accent)] text-[var(--accent)]",
                !done && !active && "border-[var(--border-strong)] text-[var(--text-muted)]",
              )}
            >
              {done ? <Check className="h-3.5 w-3.5" aria-hidden /> : index + 1}
            </span>
            <span
              className={cn(
                "truncate text-xs uppercase tracking-[0.12em] sm:text-sm",
                active ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]",
                !active && "max-sm:sr-only",
              )}
            >
              {label}
            </span>
            {index < CHECKOUT_STEPS.length - 1 ? (
              <span aria-hidden className="h-px min-w-3 flex-1 bg-[var(--border-subtle)]" />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
