import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { LANDING_PAGES } from "@/lib/landing";
import { integrationsView } from "@/lib/integrations";
import { env } from "@/lib/env";
import { formatMoney } from "@/lib/money";
import { Card, SectionHeading } from "@/components/ui";
import { IntegrationsForm } from "@/components/admin/integrations-form";
import { getFxRates, updateFxRatesAction } from "@/app/actions/admin/fx";

export const metadata: Metadata = { title: "Settings" };

export default async function AdminSettingsPage() {
  await requirePermission("settings:manage");

  const [settings, integrations, fx] = await Promise.all([
    getSettings(),
    integrationsView(),
    getFxRates(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading
        title="Settings"
        description="Store details, policies, storefront FX exchange rates, and the keys that switch each integration on."
      />

      {/* Storefront Multi-Currency Exchange Rates */}
      <Card className="px-6 py-5.5">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">
              Storefront Multi-Currency Exchange Rates (GHS · USD · GBP · EUR)
            </h2>
            <p className="text-xs text-[var(--text-muted)]">
              Configure the live conversion rates used by the storefront header Currency Switcher and Shop the Room Lookbooks.
            </p>
          </div>
          <Link
            href="/admin/products/bulk"
            className="text-xs text-[var(--accent)] hover:underline"
          >
            Open Bulk Catalog Price Adjuster →
          </Link>
        </div>

        <form action={updateFxRatesAction} className="mt-4 grid gap-4 sm:grid-cols-4 sm:items-end">
          <div>
            <label className="block text-xs text-[var(--text-secondary)]">
              1 USD ($) in GHS (₵)
            </label>
            <input
              type="number"
              step="0.05"
              name="ghsPerUsd"
              defaultValue={fx.ghsPerUsd}
              className="lx-field mt-1 w-full py-2 text-sm tabular-nums"
            />
          </div>
          <div>
            <label className="block text-xs text-[var(--text-secondary)]">
              1 GBP (£) in GHS (₵)
            </label>
            <input
              type="number"
              step="0.05"
              name="ghsPerGbp"
              defaultValue={fx.ghsPerGbp}
              className="lx-field mt-1 w-full py-2 text-sm tabular-nums"
            />
          </div>
          <div>
            <label className="block text-xs text-[var(--text-secondary)]">
              1 EUR (€) in GHS (₵)
            </label>
            <input
              type="number"
              step="0.05"
              name="ghsPerEur"
              defaultValue={fx.ghsPerEur}
              className="lx-field mt-1 w-full py-2 text-sm tabular-nums"
            />
          </div>
          <button
            type="submit"
            className="rounded-(--radius-card) bg-[var(--accent)] px-4 py-2.5 text-xs font-medium text-[var(--accent-contrast)]"
          >
            Save Exchange Rates
          </button>
        </form>
      </Card>

      {/* Home page layout */}
      <Card className="px-6 py-5.5">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">Home page sections</h2>
          <Link
            href="/admin/settings/home"
            className="inline-flex items-center gap-1.5 text-sm text-[var(--accent)]"
          >
            Build the home page <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
        <p className="text-sm text-[var(--text-muted)]">
          {settings.homeSections.filter((section) => section.visible).length} of{" "}
          {settings.homeSections.length} sections showing —{" "}
          {settings.homeSections.map((section) => section.title).join(", ")}. Add or remove
          sections, reorder them, and choose the rooms and products each one shows.
        </p>
        {settings.landingPage !== "home" ? (
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            The front page is set to {LANDING_PAGES[settings.landingPage].label.toLowerCase()}, so
            these sections are not what visitors land on. Change that under Front page below.
          </p>
        ) : null}
      </Card>

      {/* SMS & Email Message Templates */}
      <Card className="px-6 py-5.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">SMS &amp; Email Notifications</h2>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              Customize wording and drafted default templates for purchases, receipts, abandoned carts, shipping notices, and direct concierge messages.
            </p>
          </div>
          <Link
            href="/admin/settings/messages"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--accent)] hover:underline"
          >
            Manage message templates <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
      </Card>

      {/* Integrations */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">Integrations</h2>
        <IntegrationsForm groups={integrations} />
      </section>

      {/* Delivery */}
      <Card className="px-6 py-5.5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">Delivery fee</h2>
          <Link
            href="/admin/settings/delivery"
            className="inline-flex items-center gap-1.5 text-sm text-[var(--accent)]"
          >
            Manage delivery <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>

        <p className="text-sm">
          {settings.deliveryFee === 0 ? "Free" : formatMoney(settings.deliveryFee)}{" "}
          <span className="text-[var(--text-muted)]">on every delivery order, any region. Pickup is free.</span>
        </p>

        <div className="mt-4 rounded-lg bg-[var(--surface-sunken)] p-3">
          <p className="text-xs text-[var(--text-secondary)]">
            Public site URL: <code>{env.siteUrl()}</code> · Currency: <code>{env.currency()}</code>
          </p>
        </div>
      </Card>
    </div>
  );
}
