"use client";

import { useActionState, useEffect, useState, type ReactNode } from "react";
import { Loader2, Lock } from "lucide-react";
import { placeOrderAction, type CheckoutState } from "@/app/actions/checkout";
import { formatPrice } from "@/lib/money";
import { GHANA_REGIONS } from "@/lib/constants";
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

/** Which Paystack channels each choice on the artboard maps to. */
const PAYMENT_METHODS = [
  {
    id: "momo",
    label: "Mobile Money (MTN / Telecel)",
    note: "Momo prompt",
    channels: ["mobile_money"],
  },
  { id: "card", label: "Card", note: "Visa · Mastercard", channels: ["card"] },
  {
    id: "transfer",
    label: "Bank transfer or USSD",
    note: "Pay from your bank",
    channels: ["bank_transfer", "ussd"],
  },
];

const field =
  "w-full border border-[var(--border-strong)] bg-[var(--surface-raised)] px-4 py-3.5 text-sm " +
  "outline-none transition-colors placeholder:text-ink-400 focus:border-[var(--accent)]";

const sectionHeading = "mb-4 mt-10 text-[clamp(1.5rem,3vw,1.875rem)]";

/**
 * Checkout, laid out as the cart & checkout artboard has it: the bag you are
 * buying, then who it goes to, how it travels and how it is paid, with a
 * sticky summary that keeps the total in view the whole way down.
 *
 * Delivery options re-quote whenever the region changes.
 */
export function CheckoutForm({
  subtotal,
  discountTotal,
  goodsTotal,
  defaultEmail,
  isSignedIn,
  freeShippingThreshold,
  lines,
  discount,
}: {
  subtotal: number;
  discountTotal: number;
  goodsTotal: number;
  defaultEmail: string;
  isSignedIn: boolean;
  /** Minor units; null when the owner has not set one. */
  freeShippingThreshold: number | null;
  /** The editable bag, rendered above the delivery details. */
  lines: ReactNode;
  /** The discount code field, at the top of the summary. */
  discount: ReactNode;
}) {
  const [state, action, pending] = useActionState<CheckoutState | null, FormData>(
    placeOrderAction,
    null,
  );

  const [region, setRegion] = useState("");
  const [rates, setRates] = useState<Rate[]>([]);
  const [rateId, setRateId] = useState<string>("");
  const [loadingRates, setLoadingRates] = useState(false);
  const [method, setMethod] = useState(PAYMENT_METHODS[0].id);
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

  const freeGap =
    freeShippingThreshold && goodsTotal > 0 && goodsTotal < freeShippingThreshold
      ? freeShippingThreshold - goodsTotal
      : 0;

  const errors = state?.fieldErrors ?? {};
  const selectedMethod = PAYMENT_METHODS.find((m) => m.id === method) ?? PAYMENT_METHODS[0];

  /** The radio rows for delivery and payment share one shell. */
  function choiceClass(active: boolean): string {
    return cn(
      "flex cursor-pointer items-center gap-3.5 border px-4 py-4 transition-colors",
      active
        ? "border-[var(--accent)] bg-[var(--surface-raised)]"
        : "border-[var(--border-subtle)] hover:border-[var(--border-strong)]",
    );
  }

  function radioDot(active: boolean): ReactNode {
    return (
      <span
        aria-hidden
        className={cn(
          "grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border",
          active ? "border-[var(--accent)]" : "border-[var(--border-strong)]",
        )}
      >
        <span
          className={cn(
            "h-[9px] w-[9px] rounded-full",
            active ? "bg-[var(--accent)]" : "bg-transparent",
          )}
        />
      </span>
    );
  }

  return (
    <form action={action} className="grid items-start gap-10 lg:grid-cols-[1fr_400px] lg:gap-13">
      <div>
        {state?.message ? (
          <p
            role="alert"
            className="mb-6 border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger"
          >
            {state.message}
          </p>
        ) : null}

        {lines}

        {/* Delivery details */}
        <h2 className={sectionHeading}>Delivery details</h2>
        <div className="grid gap-3.5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="firstName" className="sr-only">
              First name
            </label>
            <div className="grid gap-3.5 sm:grid-cols-2">
              <input
                id="firstName"
                name="firstName"
                required
                autoComplete="given-name"
                placeholder="First name"
                className={field}
              />
              <label htmlFor="lastName" className="sr-only">
                Last name
              </label>
              <input
                id="lastName"
                name="lastName"
                required
                autoComplete="family-name"
                placeholder="Last name"
                className={field}
              />
            </div>
            {errors.firstName || errors.lastName ? (
              <p className="mt-1.5 text-xs text-danger">{errors.firstName ?? errors.lastName}</p>
            ) : null}
          </div>

          <div>
            <label htmlFor="phone" className="sr-only">
              Phone number
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              required
              autoComplete="tel"
              placeholder="Phone number"
              className={field}
            />
            {errors.phone ? <p className="mt-1.5 text-xs text-danger">{errors.phone}</p> : null}
          </div>

          <div>
            <label htmlFor="email" className="sr-only">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              defaultValue={defaultEmail}
              autoComplete="email"
              placeholder="Email address"
              className={field}
            />
            {errors.email ? <p className="mt-1.5 text-xs text-danger">{errors.email}</p> : null}
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="line1" className="sr-only">
              Delivery address
            </label>
            <input
              id="line1"
              name="line1"
              required
              autoComplete="address-line1"
              placeholder="Delivery address"
              className={field}
            />
            {errors.line1 ? <p className="mt-1.5 text-xs text-danger">{errors.line1}</p> : null}
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="line2" className="sr-only">
              Apartment or landmark
            </label>
            <input
              id="line2"
              name="line2"
              autoComplete="address-line2"
              placeholder="Apartment, landmark (optional)"
              className={field}
            />
          </div>

          <div>
            <label htmlFor="region" className="sr-only">
              Region
            </label>
            <select
              id="region"
              name="region"
              required
              value={region}
              onChange={(event) => setRegion(event.target.value)}
              className={`${field} cursor-pointer`}
            >
              <option value="">Choose a region</option>
              {GHANA_REGIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            {errors.region ? <p className="mt-1.5 text-xs text-danger">{errors.region}</p> : null}
          </div>

          <div>
            <label htmlFor="city" className="sr-only">
              City or town
            </label>
            <input
              id="city"
              name="city"
              required
              autoComplete="address-level2"
              placeholder="City / town"
              className={field}
            />
            {errors.city ? <p className="mt-1.5 text-xs text-danger">{errors.city}</p> : null}
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="postalCode" className="sr-only">
              Digital address
            </label>
            <input
              id="postalCode"
              name="postalCode"
              autoComplete="postal-code"
              placeholder="Digital address, e.g. GA-123-4567 (optional)"
              className={field}
            />
          </div>
        </div>

        {/* Delivery method */}
        <h2 className={sectionHeading}>Delivery method</h2>
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
          <p className="border border-warning/30 bg-warning/5 px-4 py-3 text-sm text-warning">
            We do not deliver to that region yet. Contact us and we will sort something out.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {visibleRates.map((rate) => {
              const active = rateId === rate.id;
              return (
                <label key={rate.id} className={choiceClass(active)}>
                  <input
                    type="radio"
                    name="shippingRateId"
                    value={rate.id}
                    checked={active}
                    onChange={() => setRateId(rate.id)}
                    className="sr-only"
                  />
                  {radioDot(active)}
                  <span className="flex-1 text-left">
                    <span className="block text-sm">{rate.name}</span>
                    {rate.estimatedDaysMin !== null ? (
                      <span className="mt-0.5 block text-xs text-[var(--text-muted)]">
                        {rate.estimatedDaysMin === 0
                          ? "Today or tomorrow"
                          : `${rate.estimatedDaysMin}–${rate.estimatedDaysMax} days`}{" "}
                        · {rate.zoneName}
                      </span>
                    ) : null}
                  </span>
                  <span className="text-sm tabular-nums">
                    {rate.price === 0 ? "Free" : formatPrice(rate.price)}
                  </span>
                </label>
              );
            })}
          </div>
        )}

        {/* Payment */}
        <h2 className={sectionHeading}>Payment</h2>
        <div className="flex flex-col gap-3">
          {PAYMENT_METHODS.map((option) => {
            const active = method === option.id;
            return (
              <label key={option.id} className={choiceClass(active)}>
                <input
                  type="radio"
                  name="paymentMethod"
                  value={option.id}
                  checked={active}
                  onChange={() => setMethod(option.id)}
                  className="sr-only"
                />
                {radioDot(active)}
                <span className="flex-1 text-left text-sm">{option.label}</span>
                <span className="text-xs text-[var(--text-muted)]">{option.note}</span>
              </label>
            );
          })}
        </div>
        {/* Paystack is told which methods to offer, so its screen opens on the
            one that was chosen here rather than a fresh list. */}
        <input type="hidden" name="channels" value={selectedMethod.channels.join(",")} />

        {/* Order note + account */}
        <div className="mt-10 flex flex-col gap-4">
          <div>
            <label
              htmlFor="customerNote"
              className="mb-2 block text-[11px] uppercase tracking-[0.16em] text-[var(--text-muted)]"
            >
              Order note
            </label>
            <textarea
              id="customerNote"
              name="customerNote"
              rows={3}
              placeholder="Anything we should know about the delivery."
              className={`${field} resize-y`}
            />
          </div>

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
                  <label htmlFor="password" className="sr-only">
                    Choose a password
                  </label>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    minLength={8}
                    autoComplete="new-password"
                    placeholder="Choose a password (8+ characters)"
                    className={field}
                  />
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {/* Summary */}
      <aside className="border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-6 lg:sticky lg:top-8">
        <h2 className="mb-5 font-display text-2xl">Order summary</h2>

        {discount}

        <dl className="mt-4">
          <div className="flex justify-between py-2 text-sm text-[var(--text-secondary)]">
            <dt>Subtotal</dt>
            <dd className="tabular-nums">{formatPrice(subtotal)}</dd>
          </div>

          {discountTotal > 0 ? (
            <div className="flex justify-between py-2 text-sm text-sage-600">
              <dt>Discount</dt>
              <dd className="tabular-nums">-{formatPrice(discountTotal)}</dd>
            </div>
          ) : null}

          <div className="flex justify-between py-2 text-sm text-[var(--text-secondary)]">
            <dt>Delivery</dt>
            <dd className="tabular-nums">
              {!selectedRate ? "—" : shippingTotal === 0 ? "Free" : formatPrice(shippingTotal)}
            </dd>
          </div>
        </dl>

        {freeGap > 0 ? (
          <p className="pb-2 text-xs text-sage-600">
            Add {formatPrice(freeGap)} more for free delivery
          </p>
        ) : null}

        <div className="mt-2.5 flex items-baseline justify-between border-t border-[var(--border-strong)] pt-4">
          <span className="text-sm uppercase tracking-[0.06em]">Total</span>
          <span className="font-display text-3xl tabular-nums">{formatPrice(total)}</span>
        </div>

        <button
          type="submit"
          disabled={pending || !selectedRate}
          className="mt-5 flex w-full items-center justify-center gap-2 bg-[var(--accent)] px-6 py-4 text-xs font-medium uppercase tracking-[0.14em] text-[var(--accent-contrast)] transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-50"
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Lock className="h-4 w-4" aria-hidden />
          )}
          {pending ? "Redirecting…" : `Place order · ${formatPrice(total)}`}
        </button>

        <p className="mt-4 flex items-center justify-center gap-2 text-[11.5px] text-[var(--text-muted)]">
          <Lock className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
          Encrypted &amp; secure
        </p>
      </aside>
    </form>
  );
}
