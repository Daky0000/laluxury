"use client";

import { useActionState, useEffect, useState } from "react";
import { Loader2, Lock } from "lucide-react";
import { placeOrderAction, type CheckoutState } from "@/app/actions/checkout";
import { formatMoney } from "@/lib/money";
import { GHANA_REGIONS } from "@/lib/constants";
import { Field, Alert, Card } from "@/components/ui";
import { cn } from "@/lib/utils";

type Rate = {
  id: string;
  name: string;
  price: number;
  zoneName: string;
  estimatedDaysMin: number | null;
  estimatedDaysMax: number | null;
  isFree: boolean;
};

/**
 * Checkout. Delivery options re-quote whenever the region changes, and the
 * order summary previews the final total including delivery before the shopper
 * is handed to Paystack.
 */
export function CheckoutForm({
  subtotal,
  discountTotal,
  goodsTotal,
  defaultEmail,
  isSignedIn,
}: {
  subtotal: number;
  discountTotal: number;
  goodsTotal: number;
  defaultEmail: string;
  isSignedIn: boolean;
}) {
  const [state, action, pending] = useActionState<CheckoutState | null, FormData>(
    placeOrderAction,
    null,
  );

  const [region, setRegion] = useState("");
  const [rates, setRates] = useState<Rate[]>([]);
  const [rateId, setRateId] = useState<string>("");
  const [loadingRates, setLoadingRates] = useState(false);
  const [createAccount, setCreateAccount] = useState(false);

  useEffect(() => {
    // No region means nothing to quote; `visibleRates` derives the empty list.
    if (!region) return;

    const controller = new AbortController();

    // A short debounce coalesces rapid region changes and keeps the state
    // updates inside a callback rather than the effect body.
    const timer = setTimeout(() => {
      setLoadingRates(true);

      fetch(`/api/shipping/quote?region=${encodeURIComponent(region)}`, {
        signal: controller.signal,
      })
        .then((r) => r.json())
        .then((data: { rates: Rate[] }) => {
          setRates(data.rates ?? []);
          // Default to the cheapest option so the total is never blank.
          setRateId(data.rates?.[0]?.id ?? "");
        })
        .catch(() => {})
        .finally(() => setLoadingRates(false));
    }, 60);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [region]);

  // Rates only apply to the region they were fetched for.
  const visibleRates = region ? rates : [];
  const selectedRate = visibleRates.find((r) => r.id === rateId);
  const shippingTotal = selectedRate?.price ?? 0;
  const total = goodsTotal + shippingTotal;

  const errors = state?.fieldErrors ?? {};

  return (
    <form action={action} className="grid gap-10 lg:grid-cols-[1fr_22rem]">
      <div className="flex flex-col gap-8">
        {state?.message ? <Alert tone="danger">{state.message}</Alert> : null}

        {/* Contact */}
        <section>
          <h2 className="mb-4 font-display text-xl">Contact</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Email" htmlFor="email" required error={errors.email} className="sm:col-span-2">
              <input
                id="email"
                name="email"
                type="email"
                required
                defaultValue={defaultEmail}
                autoComplete="email"
                className="lx-field"
              />
            </Field>

            <Field label="First name" htmlFor="firstName" required error={errors.firstName}>
              <input id="firstName" name="firstName" required autoComplete="given-name" className="lx-field" />
            </Field>

            <Field label="Last name" htmlFor="lastName" required error={errors.lastName}>
              <input id="lastName" name="lastName" required autoComplete="family-name" className="lx-field" />
            </Field>

            <Field
              label="Phone"
              htmlFor="phone"
              required
              error={errors.phone}
              hint="For delivery updates and Mobile Money."
              className="sm:col-span-2"
            >
              <input
                id="phone"
                name="phone"
                type="tel"
                required
                placeholder="024 000 0000"
                autoComplete="tel"
                className="lx-field"
              />
            </Field>
          </div>
        </section>

        {/* Delivery address */}
        <section>
          <h2 className="mb-4 font-display text-xl">Delivery address</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Street address" htmlFor="line1" required error={errors.line1} className="sm:col-span-2">
              <input id="line1" name="line1" required autoComplete="address-line1" className="lx-field" />
            </Field>

            <Field label="Apartment, landmark" htmlFor="line2" className="sm:col-span-2">
              <input id="line2" name="line2" autoComplete="address-line2" className="lx-field" />
            </Field>

            <Field label="City or town" htmlFor="city" required error={errors.city}>
              <input id="city" name="city" required autoComplete="address-level2" className="lx-field" />
            </Field>

            <Field label="Region" htmlFor="region" required error={errors.region}>
              <select
                id="region"
                name="region"
                required
                value={region}
                onChange={(event) => setRegion(event.target.value)}
                className="lx-field"
              >
                <option value="">Choose a region</option>
                {GHANA_REGIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Digital address" htmlFor="postalCode" hint="Optional, e.g. GA-123-4567">
              <input id="postalCode" name="postalCode" autoComplete="postal-code" className="lx-field" />
            </Field>
          </div>
        </section>

        {/* Delivery method */}
        <section>
          <h2 className="mb-4 font-display text-xl">Delivery method</h2>

          {!region ? (
            <p className="text-sm text-[var(--text-secondary)]">
              Choose a region to see delivery options.
            </p>
          ) : loadingRates ? (
            <p className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Checking options…
            </p>
          ) : visibleRates.length === 0 ? (
            <Alert tone="warning">
              We do not deliver to that region yet. Contact us and we will sort something out.
            </Alert>
          ) : (
            <div className="flex flex-col gap-2">
              {visibleRates.map((rate) => (
                <label
                  key={rate.id}
                  className={cn(
                    "flex cursor-pointer items-center justify-between rounded-[--radius-card] border px-4 py-3 transition-colors",
                    rateId === rate.id
                      ? "border-[var(--accent)] bg-[var(--surface-sunken)]"
                      : "border-[var(--border-subtle)]",
                  )}
                >
                  <span className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="shippingRateId"
                      value={rate.id}
                      checked={rateId === rate.id}
                      onChange={() => setRateId(rate.id)}
                      className="accent-[var(--accent)]"
                    />
                    <span>
                      <span className="block text-sm">{rate.name}</span>
                      {rate.estimatedDaysMin !== null ? (
                        <span className="block text-xs text-[var(--text-muted)]">
                          {rate.estimatedDaysMin === 0
                            ? "Today or tomorrow"
                            : `${rate.estimatedDaysMin}–${rate.estimatedDaysMax} business days`}
                        </span>
                      ) : null}
                    </span>
                  </span>
                  <span className="text-sm tabular-nums">
                    {rate.price === 0 ? "Free" : formatMoney(rate.price)}
                  </span>
                </label>
              ))}
            </div>
          )}
        </section>

        {/* Order note + account */}
        <section className="flex flex-col gap-4">
          <Field label="Order note" htmlFor="customerNote" hint="Anything we should know about the delivery.">
            <textarea id="customerNote" name="customerNote" rows={3} className="lx-field resize-y" />
          </Field>

          {!isSignedIn ? (
            <div>
              <label className="flex items-center gap-2.5 text-sm">
                <input
                  type="checkbox"
                  name="createAccount"
                  checked={createAccount}
                  onChange={(event) => setCreateAccount(event.target.checked)}
                  className="accent-[var(--accent)]"
                />
                Save my details for next time
              </label>

              {createAccount ? (
                <div className="mt-3 max-w-sm">
                  <Field label="Choose a password" htmlFor="password" hint="At least 8 characters.">
                    <input
                      id="password"
                      name="password"
                      type="password"
                      minLength={8}
                      autoComplete="new-password"
                      className="lx-field"
                    />
                  </Field>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>

      {/* Summary */}
      <aside className="lg:sticky lg:top-28 lg:self-start">
        <Card className="p-5">
          <h2 className="lx-eyebrow mb-4">Order summary</h2>

          <dl className="space-y-2.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-[var(--text-secondary)]">Subtotal</dt>
              <dd className="tabular-nums">{formatMoney(subtotal)}</dd>
            </div>
            {discountTotal > 0 ? (
              <div className="flex justify-between text-success">
                <dt>Discount</dt>
                <dd className="tabular-nums">-{formatMoney(discountTotal)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between">
              <dt className="text-[var(--text-secondary)]">Delivery</dt>
              <dd className="tabular-nums">
                {!selectedRate ? "—" : shippingTotal === 0 ? "Free" : formatMoney(shippingTotal)}
              </dd>
            </div>
          </dl>

          <div className="mt-4 flex items-baseline justify-between border-t border-[var(--border-subtle)] pt-4">
            <span className="text-sm">Total</span>
            <span className="font-display text-2xl tabular-nums">{formatMoney(total)}</span>
          </div>

          <button
            type="submit"
            disabled={pending || !selectedRate}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-[--radius-card] bg-[var(--accent)] px-6 py-3.5 text-sm tracking-wide text-[var(--accent-contrast)] transition-colors hover:bg-ink-800 disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Lock className="h-4 w-4" aria-hidden />}
            {pending ? "Redirecting…" : "Pay with Paystack"}
          </button>

          <p className="mt-3 text-center text-xs text-[var(--text-muted)]">
            Card, Mobile Money or bank transfer. You will be returned here once payment completes.
          </p>
        </Card>
      </aside>
    </form>
  );
}
