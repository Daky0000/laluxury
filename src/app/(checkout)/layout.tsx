import Link from "next/link";
import { ChevronLeft, ShieldCheck } from "lucide-react";
import { SiteShell } from "@/components/shop/site-shell";

/**
 * Checkout keeps the store's header — the same one every other page carries —
 * and puts what the cart & checkout artboard asked of its own bar underneath
 * it instead: a way back to the catalogue on one side, the security
 * reassurance on the other. The reassurance was the point of that bar; a second
 * header was only ever how it got there.
 */
export default function CheckoutLayout({ children }: LayoutProps<"/">) {
  return (
    <SiteShell>
      <div className="border-b border-[var(--border-subtle)] bg-[var(--surface-sunken)]">
        <div className="lx-container flex items-center justify-between gap-3 py-2.5 text-sm tracking-[0.06em]">
          <Link
            href="/shop"
            className="flex items-center gap-1.5 text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
          >
            <ChevronLeft className="h-4 w-4 shrink-0" strokeWidth={1.5} aria-hidden />
            Continue shopping
          </Link>

          <span className="flex items-center gap-2 text-sage-600">
            <ShieldCheck className="h-[15px] w-[15px] shrink-0" strokeWidth={1.5} aria-hidden />
            <span className="hidden sm:inline">Secure checkout</span>
            <span className="sm:hidden">Secure</span>
          </span>
        </div>
      </div>

      {children}
    </SiteShell>
  );
}
