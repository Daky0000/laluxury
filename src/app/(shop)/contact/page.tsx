import type { Metadata } from "next";
import { MessageCircle, Mail, Phone, MapPin } from "lucide-react";
import { getSettings } from "@/lib/settings";
import { ContactForm } from "@/components/shop/contact-form";
import { Photo } from "@/components/shop/photo";

export const metadata: Metadata = {
  title: "Contact",
  description: "Questions about an order, a product, or a bulk enquiry. We reply within a day.",
};

/** Digits only, so +233 24 000 0000 becomes a wa.me link. */
function whatsappHref(number: string): string {
  return `https://wa.me/${number.replace(/\D/g, "")}`;
}

export default async function ContactPage() {
  const settings = await getSettings();

  // Four quick channels from the artboard, minus any the owner has left blank.
  const channels = [
    settings.whatsappNumber
      ? {
          icon: MessageCircle,
          label: "WhatsApp",
          value: settings.whatsappNumber,
          href: whatsappHref(settings.whatsappNumber),
        }
      : null,
    settings.supportEmail
      ? {
          icon: Mail,
          label: "Email",
          value: settings.supportEmail,
          href: `mailto:${settings.supportEmail}`,
        }
      : null,
    settings.supportPhone
      ? {
          icon: Phone,
          label: "Call us",
          value: settings.supportPhone,
          href: `tel:${settings.supportPhone.replace(/\s/g, "")}`,
        }
      : null,
    settings.addressLine
      ? { icon: MapPin, label: "Visit", value: settings.addressLine, href: null }
      : null,
  ].filter((channel) => channel !== null);

  // The info column reads from the same settings the policies elsewhere use, so
  // there is only ever one copy of the delivery and returns wording.
  const info = [
    settings.addressLine ? { label: "Showroom", value: settings.addressLine } : null,
    { label: "Delivery", value: settings.shippingPolicy },
    { label: "Returns", value: settings.returnsPolicy },
  ].filter((row) => row !== null);

  const faqs = [
    { q: "How long does delivery take?", a: settings.shippingPolicy },
    {
      q: "How can I pay?",
      a: "Mobile Money (MTN / Telecel), card, or bank transfer and USSD — all at checkout. We do not take cash on delivery: an order is paid for before it leaves us.",
    },
    { q: "What is your returns policy?", a: settings.returnsPolicy },
    {
      q: "Can I order in bulk for a hostel or hotel?",
      a: "Absolutely. We offer wholesale pricing on bedding, blankets and towels for institutions. Use the form above and pick “Wholesale / bulk”, or message us on WhatsApp.",
    },
  ];

  return (
    <>
      {/* Hero */}
      <section className="lx-container pb-2 pt-14 text-center">
        <p className="lx-eyebrow">We&rsquo;re here to help</p>
        <h1 className="mt-3 text-[clamp(2.5rem,6vw,3.875rem)] leading-tight">Get in touch</h1>
        <p className="mx-auto mt-3 max-w-[520px] text-base font-light leading-relaxed text-[var(--text-muted)]">
          Questions about an order, sizing, or wholesale? Reach us any way you like — we usually
          reply within the hour.
        </p>
      </section>

      {/* Quick channels */}
      {channels.length > 0 ? (
        <section className="lx-container pb-2 pt-9">
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {channels.map((channel) => {
              const Icon = channel.icon;
              const body = (
                <>
                  <Icon className="h-6 w-6 text-[var(--accent)]" strokeWidth={1.5} aria-hidden />
                  <span>
                    <span className="block text-sm uppercase tracking-[0.14em] text-[var(--text-muted)]">
                      {channel.label}
                    </span>
                    <span className="mt-1.5 block text-base text-[var(--text-primary)]">
                      {channel.value}
                    </span>
                  </span>
                </>
              );

              return (
                <li key={channel.label}>
                  {channel.href ? (
                    <a
                      href={channel.href}
                      className="flex h-full flex-col gap-3.5 border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-6 py-6 transition-colors hover:border-[var(--border-strong)]"
                    >
                      {body}
                    </a>
                  ) : (
                    <div className="flex h-full flex-col gap-3.5 border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-6 py-6">
                      {body}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {/* Form + info */}
      <section className="lx-container grid items-start gap-10 pb-5 pt-10 lg:grid-cols-[1.3fr_1fr] lg:gap-14">
        <div className="border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-7 sm:p-9">
          <ContactForm />
        </div>

        <div>
          <div className="lx-media mb-6 aspect-[4/3]">
            {/* The showroom shot; swap the file to change it. */}
            <Photo
              src="/catalog/room-living.webp"
              alt="Inside the LaLuxury showroom"
              sizes="(min-width: 1024px) 45vw, 100vw"
            />
          </div>

          <dl className="border-t border-[var(--border-subtle)]">
            {info.map((row) => (
              <div key={row.label} className="border-b border-[var(--border-subtle)] py-4.5">
                <dt className="text-sm uppercase tracking-[0.16em] text-[var(--text-muted)]">
                  {row.label}
                </dt>
                <dd className="mt-1.5 text-base font-light leading-relaxed">{row.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* FAQ */}
      <section className="lx-container max-w-[900px] pb-5 pt-12">
        <h2 className="mb-6 text-center text-[clamp(1.75rem,4vw,2.25rem)]">Common questions</h2>

        <div className="border-t border-[var(--border-subtle)]">
          {faqs.map((faq) => (
            <details key={faq.q} className="group border-b border-[var(--border-subtle)]">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-base marker:hidden [&::-webkit-details-marker]:hidden">
                {faq.q}
                <span
                  aria-hidden
                  className="shrink-0 text-[19px] leading-none text-[var(--accent-hover)]"
                >
                  <span className="group-open:hidden">+</span>
                  <span className="hidden group-open:inline">&minus;</span>
                </span>
              </summary>
              <p className="max-w-[640px] pb-5.5 text-sm font-light leading-relaxed text-[var(--text-secondary)]">
                {faq.a}
              </p>
            </details>
          ))}
        </div>
      </section>
    </>
  );
}
