import Link from "next/link";
import { MessageCircle, ShieldCheck, Sparkles, Truck } from "lucide-react";
import type { StoreSettings } from "@/lib/settings";
import { formatPrice } from "@/lib/money";
import { cn } from "@/lib/utils";

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
      sub: freeOver ? `Free to your station over ${formatPrice(freeOver)}` : "Accra and nationwide",
      href: "/shop",
    },
    {
      icon: ShieldCheck,
      title: "Secure payment",
      sub: "MTN, Telecel, AirtelTigo, card",
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
      {/*
        One per row on a phone, two on a small tablet, four across from `md`.
        Two-up on a 360px screen gave each promise about 140px, which is not
        enough for "Free to your station over GHS 300" at the type floor.

        The rules between them are drawn per cell rather than with `nth-child`:
        a left border on every cell but the first of its row, plus a top border
        on every row but the first. The old odd/even rule left a stray line down
        the container's left edge once the grid went to four columns, because
        the first cell is odd and had its border put back.
      */}
      <div className="lx-container grid sm:grid-cols-2 md:grid-cols-4">
        {perks.map(({ icon: Icon, ...perk }, index) => (
          <Link
            key={perk.title}
            href={perk.href}
            className={cn(
              "flex items-center gap-3.5 px-1 py-5 sm:px-5 sm:py-7",
              index > 0 && "border-t border-[var(--border-subtle)] sm:border-t-0",
              index % 2 === 1 && "sm:border-l sm:border-[var(--border-subtle)]",
              index >= 2 && "sm:border-t sm:border-[var(--border-subtle)] md:border-t-0",
              index % 4 !== 0 && "md:border-l md:border-[var(--border-subtle)]",
              index % 4 === 0 && "md:border-l-0",
            )}
          >
            <Icon className="h-5 w-5 shrink-0 text-[var(--accent)]" aria-hidden />
            <span className="min-w-0">
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
