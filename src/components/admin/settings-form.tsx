"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { updateSettingsAction } from "@/app/actions/admin/system";
import type { AdminState } from "@/app/actions/admin/products";
import type { StoreSettings } from "@/lib/settings";
import { Card, Field, Alert } from "@/components/ui";
import { toMajorUnits } from "@/lib/money";

export function SettingsForm({ settings }: { settings: StoreSettings }) {
  const [state, action, pending] = useActionState<AdminState | null, FormData>(
    updateSettingsAction,
    null,
  );

  return (
    <form action={action} className="flex flex-col gap-6">
      {state?.message ? (
        <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>
      ) : null}

      <Card className="flex flex-col gap-4 p-5">
        <h2 className="lx-eyebrow">Store</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Store name" htmlFor="storeName" required>
            <input
              id="storeName"
              name="storeName"
              required
              defaultValue={settings.storeName}
              className="lx-field"
            />
          </Field>

          <Field label="Tagline" htmlFor="tagline">
            <input id="tagline" name="tagline" defaultValue={settings.tagline} className="lx-field" />
          </Field>
        </div>

        <Field
          label="Announcement bar"
          htmlFor="announcementBar"
          hint="Shown across the top of every storefront page. Leave blank to hide it."
        >
          <input
            id="announcementBar"
            name="announcementBar"
            defaultValue={settings.announcementBar}
            className="lx-field"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Support email" htmlFor="supportEmail">
            <input
              id="supportEmail"
              name="supportEmail"
              type="email"
              defaultValue={settings.supportEmail}
              className="lx-field"
            />
          </Field>

          <Field label="Support phone" htmlFor="supportPhone">
            <input
              id="supportPhone"
              name="supportPhone"
              defaultValue={settings.supportPhone}
              className="lx-field"
            />
          </Field>

          <Field label="WhatsApp number" htmlFor="whatsappNumber" hint="Shown to customers.">
            <input
              id="whatsappNumber"
              name="whatsappNumber"
              defaultValue={settings.whatsappNumber}
              className="lx-field"
            />
          </Field>

          <Field label="Instagram URL" htmlFor="instagramUrl">
            <input
              id="instagramUrl"
              name="instagramUrl"
              type="url"
              defaultValue={settings.instagramUrl}
              className="lx-field"
            />
          </Field>
        </div>

        <Field label="Address line" htmlFor="addressLine">
          <input
            id="addressLine"
            name="addressLine"
            defaultValue={settings.addressLine}
            className="lx-field"
          />
        </Field>
      </Card>

      <Card className="flex flex-col gap-4 p-5">
        <h2 className="lx-eyebrow">Policies</h2>

        <Field label="Shipping policy" htmlFor="shippingPolicy" hint="Shown on every product page.">
          <textarea
            id="shippingPolicy"
            name="shippingPolicy"
            rows={2}
            defaultValue={settings.shippingPolicy}
            className="lx-field resize-y"
          />
        </Field>

        <Field label="Returns policy" htmlFor="returnsPolicy">
          <textarea
            id="returnsPolicy"
            name="returnsPolicy"
            rows={2}
            defaultValue={settings.returnsPolicy}
            className="lx-field resize-y"
          />
        </Field>
      </Card>

      <Card className="flex flex-col gap-4 p-5">
        <h2 className="lx-eyebrow">Operations</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Free delivery over (GHS)"
            htmlFor="freeShippingThreshold"
            hint="Informational; the real thresholds live on each delivery rate."
          >
            <input
              id="freeShippingThreshold"
              name="freeShippingThreshold"
              type="number"
              step="0.01"
              min="0"
              defaultValue={
                settings.freeShippingThreshold ? toMajorUnits(settings.freeShippingThreshold) : ""
              }
              className="lx-field"
            />
          </Field>

          <Field
            label="Low stock threshold"
            htmlFor="lowStockThreshold"
            hint="Used by the dashboard alert."
          >
            <input
              id="lowStockThreshold"
              name="lowStockThreshold"
              type="number"
              min="0"
              defaultValue={settings.lowStockThreshold}
              className="lx-field"
            />
          </Field>
        </div>

        <label className="flex items-start gap-2.5 text-sm">
          <input
            type="checkbox"
            name="agentRequiresApproval"
            defaultChecked={settings.agentRequiresApproval}
            className="mt-0.5 accent-[var(--accent)]"
          />
          <span>
            Ask before the AI agent changes anything
            <span className="block text-xs text-[var(--text-secondary)]">
              Strongly recommended. With this off, a message on WhatsApp can reprice the catalog
              with no confirmation step.
            </span>
          </span>
        </label>
      </Card>

      <div>
        <button
          type="submit"
          disabled={pending}
          className="flex items-center gap-2 rounded-[--radius-card] bg-[var(--accent)] px-6 py-2.5 text-sm text-[var(--accent-contrast)] disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          Save settings
        </button>
      </div>
    </form>
  );
}
