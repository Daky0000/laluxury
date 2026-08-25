import type { Metadata } from "next";
import { Mail, Phone, MapPin } from "lucide-react";
import { getSettings } from "@/lib/settings";
import { ContactForm } from "@/components/shop/contact-form";
import { Card } from "@/components/ui";

export const metadata: Metadata = {
  title: "Contact",
  description: "Questions about an order, a product, or a bulk enquiry. We reply within a day.",
};

export default async function ContactPage() {
  const settings = await getSettings();

  return (
    <div className="lx-container max-w-4xl py-14">
      <h1 className="text-3xl md:text-4xl">Get in touch</h1>
      <p className="mt-2 max-w-prose text-[var(--text-secondary)]">
        Questions about an order, a product, or a bulk enquiry. We reply within one business day.
      </p>

      <div className="mt-10 grid gap-10 md:grid-cols-[1fr_16rem]">
        <ContactForm />

        <aside className="flex flex-col gap-4">
          <Card className="flex flex-col gap-3 p-5 text-sm">
            {settings.supportEmail ? (
              <a
                href={`mailto:${settings.supportEmail}`}
                className="flex items-center gap-2.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                <Mail className="h-4 w-4 shrink-0" aria-hidden />
                <span className="truncate">{settings.supportEmail}</span>
              </a>
            ) : null}

            {settings.supportPhone ? (
              <a
                href={`tel:${settings.supportPhone}`}
                className="flex items-center gap-2.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                <Phone className="h-4 w-4 shrink-0" aria-hidden />
                {settings.supportPhone}
              </a>
            ) : null}

            {settings.addressLine ? (
              <p className="flex items-center gap-2.5 text-[var(--text-secondary)]">
                <MapPin className="h-4 w-4 shrink-0" aria-hidden />
                {settings.addressLine}
              </p>
            ) : null}
          </Card>

          <Card className="p-5">
            <h2 className="lx-eyebrow mb-2">Delivery</h2>
            <p className="text-sm text-[var(--text-secondary)]">{settings.shippingPolicy}</p>
          </Card>

          <Card className="p-5">
            <h2 className="lx-eyebrow mb-2">Returns</h2>
            <p className="text-sm text-[var(--text-secondary)]">{settings.returnsPolicy}</p>
          </Card>
        </aside>
      </div>
    </div>
  );
}
