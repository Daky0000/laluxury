"use client";

import { useActionState, useState } from "react";
import { Loader2 } from "lucide-react";
import { updateSettingsAction } from "@/app/actions/admin/system";
import type { AdminState } from "@/app/actions/admin/products";
import type { StoreSettings } from "@/lib/settings";
import { LANDING_PAGES, type LandingPage } from "@/lib/landing";
import { Card, Field, Alert } from "@/components/ui";
import { toMajorUnits } from "@/lib/money";

export function SettingsForm({ settings }: { settings: StoreSettings }) {
  const [state, action, pending] = useActionState<AdminState | null, FormData>(
    updateSettingsAction,
    null,
  );
  // Tracked so the note under the picker describes the page being chosen
  // rather than the one that is live.
  const [landingPage, setLandingPage] = useState<LandingPage>(settings.landingPage);

  return (
    <form action={action} className="flex flex-col gap-6">
      {state?.message ? (
        <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>
      ) : null}

      <Card className="flex flex-col gap-4 p-5">
        <h2 className="lx-eyebrow">Front page</h2>

        <Field
          label="Page visitors land on"
          htmlFor="landingPage"
          hint="What the wordmark and laluxury.com itself open. Both pages keep their own address whichever you pick, so /shop still works."
        >
          <select
            id="landingPage"
            name="landingPage"
            value={landingPage}
            onChange={(event) => setLandingPage(event.target.value as LandingPage)}
            className="lx-field"
          >
            {Object.entries(LANDING_PAGES).map(([value, page]) => (
              <option key={value} value={value}>
                {page.label}
              </option>
            ))}
          </select>
        </Field>

        <p className="-mt-1 text-sm text-[var(--text-secondary)]">
          {LANDING_PAGES[landingPage].hint}
        </p>
      </Card>

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
          hint="Scrolls across the top of every storefront page. Separate messages with · to run several. Leave blank to hide it."
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
        <h2 className="lx-eyebrow">Home page</h2>
        <p className="-mt-2 text-sm text-[var(--text-secondary)]">
          The wording for the hero, the bundle banner and the newsletter. Images can be any URL,
          or a file under <code>/public</code> such as <code>/catalog/hero-bedroom.webp</code>.
          Which sections appear, in what order, and the rooms and products inside them are set
          under{" "}
          <a href="/admin/settings/home" className="underline underline-offset-4">
            Home page sections
          </a>
          .
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Hero eyebrow" htmlFor="heroEyebrow">
            <input
              id="heroEyebrow"
              name="heroEyebrow"
              defaultValue={settings.heroEyebrow}
              className="lx-field"
            />
          </Field>

          <Field label="Hero image URL" htmlFor="heroImageUrl">
            <input
              id="heroImageUrl"
              name="heroImageUrl"
              defaultValue={settings.heroImageUrl}
              className="lx-field"
            />
          </Field>

          <Field label="Hero headline" htmlFor="heroTitle" hint="First line, upright.">
            <input
              id="heroTitle"
              name="heroTitle"
              defaultValue={settings.heroTitle}
              className="lx-field"
            />
          </Field>

          <Field label="Hero headline, second line" htmlFor="heroTitleAccent" hint="Set in italic.">
            <input
              id="heroTitleAccent"
              name="heroTitleAccent"
              defaultValue={settings.heroTitleAccent}
              className="lx-field"
            />
          </Field>
        </div>

        <Field label="Hero paragraph" htmlFor="heroBody">
          <textarea
            id="heroBody"
            name="heroBody"
            rows={2}
            defaultValue={settings.heroBody}
            className="lx-field resize-y"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Bundle eyebrow" htmlFor="bundleEyebrow">
            <input
              id="bundleEyebrow"
              name="bundleEyebrow"
              defaultValue={settings.bundleEyebrow}
              className="lx-field"
            />
          </Field>

          <Field label="Bundle heading" htmlFor="bundleTitle" hint="Leave blank to hide the banner.">
            <input
              id="bundleTitle"
              name="bundleTitle"
              defaultValue={settings.bundleTitle}
              className="lx-field"
            />
          </Field>
        </div>

        <Field label="Bundle paragraph" htmlFor="bundleBody">
          <textarea
            id="bundleBody"
            name="bundleBody"
            rows={2}
            defaultValue={settings.bundleBody}
            className="lx-field resize-y"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Bundle price (GHS)" htmlFor="bundlePrice">
            <input
              id="bundlePrice"
              name="bundlePrice"
              type="number"
              step="0.01"
              min="0"
              defaultValue={settings.bundlePrice ? toMajorUnits(settings.bundlePrice) : ""}
              className="lx-field"
            />
          </Field>

          <Field label="Bundle was (GHS)" htmlFor="bundleCompareAtPrice">
            <input
              id="bundleCompareAtPrice"
              name="bundleCompareAtPrice"
              type="number"
              step="0.01"
              min="0"
              defaultValue={
                settings.bundleCompareAtPrice ? toMajorUnits(settings.bundleCompareAtPrice) : ""
              }
              className="lx-field"
            />
          </Field>

          <Field label="Bundle image URL" htmlFor="bundleImageUrl">
            <input
              id="bundleImageUrl"
              name="bundleImageUrl"
              defaultValue={settings.bundleImageUrl}
              className="lx-field"
            />
          </Field>

          <Field label="Bundle link" htmlFor="bundleHref">
            <input
              id="bundleHref"
              name="bundleHref"
              defaultValue={settings.bundleHref}
              className="lx-field"
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Newsletter heading" htmlFor="newsletterTitle">
            <input
              id="newsletterTitle"
              name="newsletterTitle"
              defaultValue={settings.newsletterTitle}
              className="lx-field"
            />
          </Field>

          <Field label="Newsletter paragraph" htmlFor="newsletterBody">
            <input
              id="newsletterBody"
              name="newsletterBody"
              defaultValue={settings.newsletterBody}
              className="lx-field"
            />
          </Field>
        </div>
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
          className="flex items-center gap-2 rounded-(--radius-card) bg-[var(--accent)] px-6 py-2.5 text-sm text-[var(--accent-contrast)] disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          Save settings
        </button>
      </div>
    </form>
  );
}
