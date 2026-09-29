"use client";

import { useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  X,
  Package,
  ShoppingCart,
  Truck,
  CreditCard,
  Boxes,
  HelpCircle,
  Lightbulb,
  CheckCircle2,
  ArrowRight,
  TrendingUp,
  Tag,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useAdminNav } from "./admin-nav-context";
import { cn } from "@/lib/utils";

interface GuideSection {
  title: string;
  icon: typeof ShoppingCart;
  summary: string;
  steps: { title: string; desc: string }[];
  link?: { href: string; label: string };
}

const GUIDES: GuideSection[] = [
  {
    title: "How Customer Orders Work (From Sale to Delivery)",
    icon: ShoppingCart,
    summary: "Understand the lifecycle of an order so you know exactly what to do when a sale comes in.",
    steps: [
      {
        title: "1. Awaiting Payment (Pending)",
        desc: "The customer placed an order, but payment has not cleared yet. If using Mobile Money or Card, the system waits for Paystack confirmation. No packing needed yet.",
      },
      {
        title: "2. Paid (Ready to Pack)",
        desc: "Payment is confirmed! This is your signal to prepare the items. The stock is automatically reserved so you don't accidentally oversell.",
      },
      {
        title: "3. Processing (Packing in Progress)",
        desc: "You or your warehouse team are boxing up the items, inspecting quality, and wrapping furniture for transport.",
      },
      {
        title: "4. Shipped (In Transit with Courier)",
        desc: "The package has been handed over to the delivery driver or dispatch rider. The customer receives an SMS / email with the tracking update.",
      },
      {
        title: "5. Delivered (Completed)",
        desc: "The customer received the package safely. Order is complete!",
      },
    ],
    link: { href: "/admin/orders", label: "View Customer Orders" },
  },
  {
    title: "Understanding Stock & Inventory Numbers",
    icon: Boxes,
    summary: "Stock counts are divided into three simple numbers to prevent overselling.",
    steps: [
      {
        title: "On Hand (Physical Stock)",
        desc: "The total number of physical boxes or furniture pieces physically sitting in your showroom or warehouse.",
      },
      {
        title: "Reserved Stock",
        desc: "Items that customers have already ordered and paid for, but haven't shipped out yet. These items cannot be sold to anyone else.",
      },
      {
        title: "Available Stock (What You Can Sell)",
        desc: "On Hand minus Reserved. This is the exact number shown to shoppers on your website. When this hits zero, the website marks the product 'Sold Out'.",
      },
    ],
    link: { href: "/admin/inventory", label: "Check Stock Levels" },
  },
  {
    title: "Making In-Person Sales (Showroom POS)",
    icon: CreditCard,
    summary: "Use the built-in Cash Register (POS) when a walk-in customer buys in your store.",
    steps: [
      {
        title: "1. Open In-Store Sale (POS)",
        desc: "Go to 'Orders' → 'New In-Store Sale (POS)' or click the shortcut on your dashboard.",
      },
      {
        title: "2. Add Items to Cart",
        desc: "Search products by name or SKU, pick the color/variant, and choose the quantity.",
      },
      {
        title: "3. Select Payment Method",
        desc: "Choose Cash, Bank Transfer, or send an instant Mobile Money PIN push to their phone.",
      },
      {
        title: "4. Print or Send Receipt",
        desc: "Generate a digital invoice or printable receipt for the customer immediately.",
      },
    ],
    link: { href: "/admin/orders/new", label: "Open In-Store Cash Register" },
  },
  {
    title: "Adding & Managing Products",
    icon: Package,
    summary: "How to add new luxury furniture or home decor pieces to your website.",
    steps: [
      {
        title: "1. Title, Room & Description",
        desc: "Give the item a clear name (e.g. 'Ascot Velvet Armchair'), assign it to a room category (e.g. Living Room), and add dimensions.",
      },
      {
        title: "2. High-Quality Photos",
        desc: "Add at least 2-3 clear photos. The first image will be the primary cover image on the storefront.",
      },
      {
        title: "3. Price & Variants",
        desc: "Enter your selling price in Ghana Cedis (GH₵). If the item comes in multiple colors or sizes, create variants.",
      },
      {
        title: "4. Status: Active vs Draft",
        desc: "Keep as 'Draft' while you gather details. Switch to 'Active' when you want it to appear live on the website.",
      },
    ],
    link: { href: "/admin/products/new", label: "Add a New Product" },
  },
  {
    title: "Pre-Orders & Custom Sourcing",
    icon: Truck,
    summary: "Allow customers to order custom pieces or reserve items from upcoming shipments.",
    steps: [
      {
        title: "1. Deposit Collection",
        desc: "Customers pay a deposit (e.g. 50% or 100%) to lock in their custom furniture commission.",
      },
      {
        title: "2. Workshop & Quality Milestone Updates",
        desc: "Update the status as the piece moves from production to sea/air freight and port clearance.",
      },
      {
        title: "3. Arrival & Final Delivery",
        desc: "When the container clears Tema port, collect any remaining balance and schedule white-glove delivery in Accra.",
      },
    ],
    link: { href: "/admin/preorders", label: "Manage Pre-Orders" },
  },
];

const GLOSSARY: { term: string; simple: string; detail: string }[] = [
  {
    term: "SKU (Stock Keeping Unit)",
    simple: "A unique code name for an item",
    detail: "A short code like 'CHAIR-VELVET-NAVY' used to track each unique product variation in the warehouse.",
  },
  {
    term: "POS (Point of Sale)",
    simple: "Your digital cash register",
    detail: "The screen you use in your physical showroom to ring up walk-in customers and accept payments.",
  },
  {
    term: "Abandoned Cart",
    simple: "A shopper who left items in their cart",
    detail: "A visitor who added items to their shopping bag and entered their phone/email, but left before paying. A friendly WhatsApp follow-up often converts them.",
  },
  {
    term: "COGS (Cost of Goods Sold)",
    simple: "What the product cost you to acquire",
    detail: "The wholesale purchase price, manufacturing cost, or import cost. Subtracting COGS from selling price gives your Gross Profit.",
  },
  {
    term: "Profit Margin",
    simple: "The percentage of money you keep as profit",
    detail: "Example: If you buy a mirror for GH₵ 500 and sell it for GH₵ 1,000, your profit is GH₵ 500 and your margin is 50%.",
  },
  {
    term: "Pre-Order",
    simple: "An order for an item that is being made or imported",
    detail: "Furniture not currently in stock in Accra, but being custom crafted or in an overseas shipping container.",
  },
  {
    term: "White-Glove Delivery",
    simple: "Premium delivery including room setup and unboxing",
    detail: "Your delivery team carries the furniture inside the customer's home, unboxes it, places it, and removes all packaging.",
  },
  {
    term: "MoMo (Mobile Money)",
    simple: "Payment via MTN, Vodafone/Telecel, or AirtelTigo",
    detail: "Integrated directly through Paystack. Customers receive an instant authorization prompt on their phone.",
  },
];

export function AdminHelpModal() {
  const { helpOpen, setHelpOpen } = useAdminNav();
  const [tab, setTab] = useState<"guides" | "glossary">("guides");
  const [openGuideIndex, setOpenGuideIndex] = useState<number | null>(0);

  if (!helpOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm transition-all"
      onClick={() => setHelpOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-labelledby="help-modal-title"
    >
      <div
        className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--surface)] px-6 py-4.5">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--color-clay-700)] text-white shadow-sm">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <h2 id="help-modal-title" className="font-display text-xl font-medium text-[var(--text-primary)]">
                Admin Help &amp; Beginner&apos;s Guide
              </h2>
              <p className="text-xs text-[var(--text-muted)]">
                Simple step-by-step guides and plain English explanations for running your store.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setHelpOpen(false)}
            className="grid h-8 w-8 place-items-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] transition-colors"
            aria-label="Close help"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex border-b border-[var(--border-subtle)] bg-[var(--surface-sunken)]/60 px-6 pt-3">
          <button
            type="button"
            onClick={() => setTab("guides")}
            className={cn(
              "flex items-center gap-2 border-b-2 px-4 pb-3 text-sm font-medium transition-colors",
              tab === "guides"
                ? "border-[var(--color-clay-700)] text-[var(--color-clay-700)]"
                : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]",
            )}
          >
            <Lightbulb className="h-4 w-4" />
            Step-by-Step Store Guides
          </button>
          <button
            type="button"
            onClick={() => setTab("glossary")}
            className={cn(
              "flex items-center gap-2 border-b-2 px-4 pb-3 text-sm font-medium transition-colors",
              tab === "glossary"
                ? "border-[var(--color-clay-700)] text-[var(--color-clay-700)]"
                : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]",
            )}
          >
            <HelpCircle className="h-4 w-4" />
            Plain English Glossary
          </button>
        </div>

        {/* Content body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {tab === "guides" ? (
            <div className="space-y-3">
              <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 text-xs text-blue-900 flex items-start gap-2.5">
                <Info className="h-4 w-4 shrink-0 text-blue-600 mt-0.5" />
                <div>
                  <span className="font-semibold">Quick Reminder:</span> You don&apos;t need to memorize technical terms. Whenever you receive an order, check that payment is &quot;Paid&quot;, pack the items, and update the status to &quot;Shipped&quot; when the driver picks it up.
                </div>
              </div>

              {GUIDES.map((guide, idx) => {
                const Icon = guide.icon;
                const isOpen = openGuideIndex === idx;

                return (
                  <div
                    key={guide.title}
                    className="overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] transition-all"
                  >
                    <button
                      type="button"
                      onClick={() => setOpenGuideIndex(isOpen ? null : idx)}
                      className="flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-[var(--surface-sunken)]/50"
                    >
                      <div className="flex items-center gap-3">
                        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[var(--surface-raised)] border border-[var(--border-subtle)] text-[var(--color-clay-700)]">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-[var(--text-primary)]">{guide.title}</p>
                          <p className="text-xs text-[var(--text-muted)]">{guide.summary}</p>
                        </div>
                      </div>
                      <div className="text-[var(--text-muted)]">
                        {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </div>
                    </button>

                    {isOpen ? (
                      <div className="border-t border-[var(--border-subtle)] bg-[var(--surface-raised)] p-5">
                        <div className="space-y-3">
                          {guide.steps.map((step) => (
                            <div key={step.title} className="flex items-start gap-3">
                              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
                              <div className="text-xs">
                                <p className="font-semibold text-[var(--text-primary)]">{step.title}</p>
                                <p className="mt-0.5 text-[var(--text-secondary)] leading-relaxed">{step.desc}</p>
                              </div>
                            </div>
                          ))}
                        </div>

                        {guide.link ? (
                          <div className="mt-4 pt-3 border-t border-[var(--border-subtle)]">
                            <Link
                              href={guide.link.href}
                              onClick={() => setHelpOpen(false)}
                              className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-clay-700)] hover:underline"
                            >
                              {guide.link.label} <ArrowRight className="h-3 w-3" />
                            </Link>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {GLOSSARY.map((item) => (
                <div
                  key={item.term}
                  className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] p-4"
                >
                  <div className="flex items-center gap-1.5">
                    <Tag className="h-3.5 w-3.5 text-[var(--color-clay-700)]" />
                    <h3 className="text-sm font-semibold text-[var(--text-primary)]">{item.term}</h3>
                  </div>
                  <p className="mt-1 text-xs font-medium text-[var(--color-clay-700)]">
                    👉 {item.simple}
                  </p>
                  <p className="mt-2 text-xs text-[var(--text-secondary)] leading-relaxed">
                    {item.detail}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[var(--border-subtle)] bg-[var(--surface)] px-6 py-3.5 text-xs text-[var(--text-muted)]">
          <span>Tip: Press <kbd className="rounded border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-1.5 py-0.5 font-mono text-[10px]">Ctrl+B</kbd> to toggle the sidebar anytime.</span>
          <button
            type="button"
            onClick={() => setHelpOpen(false)}
            className="rounded-lg bg-[var(--color-clay-700)] px-4 py-1.5 font-medium text-white hover:bg-[var(--color-clay-600)] transition-colors"
          >
            Got it, thanks!
          </button>
        </div>
      </div>
    </div>
  );
}

function Info({ className }: { className?: string }) {
  return <HelpCircle className={className} />;
}
