import type { Metadata } from "next";
import Link from "next/link";
import { Compass, Layers, ShieldCheck, Truck, ArrowRight } from "lucide-react";
import { TradeApplicationForm } from "@/components/shop/trade-application-form";

export const metadata: Metadata = {
  title: "Trade & Interior Design Program — LaLuxury",
  description:
    "Exclusive trade privileges, custom upholstery swatches, CAD/3D specifications, and white-glove installation for interior designers, architects, and luxury developers.",
};

const PRIVILEGES = [
  {
    icon: ShieldCheck,
    title: "12% Trade Privilege Pricing",
    body: "Immediate 12% trade discount across all showroom pieces, bespoke pre-order commissions, and multi-room residential packages with no minimum order threshold.",
  },
  {
    icon: Layers,
    title: "Complimentary Swatch & Finish Library",
    body: "Request Italian bouclé, full-grain aniline leather, travertine, and brushed brass sample kits couriered directly to your studio in Accra or Kumasi.",
  },
  {
    icon: Compass,
    title: "COM & Bespoke Dimension Modifications",
    body: "Specify Customer's Own Material (COM), custom sofa lengths, or bespoke marble veining directly with our European and Asian partner ateliers.",
  },
  {
    icon: Truck,
    title: "Consolidated Container & White-Glove Staging",
    body: "We store your project pieces free for up to 30 days in our climate-controlled warehouse and unbox, assemble, and stage every room on your installation day.",
  },
];

export default function TradeProgramPage() {
  return (
    <div className="lx-container py-12 sm:py-16">
      {/* Editorial Hero */}
      <div className="grid gap-10 border-b border-[var(--border-subtle)] pb-14 lg:grid-cols-[1.4fr_1fr] lg:items-start">
        <div>
          <p className="lx-eyebrow">
            LaLuxury To-The-Trade Program
          </p>
          <h1 className="mt-3 text-[clamp(2.25rem,5vw,3.5rem)] leading-[1.06] text-[var(--text-primary)]">
            Designed for West Africa’s Leading Architects, Interior Designers &amp; Developers.
          </h1>
          <p className="mt-5 max-w-2xl text-sm sm:text-base font-light leading-relaxed text-[var(--text-secondary)]">
            Whether you are furnishing a private residence in Cantonments, styling a penthouse in East Legon, or specifying a 40-suite boutique hotel, our Trade Concierge provides end-to-end procurement, custom manufacturing, and white-glove installation.
          </p>
          <div className="mt-7 flex flex-wrap gap-4">
            <Link
              href="/lookbook"
              className="inline-flex items-center gap-2 border border-[var(--border-strong)] bg-[var(--surface-raised)] px-5 py-3 text-xs font-medium uppercase tracking-[0.16em] text-[var(--text-primary)] transition-colors hover:border-[var(--text-primary)] hover:bg-[var(--surface-sunken)]"
            >
              Explore Room Lookbooks <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <Link
              href="/pre-order"
              className="inline-flex items-center gap-2 border border-[var(--border-subtle)] px-5 py-3 text-xs font-medium uppercase tracking-[0.16em] text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
            >
              Custom Sourcing Desk
            </Link>
          </div>
        </div>

        <div>
          <div className="border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-7">
            <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-[var(--text-muted)]">
              Trade Desk Direct
            </p>
            <p className="mt-2 font-display text-xl text-[var(--text-primary)]">
              “We treat your project schedule as sacred—from CAD sign-off and swatch approval to white-glove placement on handover day.”
            </p>
            <div className="mt-6 grid grid-cols-3 gap-4 border-t border-[var(--border-subtle)] pt-5 text-center">
              <div>
                <p className="font-display text-2xl text-[var(--text-primary)]">12%</p>
                <p className="mt-0.5 text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">Trade Privilege</p>
              </div>
              <div>
                <p className="font-display text-2xl text-[var(--text-primary)]">50%</p>
                <p className="mt-0.5 text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">Deposit Split</p>
              </div>
              <div>
                <p className="font-display text-2xl text-[var(--text-primary)]">30d</p>
                <p className="mt-0.5 text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">Free Storage</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Two-Column Privileges + Application Form */}
      <div className="mt-14 grid gap-12 lg:grid-cols-2">
        <div className="space-y-6">
          <h2 className="font-display text-2xl text-[var(--text-primary)]">
            Trade Partner Privileges
          </h2>
          <div className="grid gap-5 sm:grid-cols-2">
            {PRIVILEGES.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.title}
                  className="border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-5 transition-colors hover:border-[var(--border-strong)]"
                >
                  <Icon className="h-5 w-5 text-[var(--accent)]" />
                  <h3 className="mt-3 font-display text-lg text-[var(--text-primary)]">
                    {item.title}
                  </h3>
                  <p className="mt-1.5 text-sm font-light leading-relaxed text-[var(--text-secondary)]">
                    {item.body}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-6">
            <h3 className="font-display text-lg text-[var(--text-primary)]">
              How Trade Billing &amp; Pre-Order Split Payments Work
            </h3>
            <ol className="mt-3 space-y-2 text-sm font-light leading-relaxed text-[var(--text-secondary)] list-decimal list-inside">
              <li>
                Apply your <strong>TRADE-XXXX</strong> code at checkout to deduct 12% immediately across all items.
              </li>
              <li>
                For custom and Pre-Order pieces, select the <strong>50% Reservation Deposit</strong> option at checkout.
              </li>
              <li>
                Download official <strong>Pro-Forma &amp; VAT Tax Invoices</strong> directly from your Order Tracker for client accounting.
              </li>
              <li>
                Follow the <strong>5-Stage Production &amp; Sea/Air Freight Tracker</strong> online until white-glove installation.
              </li>
            </ol>
          </div>
        </div>

        <div>
          <TradeApplicationForm />
        </div>
      </div>
    </div>
  );
}
