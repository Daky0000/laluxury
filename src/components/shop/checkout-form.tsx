"use client";

import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CreditCard,
  Clock,
  ExternalLink,
  Loader2,
  Lock,
  MapPin,
  ShieldCheck,
  Smartphone,
  UserCheck,
} from "lucide-react";
import { placeOrderAction, type CheckoutState } from "@/app/actions/checkout";
import { formatPrice } from "@/lib/money";
import { GHANA_REGIONS } from "@/lib/constants";
import { MOMO_NETWORK_OPTIONS, momoRouteFor, type MomoNetworkId } from "@/lib/momo-networks";
import { cn } from "@/lib/utils";
import { CheckoutSteps } from "./checkout-steps";

type Rate = {
  id: string;
  name: string;
  price: number;
  zoneName: string;
  estimatedDaysMin: number | null;
  estimatedDaysMax: number | null;
  isFree: boolean;
};

export type SavedAddressOption = {
  id: string;
  label: string;
  firstName: string;
  lastName: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  region: string;
  postalCode: string;
};

type PayWith = MomoNetworkId | "card";

/** Fields on the delivery step; a server error on any of them reopens it. */
const DELIVERY_FIELDS = [
  "email",
  "firstName",
  "lastName",
  "phone",
  "line1",
  "line2",
  "city",
  "region",
  "postalCode",
  "shippingRateId",
  "password",
];

const field =
  "w-full border border-[var(--border-strong)] bg-[var(--surface-raised)] px-4 py-3.5 text-sm " +
  "outline-none transition-colors placeholder:text-ink-400 focus:border-[var(--accent)]";

const sectionHeading = "mb-4 mt-10 text-[clamp(1.5rem,3vw,1.875rem)] first:mt-0";

const primaryButton =
  "flex min-h-12 w-full items-center justify-center gap-2 bg-[var(--accent)] px-4 py-4 text-center text-sm font-medium uppercase tracking-[0.1em] text-[var(--accent-contrast)] transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-50 sm:px-6 sm:tracking-[0.14em]";

export type CheckoutDefaults = {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  region: string;
  postalCode: string;
};

export function CheckoutForm({
  subtotal,
  discountTotal,
  goodsTotal,
  defaults,
  savedAddresses = [],
  isSignedIn,
  hasPreorderItems = false,
  freeShippingThreshold,
  directNetworks,
  lines,
  discount,
}: {
  subtotal: number;
  discountTotal: number;
  goodsTotal: number;
  defaults: CheckoutDefaults;
  savedAddresses?: SavedAddressOption[];
  isSignedIn: boolean;
  hasPreorderItems?: boolean;
  freeShippingThreshold: number | null;
  /** Networks that get the PIN prompt on the phone; the rest use Paystack's page. */
  directNetworks: MomoNetworkId[];
  lines: ReactNode;
  discount: ReactNode;
}) {
  const [state, action, pending] = useActionState<CheckoutState | null, FormData>(
    placeOrderAction,
    null,
  );

  const [step, setStep] = useState<0 | 1>(0);
  const deliveryRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);

  const [firstName, setFirstName] = useState(defaults.firstName);
  const [lastName, setLastName] = useState(defaults.lastName);
  const [phone, setPhone] = useState(defaults.phone);
  const [email, setEmail] = useState(defaults.email);
  const [line1, setLine1] = useState(defaults.line1);
  const [line2, setLine2] = useState(defaults.line2);
  const [city, setCity] = useState(defaults.city || "Accra");
  const [region, setRegion] = useState(defaults.region || "Greater Accra");
  const [postalCode, setPostalCode] = useState(defaults.postalCode);
  const [selectedAddressId, setSelectedAddressId] = useState<string>(
    savedAddresses[0]?.id ?? "",
  );

  const [rates, setRates] = useState<Rate[]>([]);
  const [rateId, setRateId] = useState<string>("");
  const [loadingRates, setLoadingRates] = useState(false);
  // Nothing is picked for the shopper: they name their network (or card) first.
  const [payWith, setPayWith] = useState<PayWith | null>(null);
  // Follows the delivery phone until the shopper types a different wallet.
  const [momoPhone, setMomoPhone] = useState<string | null>(null);
  const [preorderDepositOption, setPreorderDepositOption] = useState<"deposit_50" | "full">(
    hasPreorderItems ? "deposit_50" : "full",
  );
  const [createAccount, setCreateAccount] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);

  function applySavedAddress(addr: SavedAddressOption) {
    setSelectedAddressId(addr.id);
    setFirstName(addr.firstName);
    setLastName(addr.lastName);
    setPhone(addr.phone);
    setLine1(addr.line1);
    setLine2(addr.line2);
    setCity(addr.city);
    setRegion(addr.region);
    setPostalCode(addr.postalCode);
  }

  useEffect(() => {
    if (!region) return;

    const controller = new AbortController();

    const timer = setTimeout(() => {
      setLoadingRates(true);

      fetch(`/api/shipping/quote?region=${encodeURIComponent(region)}`, {
        signal: controller.signal,
      })
        .then((r) => r.json())
        .then((data: { rates: Rate[] }) => {
          setRates(data.rates ?? []);
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

  // A server error about delivery details sends the shopper back to fix them.
  // Adjusted during render, once per new result, rather than in an effect.
  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    if (Object.keys(state?.fieldErrors ?? {}).some((key) => DELIVERY_FIELDS.includes(key))) {
      setStep(0);
    }
  }

  const visibleRates = region ? rates : [];
  const selectedRate = visibleRates.find((r) => r.id === rateId);
  const shippingTotal = selectedRate?.price ?? 0;
  const total = goodsTotal + shippingTotal;
  const depositDueNow =
    hasPreorderItems && preorderDepositOption === "deposit_50"
      ? Math.round(total * 0.5)
      : total;
  const balanceOnDelivery = total - depositDueNow;

  const freeGap =
    freeShippingThreshold && goodsTotal > 0 && goodsTotal < freeShippingThreshold
      ? freeShippingThreshold - goodsTotal
      : 0;

  const errors = state?.fieldErrors ?? {};
  const route =
    payWith === null ? null : payWith === "card" ? "card" : momoRouteFor(payWith, directNetworks);
  const network = MOMO_NETWORK_OPTIONS.find((n) => n.id === payWith);

  function goToPayment() {
    const fields = deliveryRef.current?.querySelectorAll<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >("input, select, textarea");
    for (const el of fields ?? []) {
      if (!el.checkValidity()) {
        el.reportValidity();
        return;
      }
    }
    if (!selectedRate) {
      setStepError("Choose a delivery option to continue.");
      return;
    }
    setStepError(null);
    setStep(1);
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function choiceClass(active: boolean): string {
    return cn(
      "flex min-h-14 cursor-pointer items-center gap-3.5 border px-4 py-3.5 transition-colors",
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

  const payLabel =
    route === "direct_debit"
      ? `Send prompt to my phone · ${formatPrice(depositDueNow)}`
      : route === "mobile_money"
        ? `Continue to secure payment · ${formatPrice(depositDueNow)}`
        : route === "card"
          ? `Pay by card · ${formatPrice(depositDueNow)}`
          : "Choose how you will pay";

  return (
    <form action={action}>
      <div ref={topRef} className="scroll-mt-24">
        <CheckoutSteps current={step} />
      </div>

      <div className="grid items-start gap-10 lg:grid-cols-[1fr_400px] lg:gap-13">
        <div>
          {state?.message ? (
            <p
              role="alert"
              className="mb-6 border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger"
            >
              {state.message}
            </p>
          ) : null}

          {/* ---------------- Step 1: Delivery ---------------- */}
          <div ref={deliveryRef} hidden={step !== 0}>
            <div className="mb-6 border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4 sm:p-5">
              {isSignedIn ? (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 text-sm">
                    <UserCheck className="h-4 w-4 text-[var(--accent)]" aria-hidden />
                    <span>
                      Signed in as <strong className="font-medium">{defaults.email}</strong>
                    </span>
                  </div>
                  <Link
                    href="/account"
                    className="text-xs uppercase tracking-[0.14em] text-[var(--accent)] hover:underline"
                  >
                    Manage account →
                  </Link>
                </div>
              ) : (
                <p className="text-sm text-[var(--text-secondary)]">
                  Checking out as a guest.{" "}
                  <Link
                    href="/login?next=/checkout"
                    className="font-medium text-[var(--accent)] underline-offset-4 hover:underline"
                  >
                    Sign in
                  </Link>{" "}
                  to use a saved address.
                </p>
              )}

              {isSignedIn && savedAddresses.length > 0 ? (
                <div className="mt-4 border-t border-[var(--border-subtle)] pt-3.5">
                  <p className="mb-2 flex items-center gap-1.5 text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">
                    <MapPin className="h-3.5 w-3.5" aria-hidden />
                    Saved delivery addresses
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {savedAddresses.map((addr) => {
                      const active = selectedAddressId === addr.id;
                      return (
                        <button
                          key={addr.id}
                          type="button"
                          onClick={() => applySavedAddress(addr)}
                          className={cn(
                            "border px-3 py-1.5 text-left text-xs transition-colors",
                            active
                              ? "border-[var(--accent)] bg-[var(--accent)]/10 font-medium text-[var(--text-primary)]"
                              : "border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]",
                          )}
                        >
                          {addr.label} · {addr.line1}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>

            {lines}

            <h2 className={sectionHeading}>Delivery details</h2>
            <div className="grid gap-3.5 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <div className="grid gap-3.5 sm:grid-cols-2">
                  <label htmlFor="firstName" className="sr-only">
                    First name
                  </label>
                  <input
                    id="firstName"
                    name="firstName"
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
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
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    autoComplete="family-name"
                    placeholder="Last name"
                    className={field}
                  />
                </div>
                {errors.firstName || errors.lastName ? (
                  <p className="mt-1.5 text-sm text-danger">{errors.firstName ?? errors.lastName}</p>
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
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  autoComplete="tel"
                  placeholder="Phone number (e.g. 024 000 0000)"
                  className={field}
                />
                {errors.phone ? <p className="mt-1.5 text-sm text-danger">{errors.phone}</p> : null}
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
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  placeholder="Email address (for your receipt)"
                  className={field}
                />
                {errors.email ? <p className="mt-1.5 text-sm text-danger">{errors.email}</p> : null}
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="line1" className="sr-only">
                  Delivery address
                </label>
                <input
                  id="line1"
                  name="line1"
                  required
                  value={line1}
                  onChange={(e) => setLine1(e.target.value)}
                  autoComplete="address-line1"
                  placeholder="Street address, area or house number"
                  className={field}
                />
                {errors.line1 ? <p className="mt-1.5 text-sm text-danger">{errors.line1}</p> : null}
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="line2" className="sr-only">
                  Apartment or landmark
                </label>
                <input
                  id="line2"
                  name="line2"
                  value={line2}
                  onChange={(e) => setLine2(e.target.value)}
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
                {errors.region ? <p className="mt-1.5 text-sm text-danger">{errors.region}</p> : null}
              </div>

              <div>
                <label htmlFor="city" className="sr-only">
                  City or town
                </label>
                <input
                  id="city"
                  name="city"
                  required
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  autoComplete="address-level2"
                  placeholder="City / town"
                  className={field}
                />
                {errors.city ? <p className="mt-1.5 text-sm text-danger">{errors.city}</p> : null}
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="postalCode" className="sr-only">
                  Digital address
                </label>
                <input
                  id="postalCode"
                  name="postalCode"
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                  autoComplete="postal-code"
                  placeholder="Digital address, e.g. GA-123-4567 (optional)"
                  className={field}
                />
              </div>
            </div>

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
                      <span className="min-w-0 flex-1 text-left">
                        <span className="block text-sm">{rate.name}</span>
                        {rate.estimatedDaysMin !== null ? (
                          <span className="mt-0.5 block text-sm text-[var(--text-muted)]">
                            {rate.estimatedDaysMin === 0
                              ? "Today or tomorrow"
                              : `${rate.estimatedDaysMin}–${rate.estimatedDaysMax} days`}{" "}
                            · {rate.zoneName}
                          </span>
                        ) : null}
                      </span>
                      <span className="shrink-0 whitespace-nowrap text-sm tabular-nums">
                        {rate.price === 0 ? "Free" : formatPrice(rate.price)}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}

            <div className="mt-10 flex flex-col gap-4">
              <div>
                <label
                  htmlFor="customerNote"
                  className="mb-2 block text-sm uppercase tracking-[0.16em] text-[var(--text-muted)]"
                >
                  Order note (optional)
                </label>
                <textarea
                  id="customerNote"
                  name="customerNote"
                  rows={2}
                  placeholder="Anything we should know about delivery or room access."
                  className={`${field} resize-y`}
                />
              </div>

              {!isSignedIn ? (
                <div className="border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4">
                  <label className="flex min-h-9 cursor-pointer items-center gap-2.5 text-sm font-medium">
                    <input
                      type="checkbox"
                      name="createAccount"
                      checked={createAccount}
                      onChange={(event) => setCreateAccount(event.target.checked)}
                      className="h-5 w-5 shrink-0 accent-[var(--accent)]"
                    />
                    Save my details for next time (create an account)
                  </label>

                  {createAccount ? (
                    <div className="mt-3 max-w-md">
                      <label htmlFor="password" className="sr-only">
                        Choose a password
                      </label>
                      <input
                        id="password"
                        name="password"
                        type="password"
                        minLength={8}
                        required={createAccount}
                        autoComplete="new-password"
                        placeholder="Choose a password (8+ characters, a capital and a number)"
                        className={field}
                      />
                      {errors.password ? (
                        <p className="mt-1.5 text-sm text-danger">{errors.password}</p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            {stepError ? (
              <p role="alert" className="mt-6 text-sm text-danger">
                {stepError}
              </p>
            ) : null}
            <button type="button" onClick={goToPayment} className={cn(primaryButton, "mt-8")}>
              Continue to payment · {formatPrice(depositDueNow)}
            </button>
          </div>

          {/* ---------------- Step 2: Payment ---------------- */}
          <div hidden={step !== 1}>
            <div className="mb-8 flex items-start justify-between gap-4 border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-5 py-4 text-sm">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">
                  Delivering to
                </p>
                <p className="mt-1">
                  {firstName} {lastName} · {phone}
                </p>
                <p className="truncate text-[var(--text-secondary)]">
                  {line1}
                  {line2 ? `, ${line2}` : ""}, {city}, {region}
                </p>
                {selectedRate ? (
                  <p className="text-[var(--text-secondary)]">{selectedRate.name}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setStep(0)}
                className="flex shrink-0 items-center gap-1 text-xs uppercase tracking-[0.14em] text-[var(--accent)] hover:underline"
              >
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
                Edit
              </button>
            </div>

            {hasPreorderItems ? (
              <>
                <h2 className={sectionHeading}>How much to pay today</h2>
                <div className="mb-10 flex flex-col gap-3">
                  <label className={choiceClass(preorderDepositOption === "deposit_50")}>
                    <input
                      type="radio"
                      name="preorderDepositOption"
                      value="deposit_50"
                      checked={preorderDepositOption === "deposit_50"}
                      onChange={() => setPreorderDepositOption("deposit_50")}
                      className="sr-only"
                    />
                    {radioDot(preorderDepositOption === "deposit_50")}
                    <span className="min-w-0 flex-1 text-left">
                      <span className="block text-sm font-medium">50% pre-order deposit</span>
                      <span className="mt-0.5 block text-xs text-[var(--text-muted)]">
                        The other half is paid on delivery
                      </span>
                    </span>
                    <span className="shrink-0 whitespace-nowrap text-sm font-medium tabular-nums">
                      {formatPrice(Math.round(total * 0.5))}
                    </span>
                  </label>

                  <label className={choiceClass(preorderDepositOption === "full")}>
                    <input
                      type="radio"
                      name="preorderDepositOption"
                      value="full"
                      checked={preorderDepositOption === "full"}
                      onChange={() => setPreorderDepositOption("full")}
                      className="sr-only"
                    />
                    {radioDot(preorderDepositOption === "full")}
                    <span className="min-w-0 flex-1 text-left">
                      <span className="block text-sm">Pay the full amount</span>
                    </span>
                    <span className="shrink-0 whitespace-nowrap text-sm tabular-nums">
                      {formatPrice(total)}
                    </span>
                  </label>
                </div>
              </>
            ) : (
              <input type="hidden" name="preorderDepositOption" value="full" />
            )}

            <h2 className={sectionHeading}>How will you pay?</h2>
            <p className="-mt-2 mb-4 text-sm text-[var(--text-secondary)]">
              Choose your Mobile Money network, or pay by card.
            </p>
            <div className="grid grid-cols-2 gap-3">
              {MOMO_NETWORK_OPTIONS.map((option) => {
                const active = payWith === option.id;
                const direct = directNetworks.includes(option.id);
                return (
                  <label key={option.id} className={cn(choiceClass(active), "items-start")}>
                    <input
                      type="radio"
                      name="payWith"
                      value={option.id}
                      checked={active}
                      onChange={() => setPayWith(option.id)}
                      className="sr-only"
                    />
                    <span
                      aria-hidden
                      className="mt-1 h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: option.color }}
                    />
                    <span className="min-w-0 text-left">
                      <span className="block text-sm font-medium">{option.label}</span>
                      <span className="mt-0.5 block text-xs text-[var(--text-muted)]">
                        {direct ? "Prompt on your phone" : "Secure payment page"}
                      </span>
                    </span>
                  </label>
                );
              })}
              <label className={cn(choiceClass(payWith === "card"), "items-start")}>
                <input
                  type="radio"
                  name="payWith"
                  value="card"
                  checked={payWith === "card"}
                  onChange={() => setPayWith("card")}
                  className="sr-only"
                />
                <CreditCard className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden />
                <span className="min-w-0 text-left">
                  <span className="block text-sm font-medium">Bank card</span>
                  <span className="mt-0.5 block text-xs text-[var(--text-muted)]">
                    Visa · Mastercard
                  </span>
                </span>
              </label>
            </div>
            {errors.payWith ? <p className="mt-2 text-sm text-danger">{errors.payWith}</p> : null}

            {route === "direct_debit" && network ? (
              <div className="mt-6 border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-5">
                <label
                  htmlFor="momoPhone"
                  className="mb-2 flex items-center gap-2 text-sm uppercase tracking-[0.16em] text-[var(--text-muted)]"
                >
                  <Smartphone className="h-4 w-4" aria-hidden />
                  {network.label} number
                </label>
                <input
                  id="momoPhone"
                  name="momoPhone"
                  type="tel"
                  required
                  value={momoPhone ?? phone}
                  onChange={(e) => setMomoPhone(e.target.value)}
                  autoComplete="tel"
                  placeholder="e.g. 024 000 0000"
                  className={field}
                />
                {errors.momoPhone ? (
                  <p className="mt-1.5 text-sm text-danger">{errors.momoPhone}</p>
                ) : null}
                <p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)]">
                  We will send a request for{" "}
                  <strong className="font-medium text-[var(--text-primary)]">
                    {formatPrice(depositDueNow)}
                  </strong>{" "}
                  to this number. Approve it on your phone with your MoMo PIN.
                </p>
              </div>
            ) : route === "mobile_money" && network ? (
              <p className="mt-6 flex items-start gap-2.5 border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-5 text-sm leading-relaxed text-[var(--text-secondary)]">
                <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden />
                <span>
                  You will finish on our payment partner&apos;s secure page. Enter your{" "}
                  {network.label} number there and follow the steps it shows to approve.
                </span>
              </p>
            ) : route === "card" ? (
              <p className="mt-6 flex items-start gap-2.5 border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-5 text-sm leading-relaxed text-[var(--text-secondary)]">
                <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden />
                <span>You will enter your card details on our payment partner&apos;s secure page.</span>
              </p>
            ) : null}

            <button
              type="submit"
              disabled={pending || !route || !selectedRate}
              className={cn(primaryButton, "mt-8")}
            >
              {pending ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
              ) : (
                <Lock className="h-4 w-4 shrink-0" aria-hidden />
              )}
              {pending ? "Starting payment…" : payLabel}
            </button>
            <p className="mt-3 flex items-center justify-center gap-2 text-xs text-[var(--text-muted)]">
              <ShieldCheck className="h-3.5 w-3.5 text-sage-600" strokeWidth={1.5} aria-hidden />
              Payments are encrypted. Nothing is taken until you approve it.
            </p>
          </div>
        </div>

        {/* Summary */}
        <aside className="border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-5 sm:p-6 lg:sticky lg:top-8">
          <h2 className="mb-5 font-display text-2xl">Order summary</h2>

          {discount}

          <dl className="mt-4">
            <div className="flex justify-between py-2 text-sm text-[var(--text-secondary)]">
              <dt>Subtotal</dt>
              <dd className="font-medium tabular-nums">{formatPrice(subtotal)}</dd>
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
            <p className="pb-2 text-sm text-sage-600">
              Add {formatPrice(freeGap)} more for free delivery to your station
            </p>
          ) : null}

          <div className="mt-2.5 flex items-baseline justify-between gap-3 border-t border-[var(--border-strong)] pt-4">
            <span className="text-sm uppercase tracking-[0.06em]">Order Total</span>
            <span className="text-[clamp(1.5rem,6vw,1.875rem)] font-semibold tabular-nums">
              {formatPrice(total)}
            </span>
          </div>

          {hasPreorderItems && preorderDepositOption === "deposit_50" ? (
            <div className="mt-3 border border-[var(--accent)]/30 bg-[var(--accent)]/5 p-3.5 text-xs">
              <div className="flex justify-between font-medium text-[var(--text-primary)]">
                <span>Due today (50% deposit)</span>
                <span className="tabular-nums">{formatPrice(depositDueNow)}</span>
              </div>
              <div className="mt-1 flex justify-between text-[var(--text-secondary)]">
                <span>Balance on delivery</span>
                <span className="tabular-nums">{formatPrice(balanceOnDelivery)}</span>
              </div>
            </div>
          ) : null}

          {hasPreorderItems ? (
            <p className="mt-3 flex items-start gap-2 text-xs text-[var(--text-secondary)]">
              <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--accent)]" aria-hidden />
              <span>Includes pre-order items, made for you before delivery.</span>
            </p>
          ) : null}
        </aside>
      </div>
    </form>
  );
}
