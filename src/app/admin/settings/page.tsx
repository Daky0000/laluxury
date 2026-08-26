import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { integrationsView } from "@/lib/integrations";
import { env } from "@/lib/env";
import { formatMoney } from "@/lib/money";
import { Card, SectionHeading, Badge } from "@/components/ui";
import { SettingsForm } from "@/components/admin/settings-form";
import { IntegrationsForm } from "@/components/admin/integrations-form";

export const metadata: Metadata = { title: "Settings" };

export default async function AdminSettingsPage() {
  await requirePermission("settings:manage");

  const [settings, zones, integrations] = await Promise.all([
    getSettings(),
    db.shippingZone.findMany({
      include: { rates: { orderBy: { position: "asc" } } },
      orderBy: { createdAt: "asc" },
    }),
    integrationsView(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading
        title="Settings"
        description="Store details, policies, and the keys that switch each integration on."
      />

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
            className="inline-flex items-center gap-1.5 text-[12.5px] text-[var(--accent)]"
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
