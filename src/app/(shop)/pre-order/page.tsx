import type { Metadata } from "next";
import Link from "next/link";
import { Clock, ShieldCheck, Sparkles, Truck } from "lucide-react";
import { searchProducts } from "@/lib/catalog";
import { toTile } from "@/lib/product-view";
import { ProductTile } from "@/components/shop/product-tile";
import { PreorderRequestForm } from "@/components/shop/preorder-request-form";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Pre-Order & Bespoke Sourcing",
  description:
    "Pieces not currently on the shelf that we order, tailor or source specially for you. Reserve yours online or request a custom pre-order.",
};

const STEPS = [
  {
    step: "01",
    icon: Sparkles,
    title: "Reserve Your Piece",
    body: "Select any pre-order piece in your preferred size and colour, or tell us what you want sourced. Check out easily as a guest or with your account.",
  },
  {
    step: "02",
    icon: ShieldCheck,
    title: "Ordered & Quality-Inspected",
    body: "We place your order directly with our partner ateliers, handle importation and customs, and inspect every detail upon arrival in Accra.",
  },
  {
    step: "03",
    icon: Truck,
    title: "Delivered to Your Door",
    body: "Once your pre-order arrives (typically 10–21 days), our dispatch team contacts you immediately for same-day Accra or nationwide delivery.",
  },
];

export default async function PreorderPage({
  searchParams,
}: {
  searchParams: Promise<{ room?: string }>;
}) {
  const { room } = await searchParams;
  const result = await searchProducts({
    preorderOnly: true,
    categorySlugs: room ? [room] : undefined,
    perPage: 48,
  });

  const tiles = result.items.map(toTile);

  return (
    <div className="lx-container py-12 sm:py-16">
      {/* Hero Banner */}
      <section className="relative overflow-hidden border border-amber-900/25 bg-[#231B12] px-8 py-14 text-[#F4E6C8] sm:px-14 sm:py-20">
        <div className="max-w-3xl">
          <p className="inline-flex items-center gap-2 border border-amber-700/40 bg-amber-950/50 px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-[#D4AF37]">
            <Clock className="h-3.5 w-3.5" aria-hidden />
            Pre-Order &amp; Bespoke Sourcing
          </p>
          <h1 className="mt-4 text-[clamp(2.25rem,5vw,3.5rem)] leading-[1.06] text-white">
            Not on the shelf yet — ordered specially for you.
          </h1>
          <p className="mt-4 max-w-2xl text-sm sm:text-base font-light leading-relaxed text-[#E2D4B7]">
            Some of our finest pieces — oversized Moroccan wool carpets, 800-thread-count hotel
            trousseaus, motorised window systems and custom drapery — are brought in or tailored to
            your exact specifications. Reserve yours below or ask our concierge team to source a
            specific piece for your home.
          </p>
          <div className="mt-7 flex flex-wrap gap-3.5">
            <a
              href="#preorder-catalog"
              className="inline-flex min-h-12 items-center justify-center bg-[#D4AF37] px-6 py-3.5 text-xs font-medium uppercase tracking-[0.16em] text-[#1D160E] transition-colors hover:bg-[#E5C354]"
            >
              Browse Pre-Order Pieces ({result.total})
            </a>
            <a
              href="#custom-request"
              className="inline-flex min-h-12 items-center justify-center border border-[#D4AF37]/50 px-6 py-3.5 text-xs font-medium uppercase tracking-[0.16em] text-[#F4E6C8] transition-colors hover:bg-white/10"
            >
              Request Custom Item Sourcing
            </a>
          </div>
        </div>
      </section>

      {/* How Pre-Order Works */}
      <section className="mt-12 grid gap-5 md:grid-cols-3">
        {STEPS.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.step}
              className="border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-6 sm:p-7"
            >
              <div className="flex items-center justify-between">
                <span className="font-display text-xl text-[var(--gold)]">{item.step}</span>
                <Icon className="h-5 w-5 text-[var(--gold)]" strokeWidth={1.6} aria-hidden />
              </div>
              <h2 className="mt-3 font-display text-lg">{item.title}</h2>
              <p className="mt-2 text-sm font-light leading-relaxed text-[var(--text-secondary)]">
                {item.body}
              </p>
            </div>
          );
        })}
      </section>

      {/* Pre-Order Catalog Grid */}
      <section id="preorder-catalog" className="mt-16 scroll-mt-24">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-[var(--border-subtle)] pb-5">
          <div>
            <p className="lx-eyebrow">Available to Reserve</p>
            <h2 className="mt-2 text-[clamp(1.875rem,5vw,2.5rem)] leading-tight">Pre-Order Collection</h2>
          </div>

          <div className="flex flex-wrap gap-2">
            {[
              { label: "All Pre-Orders", slug: "" },
              { label: "Bedding", slug: "bedding" },
              { label: "Living", slug: "living" },
              { label: "Windows", slug: "windows" },
            ].map((tab) => {
              const active = (room ?? "") === tab.slug;
              return (
                <Link
                  key={tab.label}
                  href={tab.slug ? `/pre-order?room=${tab.slug}#preorder-catalog` : "/pre-order#preorder-catalog"}
                  className={`border px-3.5 py-2 text-xs uppercase tracking-[0.12em] transition-colors ${
                    active
                      ? "border-[#231B12] bg-[#231B12] text-[#F4E6C8]"
                      : "border-[var(--border-subtle)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]"
                  }`}
                >
                  {tab.label}
                </Link>
              );
            })}
          </div>
        </div>

        {tiles.length === 0 ? (
          <div className="border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-12 text-center">
            <p className="font-display text-2xl">No pre-order pieces in this room yet</p>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              Use the custom sourcing form below and we will order what you need directly for you.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-5 sm:gap-y-12 md:grid-cols-3 lg:grid-cols-4">
            {tiles.map((product, idx) => (
              <ProductTile key={product.id} product={product} priority={idx < 4} />
            ))}
          </div>
        )}
      </section>

      {/* Custom Pre-Order / Concierge Sourcing Request */}
      <section id="custom-request" className="mt-16 sm:mt-20 scroll-mt-24">
        <div className="grid items-start gap-10 lg:grid-cols-[1fr_1.25fr]">
          <div>
            <p className="lx-eyebrow">Bespoke Procurement</p>
            <h2 className="mt-2 text-[clamp(1.875rem,5vw,2.5rem)] leading-tight">
              Looking for something specific? We can get it for you.
            </h2>
            <p className="mt-4 text-sm font-light leading-relaxed text-[var(--text-secondary)]">
              Whether you are furnishing a new apartment, outfitting a hotel or Airbnb, or looking
              for a specific colour, size or style that is not yet listed in our shop, our
              procurement team can source and import it for you.
            </p>
            <ul className="mt-6 space-y-3 text-sm font-light text-[var(--text-secondary)]">
              <li className="flex items-start gap-2.5">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--gold)]" />
                <span>
                  <strong>Transparent Pricing:</strong> You receive a confirmed quote in GH₵
                  including shipping and customs before you pay a pesewa.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--gold)]" />
                <span>
                  <strong>Flexible Deposit:</strong> Secure your pre-order with a 50% deposit and
                  settle the balance when your order arrives in Accra.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--gold)]" />
                <span>
                  <strong>Guaranteed Quality:</strong> Every pre-ordered piece is inspected by our
                  team before dispatch.
                </span>
              </li>
            </ul>
          </div>

          <PreorderRequestForm />
        </div>
      </section>
    </div>
  );
}
