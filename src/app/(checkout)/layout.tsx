import Link from "next/link";
import { ChevronLeft, ShieldCheck } from "lucide-react";
import { getSettings } from "@/lib/settings";

/**
 * Checkout runs under its own shell.
 *
 * The cart & checkout artboard strips the store navigation back to a wordmark,
 * a way out and a reassurance — nothing on this screen competes with finishing
 * the order, and there is no bag drawer to reopen what you are already paying
 * for.
 */
export default async function CheckoutLayout({ children }: LayoutProps<"/">) {
  const settings = await getSettings();

  return (
    <>
      <header className="border-b border-[var(--border-subtle)] bg-[rgba(244,238,228,0.9)]">
        <div className="lx-container relative flex items-center justify-center py-5">
          <Link
            href="/shop"
            className="absolute left-5 flex items-center gap-1.5 text-sm tracking-[0.06em] text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] md:left-10"
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            <span className="hidden sm:inline">Continue shopping</span>
          </Link>

          <Link href="/" className="flex flex-col items-center leading-none">
            <span className="font-display text-2xl font-medium uppercase tracking-[0.18em] md:text-3xl">
              {settings.storeName}
            </span>
            <span className="mt-1 text-sm uppercase tracking-[0.44em] text-[var(--accent)]">
              Home · Living
            </span>
          </Link>

          <span className="absolute right-5 flex items-center gap-2 text-sm tracking-[0.06em] text-sage-600 md:right-10">
            <ShieldCheck className="h-[15px] w-[15px]" strokeWidth={1.5} aria-hidden />
            <span className="hidden sm:inline">Secure checkout</span>
          </span>
        </div>
      </header>

      <main className="flex-1">{children}</main>
    </>
  );
}
