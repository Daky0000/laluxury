import Link from "next/link";
import { getSettings } from "@/lib/settings";
import { NewsletterForm } from "./newsletter-form";

export async function Footer() {
  const settings = await getSettings();
  const year = new Date().getFullYear();

  return (
    <footer className="mt-24 border-t border-[var(--border-subtle)] bg-[var(--surface-sunken)]">
      <div className="lx-container grid gap-10 py-14 md:grid-cols-4">
        <div className="md:col-span-2">
          <p className="font-display text-2xl">{settings.storeName}</p>
          <p className="mt-2 max-w-sm text-sm text-[var(--text-secondary)]">{settings.tagline}</p>

          <div className="mt-6 max-w-sm">
            <p className="lx-eyebrow mb-2">Join the list</p>
            <NewsletterForm />
          </div>
        </div>

        <nav aria-label="Shop">
          <p className="lx-eyebrow mb-3">Shop</p>
          <ul className="flex flex-col gap-2 text-sm text-[var(--text-secondary)]">
            <li>
              <Link href="/shop" className="hover:text-[var(--text-primary)]">
                All pieces
              </Link>
            </li>
            <li>
              <Link href="/shop?sort=newest" className="hover:text-[var(--text-primary)]">
                New in
              </Link>
            </li>
            <li>
              <Link href="/shop?collection=best-sellers" className="hover:text-[var(--text-primary)]">
                Best sellers
              </Link>
            </li>
            <li>
              <Link href="/orders/track" className="hover:text-[var(--text-primary)]">
                Track an order
              </Link>
            </li>
          </ul>
        </nav>

        <nav aria-label="Help">
          <p className="lx-eyebrow mb-3">Help</p>
          <ul className="flex flex-col gap-2 text-sm text-[var(--text-secondary)]">
            <li>
              <Link href="/contact" className="hover:text-[var(--text-primary)]">
                Contact
              </Link>
            </li>
            <li>
              <Link href="/shipping" className="hover:text-[var(--text-primary)]">
                Shipping
              </Link>
            </li>
            <li>
              <Link href="/returns" className="hover:text-[var(--text-primary)]">
                Returns
              </Link>
            </li>
            <li>
              <Link href="/account" className="hover:text-[var(--text-primary)]">
                Your account
              </Link>
            </li>
          </ul>
        </nav>
      </div>

      <div className="border-t border-[var(--border-subtle)]">
        <div className="lx-container flex flex-col items-start justify-between gap-2 py-5 text-xs text-[var(--text-muted)] sm:flex-row sm:items-center">
          <p>
            © {year} {settings.storeName}. {settings.addressLine}
          </p>
          <p>Secure payment by Paystack · Card & Mobile Money</p>
        </div>
      </div>
    </footer>
  );
}
