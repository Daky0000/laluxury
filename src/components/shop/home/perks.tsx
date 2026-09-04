import Link from "next/link";
import { CreditCard, MessageCircle, Sparkles, Truck } from "lucide-react";
import type { StoreSettings } from "@/lib/settings";
import { formatPrice } from "@/lib/money";

/**
 * The four-up promise strip under the hero. It reads the delivery threshold and
 * the WhatsApp number straight from settings, so it never advertises a number
 * the store has since removed.
 */
export function Perks({ settings }: { settings: StoreSettings }) {
  const freeOver = settings.freeShippingThreshold;
  const whatsapp = settings.whatsappNumber.replace(/[^\d]/g, "");

  const perks = [
    {
      icon: Truck,
      title: "Nationwide delivery",
      sub: freeOver ? `Complimentary over ${formatPrice(freeOver)}` : "Accra and nationwide",
      href: "/shop",
    },
    {
      icon: CreditCard,
      title: "Cash on delivery",
      sub: "Pay when it arrives",
      href: "/contact",
    },
    {
      icon: Sparkles,
      title: "Considered quality",
      sub: "Fabrics you can feel",
      href: "/shop",
    },
    {
      icon: MessageCircle,
      title: "Order on WhatsApp",
      sub: "We reply fast",
      href: whatsapp ? `https://wa.me/${whatsapp}` : "/contact",
    },
  ];

  return (
    <section className="border-b border-[var(--border-subtle)]">
      <div className="lx-container grid grid-cols-2 md:grid-cols-4">
        {perks.map(({ icon: Icon, ...perk }) => (
          <Link
            key={perk.title}
            href={perk.href}
            className="flex items-center gap-3.5 border-l border-[var(--border-subtle)] px-5 py-7 [&:nth-child(odd)]:border-l-0 md:[&:nth-child(odd)]:border-l"
          >
            <Icon className="h-5 w-5 shrink-0 text-[var(--accent)]" aria-hidden />
            <span>
              <span className="block text-sm">{perk.title}</span>
              <span className="mt-0.5 block text-sm font-light text-[var(--text-muted)]">
                {perk.sub}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
