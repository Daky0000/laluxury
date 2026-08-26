import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { integrationStatus, env } from "@/lib/env";
import { formatMoney } from "@/lib/money";
import { Card, SectionHeading, Badge } from "@/components/ui";
import { SettingsForm } from "@/components/admin/settings-form";

export const metadata: Metadata = { title: "Settings" };

/** Which env vars switch each integration on, shown when one is missing. */
const ENV_KEYS: Record<string, string[]> = {
  paystack: ["PAYSTACK_SECRET_KEY", "NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY"],
  openrouter: ["OPENROUTER_API_KEY"],
  slack: ["SLACK_BOT_TOKEN", "SLACK_SIGNING_SECRET"],
  whatsapp: ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_APP_SECRET"],
  smtp: ["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD"],
  cloudinary: ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"],
};

export default async function AdminSettingsPage() {
  await requirePermission("settings:manage");

  const [settings, zones] = await Promise.all([
    getSettings(),
    db.shippingZone.findMany({
      include: { rates: { orderBy: { position: "asc" } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const integrations = integrationStatus();

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading
        title="Settings"
        description="Store details, policies and integration status."
      />

      <SettingsForm settings={settings} />

      {/* Integrations */}
      <Card className="p-5">
        <h2 className="lx-eyebrow mb-1">Integrations</h2>
        <p className="mb-4 text-sm text-[var(--text-secondary)]">
          These are read from the environment, so they change on your host, not here. Restart after
          editing them.
        </p>

        <ul className="flex flex-col gap-2">
          {integrations.map((integration) => (
            <li
              key={integration.key}
              className="flex flex-wrap items-center gap-3 rounded-(--radius-card) border border-[var(--border-subtle)] px-4 py-3"
            >
              <span className="min-w-40 flex-1 text-sm">{integration.label}</span>
              <Badge tone={integration.ready ? "success" : "neutral"}>
                {integration.ready ? "configured" : "missing"}
              </Badge>
              {!integration.ready ? (
                <code className="text-xs text-[var(--text-muted)]">
                  {(ENV_KEYS[integration.key] ?? []).join(", ")}
                </code>
              ) : null}
            </li>
          ))}
        </ul>

        <div className="mt-4 rounded-(--radius-card) bg-[var(--surface-sunken)] p-3">
          <p className="text-xs text-[var(--text-secondary)]">
            Public site URL: <code>{env.siteUrl()}</code> · Currency:{" "}
            <code>{env.currency()}</code>
          </p>
        </div>
      </Card>

      {/* Shipping */}
      <Card className="p-5">
        <h2 className="lx-eyebrow mb-4">Delivery zones and rates</h2>

        {zones.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">
            No zones configured. Run the seed, or add them directly in the database.
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
                      className="flex flex-wrap items-center gap-3 rounded-(--radius-card) border border-[var(--border-subtle)] px-3 py-2 text-sm"
                    >
                      <span className="min-w-32 flex-1">{rate.name}</span>
                      <span className="tabular-nums">{formatMoney(rate.price)}</span>
                      {rate.freeAboveSubtotal ? (
                        <span className="text-xs text-success">
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
      </Card>
    </div>
  );
}
