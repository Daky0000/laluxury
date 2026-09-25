import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { LANDING_PAGES } from "@/lib/landing";
import { integrationsView } from "@/lib/integrations";
import { env } from "@/lib/env";
import { formatMoney } from "@/lib/money";
import { Card, SectionHeading, Badge } from "@/components/ui";
import { SettingsForm } from "@/components/admin/settings-form";
import { IntegrationsForm } from "@/components/admin/integrations-form";
import { getFxRates, updateFxRatesAction } from "@/app/actions/admin/fx";

export const metadata: Metadata = { title: "Settings" };

export default async function AdminSettingsPage() {
  await requirePermission("settings:manage");

  const [settings, zones, integrations, fx] = await Promise.all([
    getSettings(),
    db.shippingZone.findMany({
      include: { rates: { orderBy: { position: "asc" } } },
      orderBy: { createdAt: "asc" },
    }),
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

      <SettingsForm settings={settings} />

      {/* Integrations */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">Integrations</h2>
        <IntegrationsForm groups={integrations} />
      </section>

      {/* Delivery */}
      <Card className="px-6 py-5.5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">Delivery zones and rates</h2>
          <Link
            href="/admin/settings/delivery"
            className="inline-flex items-center gap-1.5 text-sm text-[var(--accent)]"
          >
            Manage delivery <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>

        {zones.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">
            No zones yet — nobody can check out until at least one exists.{" "}
            <Link href="/admin/settings/delivery" className="underline underline-offset-4">
              Add one
            </Link>
            .
          </p>
        ) : (
          <ul className="flex flex-col gap-4">
            {zones.map((zone) => (
              <li key={zone.id}>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{zone.name}</p>
                  <Badge tone={zone.isActive ? "success" : "neutral"}>
                    {zone.isActive ? "active" : "off"}
                  </Badge>
                </div>
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                  {zone.regions.length > 0
                    ? zone.regions.join(", ")
                    : "Catch-all for every other region"}
                </p>

                <ul className="mt-2 flex flex-col gap-1.5">
                  {zone.rates.map((rate) => (
                    <li
                      key={rate.id}
                      className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--border-subtle)] px-3 py-2 text-sm"
                    >
                      <span className="min-w-32 flex-1">{rate.name}</span>
                      <span className="tabular-nums">{formatMoney(rate.price)}</span>
                      {rate.freeAboveSubtotal ? (
                        <span className="text-xs text-sage-600">
                          free over {formatMoney(rate.freeAboveSubtotal)}
                        </span>
                      ) : null}
                      {rate.estimatedDaysMin !== null ? (
                        <span className="text-xs text-[var(--text-muted)]">
                          {rate.estimatedDaysMin}–{rate.estimatedDaysMax} days
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 rounded-lg bg-[var(--surface-sunken)] p-3">
          <p className="text-xs text-[var(--text-secondary)]">
            Public site URL: <code>{env.siteUrl()}</code> · Currency: <code>{env.currency()}</code>
          </p>
        </div>
      </Card>
    </div>
  );
}
