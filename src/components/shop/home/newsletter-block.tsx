import type { StoreSettings } from "@/lib/settings";
import { NewsletterForm } from "@/components/shop/newsletter-form";

/** The email sign-up at the foot of the home page. */
export function NewsletterBlock({ settings }: { settings: StoreSettings }) {
  return (
    <section className="border-t border-[var(--border-subtle)]">
      <div className="mx-auto max-w-[640px] px-5 py-20 text-center md:px-10">
        <h2 className="text-[2.5rem] leading-tight">{settings.newsletterTitle}</h2>
        <p className="mb-8 mt-3.5 text-base font-light text-[var(--text-muted)]">
          {settings.newsletterBody}
        </p>
        <NewsletterForm variant="inline" />
      </div>
    </section>
  );
}
