"use client";

import { useActionState, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronDown,
  Clock,
  CreditCard,
  ExternalLink,
  Loader2,
  Lock,
  ShieldCheck,
  ShoppingBag,
  Store,
  Truck,
  Smartphone,
} from "lucide-react";
import { placeOrderAction, type CheckoutState } from "@/app/actions/checkout";
import { formatPrice } from "@/lib/money";
import { GHANA_REGIONS } from "@/lib/constants";
import { MOMO_NETWORK_OPTIONS, type MomoNetworkId } from "@/lib/momo-networks";
import type { PickupLocation } from "@/lib/pickup-locations";
import { cn } from "@/lib/utils";
import { CheckoutSteps } from "./checkout-steps";

/** The one delivery option: the store's fixed fee, quoted on the server. */
export type CheckoutDelivery = {
  /** Sent back with the order so the server can check the price. */
  rateId: string;
  /** Minor units; 0 when free. */
  price: number;
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

/** One bag line as the order summary shows it; editing happens in the bag. */
export type CheckoutSummaryItem = {
  id: string;
  title: string;
  variantTitle: string;
  imageUrl: string | null;
  quantity: number;
  lineTotal: number;
  isPreorder: boolean;
  stockProblem: string | null;
};

type PayWith = MomoNetworkId | "card";

/** Fields on the delivery step; a server error on any of them reopens it. */
const DELIVERY_FIELDS = [
  "email",
  "firstName",
  "lastName",
  "phone",
  "line1",
  "city",
  "region",
  "pickupLocationId",
  "shippingRateId",
];

// 16px on phones: anything smaller makes iOS zoom into the field on focus.
const field =
  "w-full border border-[var(--border-strong)] bg-[var(--surface-raised)] px-3.5 py-3 text-base sm:text-sm " +
  "outline-none transition-colors placeholder:text-ink-400 focus:border-[var(--accent)]";

const labelClass = "mb-1.5 block text-sm text-[var(--text-secondary)]";

const sectionHeading = "mb-4 text-xl sm:text-2xl";

const primaryButton =
  "flex min-h-12 w-full items-center justify-center gap-2 bg-[var(--accent)] px-5 py-4 text-center text-sm font-medium uppercase tracking-[0.1em] text-[var(--accent-contrast)] transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-50 sm:w-auto sm:min-w-64";

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
  delivery,
  directNetworks,
  pickupLocations,
  items,
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
  delivery: CheckoutDelivery;
  /** Networks that get the PIN prompt on the phone; the rest use Paystack's page. */
  directNetworks: MomoNetworkId[];
  /** Where an order can be collected; empty hides the pickup option. */
  pickupLocations: PickupLocation[];
  items: CheckoutSummaryItem[];
  discount: ReactNode;
}) {
  const [state, action, pending] = useActionState<CheckoutState | null, FormData>(
    placeOrderAction,
    null,
  );

  const [step, setStep] = useState<0 | 1>(0);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const deliveryRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);

  const [firstName, setFirstName] = useState(defaults.firstName);
  const [lastName, setLastName] = useState(defaults.lastName);
  const [phone, setPhone] = useState(defaults.phone);
  const [email, setEmail] = useState(defaults.email);
  // One field takes a street address or a digital address (GA-123-4567).
  const [line1, setLine1] = useState(defaults.line1 || defaults.postalCode);
  const [city, setCity] = useState(defaults.city || "Accra");
  const [region, setRegion] = useState(defaults.region || "Greater Accra");
  const [selectedAddressId, setSelectedAddressId] = useState<string>(
    savedAddresses[0]?.id ?? "",
  );
  const [fulfilment, setFulfilment] = useState<"delivery" | "pickup">("delivery");
  const [pickupLocationId, setPickupLocationId] = useState<string>(
    pickupLocations.length === 1 ? pickupLocations[0].id : "",
  );

  // Nothing is picked for the shopper: they name their network (or card) first.
  const [payWith, setPayWith] = useState<PayWith | null>(null);
  const [momoRoute, setMomoRoute] = useState<"direct" | "hosted" | null>(null);
  // Follows the delivery phone until the shopper types a different wallet.
  const [momoPhone, setMomoPhone] = useState<string | null>(null);
  const [preorderDepositOption, setPreorderDepositOption] = useState<"deposit_50" | "full">(
    hasPreorderItems ? "deposit_50" : "full",
  );
  const [stepError, setStepError] = useState<string | null>(null);

  function applySavedAddress(addr: SavedAddressOption) {
    setSelectedAddressId(addr.id);
    setFirstName(addr.firstName);
    setLastName(addr.lastName);
    setPhone(addr.phone);
    setLine1(addr.line1 || addr.postalCode);
    setCity(addr.city);
    setRegion(addr.region);
  }

  // A server error about delivery details sends the shopper back to fix them.
  // Adjusted during render, once per new result, rather than in an effect.
  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    if (Object.keys(state?.fieldErrors ?? {}).some((key) => DELIVERY_FIELDS.includes(key))) {
      setStep(0);
    }
  }

  const isPickup = fulfilment === "pickup";
  const pickupLocation = pickupLocations.find((l) => l.id === pickupLocationId) ?? null;
  // One fixed delivery fee, whatever the region; pickup is free.
  const shippingTotal = isPickup ? 0 : delivery.price;
  // Ready to price: a pickup point, or delivery (always available).
  const fulfilmentChosen = isPickup ? Boolean(pickupLocation) : true;
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
  // A network on the direct list offers a choice: phone prompt or Paystack's
  // page. Any other network goes to Paystack's page with nothing to choose.
  const directAllowed = payWith !== null && payWith !== "card" && directNetworks.includes(payWith);
  const route =
    payWith === null
      ? null
      : payWith === "card"
        ? "card"
        : !directAllowed
          ? "mobile_money"
          : momoRoute === "direct"
            ? "direct_debit"
            : momoRoute === "hosted"
              ? "mobile_money"
              : null;
  const blockingProblem = items.find((item) => item.stockProblem)?.stockProblem ?? null;

  function scrollToTop() {
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

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
    if (!fulfilmentChosen) {
      setStepError(
        isPickup ? "Choose where you will collect your order." : "Choose a delivery option to continue.",
      );
      return;
    }
    setStepError(null);
    setStep(1);
    scrollToTop();
  }

  function backToDelivery() {
    setStep(0);
    scrollToTop();
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

  /** A row in a bordered option list, the way most checkouts group choices. */
  function optionRow(active: boolean): string {
    return cn(
      "flex min-h-14 cursor-pointer items-center gap-3 px-4 py-3.5 transition-colors",
      active ? "bg-[var(--accent)]/5" : "hover:bg-[var(--surface-sunken)]",
    );
  }

  const optionGroup =
    "divide-y divide-[var(--border-subtle)] border border-[var(--border-strong)] bg-[var(--surface-raised)]";

  const payLabel =
    route === "direct_debit"
      ? `Send prompt · ${formatPrice(depositDueNow)}`
      : route === "mobile_money" || route === "card"
        ? `Pay now · ${formatPrice(depositDueNow)}`
        : payWith && payWith !== "card"
          ? "Choose Direct Debit or Paystack"
          : "Choose a payment method";

  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  const summary = (
    <>
      <ul className="flex flex-col gap-4">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-3.5">
            <span className="relative shrink-0">
              <span className="block h-16 w-16 overflow-hidden border border-[var(--border-subtle)] bg-[var(--surface-media)]">
                {item.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
                ) : null}
              </span>
              <span className="absolute -right-2 -top-2 grid h-5 min-w-5 place-items-center rounded-full bg-ink-700 px-1 text-[11px] font-medium text-white tabular-nums">
                {item.quantity}
              </span>
            </span>
            <span className="min-w-0 flex-1 text-sm">
              <span className="block truncate font-medium">{item.title}</span>
              {item.variantTitle && item.variantTitle !== "Default" ? (
                <span className="block truncate text-[var(--text-muted)]">{item.variantTitle}</span>
              ) : null}
              {item.isPreorder ? (
                <span className="block text-xs text-[var(--accent)]">Pre-order</span>
              ) : null}
              {item.stockProblem ? (
                <span className="block text-xs text-danger">{item.stockProblem}</span>
              ) : null}
            </span>
            <span className="shrink-0 text-sm tabular-nums">{formatPrice(item.lineTotal)}</span>
          </li>
        ))}
      </ul>
      <Link
        href="/cart"
        className="mt-3 inline-block text-sm text-[var(--accent)] underline-offset-4 hover:underline"
      >
        Edit bag
      </Link>

      <div className="mt-5 border-t border-[var(--border-subtle)] pt-5">{discount}</div>

      <dl className="mt-4 text-sm">
        <div className="flex justify-between py-1.5 text-[var(--text-secondary)]">
          <dt>Subtotal · {itemCount} {itemCount === 1 ? "item" : "items"}</dt>
          <dd className="tabular-nums">{formatPrice(subtotal)}</dd>
        </div>
        {discountTotal > 0 ? (
          <div className="flex justify-between py-1.5 text-sage-600">
            <dt>Discount</dt>
            <dd className="tabular-nums">-{formatPrice(discountTotal)}</dd>
          </div>
        ) : null}
        <div className="flex justify-between py-1.5 text-[var(--text-secondary)]">
          <dt>{isPickup ? "Pickup" : "Delivery"}</dt>
          <dd className="tabular-nums">
            {shippingTotal === 0 ? "Free" : formatPrice(shippingTotal)}
          </dd>
        </div>
      </dl>

      {freeGap > 0 && !isPickup ? (
        <p className="pt-1 text-xs text-sage-600">
          Add {formatPrice(freeGap)} more for free delivery to your station
        </p>
      ) : null}

      <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-[var(--border-strong)] pt-4">
        <span className="text-base font-medium">Total</span>
        <span className="text-2xl font-semibold tabular-nums">{formatPrice(total)}</span>
      </div>

      {hasPreorderItems && preorderDepositOption === "deposit_50" ? (
        <div className="mt-3 border border-[var(--accent)]/30 bg-[var(--accent)]/5 p-3.5 text-sm">
          <div className="flex justify-between font-medium">
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
    </>
  );

  return (
    <form action={action}>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-12">
        {/* Order summary: a fold-out bar on phones, a sticky column on desktop.
            Rendered once, so the discount field is never in the page twice. */}
        <aside className="-mx-4 border-y border-[var(--border-subtle)] bg-[var(--surface-raised)] sm:mx-0 sm:border lg:sticky lg:top-8 lg:col-start-2 lg:row-start-1">
          <button
            type="button"
            onClick={() => setSummaryOpen((open) => !open)}
            aria-expanded={summaryOpen}
            aria-controls="checkout-summary"
            className="flex w-full items-center justify-between gap-3 px-4 py-4 text-sm lg:hidden"
          >
            <span className="flex items-center gap-2 text-[var(--accent)]">
              <ShoppingBag className="h-4 w-4" aria-hidden />
              {summaryOpen ? "Hide order summary" : "Show order summary"}
              <ChevronDown
                className={cn("h-4 w-4 transition-transform", summaryOpen && "rotate-180")}
                aria-hidden
              />
            </span>
            <span className="text-base font-semibold tabular-nums">{formatPrice(total)}</span>
          </button>
          <div
            id="checkout-summary"
            className={cn(
              "border-t border-[var(--border-subtle)] px-4 pb-5 pt-5 sm:px-5 lg:block lg:border-t-0 lg:p-6",
              summaryOpen ? "block" : "hidden",
            )}
          >
            <h2 className="mb-5 hidden font-display text-2xl lg:block">Order summary</h2>
            {summary}
          </div>
        </aside>

        <div className="min-w-0 lg:col-start-1 lg:row-start-1">
          <div ref={topRef} className="scroll-mt-24">
            <CheckoutSteps current={step} />
          </div>

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
            {/* Contact */}
            <section>
              <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-xl sm:text-2xl">Contact</h2>
                {isSignedIn ? (
                  <span className="text-sm text-[var(--text-secondary)]">
                    Signed in as {defaults.email}
                  </span>
                ) : null}
              </div>
              <div className="grid gap-3.5 sm:grid-cols-2">
                <div>
                  <label htmlFor="email" className={labelClass}>
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
                    inputMode="email"
                    placeholder="you@example.com"
                    className={field}
                  />
                  {errors.email ? <p className="mt-1.5 text-sm text-danger">{errors.email}</p> : null}
                </div>
                <div>
                  <label htmlFor="phone" className={labelClass}>
                    Phone
                  </label>
                  <input
                    id="phone"
                    name="phone"
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    autoComplete="tel"
                    inputMode="tel"
                    placeholder="024 000 0000"
                    className={field}
                  />
                  {errors.phone ? <p className="mt-1.5 text-sm text-danger">{errors.phone}</p> : null}
                </div>
              </div>
              <p className="mt-2 text-xs text-[var(--text-muted)]">
                We send your receipt and delivery updates here.
                {isSignedIn
                  ? null
                  : " New here? Your account is made from this order once it is paid, and we text you how to sign in."}
              </p>
            </section>

            {/* How the order reaches the buyer */}
            <section className="mt-10">
              <h2 className={sectionHeading}>Delivery or pickup</h2>
              <input type="hidden" name="fulfilment" value={fulfilment} />
              <div
                className={cn("grid gap-3", pickupLocations.length > 0 && "grid-cols-2")}
                role="radiogroup"
                aria-label="Delivery or pickup"
              >
                {(
                  [
                    { id: "delivery", label: "Delivery", note: "To your address", Icon: Truck },
                    ...(pickupLocations.length > 0
                      ? [{ id: "pickup", label: "Pickup", note: "Collect it · Free", Icon: Store }]
                      : []),
                  ] as const
                ).map(({ id, label, note, Icon }) => {
                  const active = fulfilment === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => {
                        setFulfilment(id as "delivery" | "pickup");
                        setStepError(null);
                      }}
                      className={cn(
                        "flex min-h-16 items-center gap-3 border px-4 py-3 text-left transition-colors",
                        active
                          ? "border-[var(--accent)] bg-[var(--accent)]/5"
                          : "border-[var(--border-strong)] bg-[var(--surface-raised)] hover:bg-[var(--surface-sunken)]",
                      )}
                    >
                      <Icon
                        className={cn("h-5 w-5 shrink-0", active ? "text-[var(--accent)]" : "text-[var(--text-muted)]")}
                        aria-hidden
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">{label}</span>
                        <span className="block text-xs text-[var(--text-muted)]">{note}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            {isPickup ? (
              <section className="mt-8">
                <h3 className="mb-3 text-base font-medium">Pickup location</h3>
                <div className={optionGroup}>
                  {pickupLocations.map((location) => {
                    const active = pickupLocationId === location.id;
                    return (
                      <label key={location.id} className={optionRow(active)}>
                        <input
                          type="radio"
                          name="pickupLocationId"
                          value={location.id}
                          checked={active}
                          onChange={() => setPickupLocationId(location.id)}
                          className="sr-only"
                        />
                        {radioDot(active)}
                        <span className="min-w-0 flex-1 text-left text-sm">
                          <span className="block font-medium">{location.name}</span>
                          <span className="mt-0.5 block text-[var(--text-muted)]">
                            {[location.address, location.city].filter(Boolean).join(", ")}
                          </span>
                          {location.hours ? (
                            <span className="block text-[var(--text-muted)]">{location.hours}</span>
                          ) : null}
                        </span>
                        <span className="shrink-0 text-sm font-medium">Free</span>
                      </label>
                    );
                  })}
                </div>
                {errors.pickupLocationId ? (
                  <p className="mt-1.5 text-sm text-danger">{errors.pickupLocationId}</p>
                ) : null}

                <h3 className="mb-3 mt-8 text-base font-medium">Who will collect it?</h3>
                <div className="grid gap-3.5 sm:grid-cols-2">
                  <div>
                    <label htmlFor="firstName" className={labelClass}>
                      First name
                    </label>
                    <input
                      id="firstName"
                      name="firstName"
                      required
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      autoComplete="given-name"
                      className={field}
                    />
                    {errors.firstName ? (
                      <p className="mt-1.5 text-sm text-danger">{errors.firstName}</p>
                    ) : null}
                  </div>
                  <div>
                    <label htmlFor="lastName" className={labelClass}>
                      Last name
                    </label>
                    <input
                      id="lastName"
                      name="lastName"
                      required
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      autoComplete="family-name"
                      className={field}
                    />
                  </div>
                </div>
              </section>
            ) : (
              <section className="mt-8">
                <input type="hidden" name="shippingRateId" value={delivery.rateId} />
                <div className="flex items-center justify-between gap-3 border border-[var(--border-strong)] bg-[var(--surface-raised)] px-4 py-3.5 text-sm">
                  <span className="flex items-center gap-2.5">
                    <Truck className="h-4 w-4 text-[var(--accent)]" aria-hidden />
                    <span className="font-medium">Delivery</span>
                  </span>
                  <span className="font-medium tabular-nums">
                    {delivery.price === 0 ? "Free" : formatPrice(delivery.price)}
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-[var(--text-muted)]">
                  One delivery fee for every region.
                </p>

                <h3 className="mb-3 mt-8 text-base font-medium">Delivery details</h3>
                {isSignedIn && savedAddresses.length > 0 ? (
                  <div className="mb-4 flex flex-wrap gap-2">
                    {savedAddresses.map((addr) => {
                      const active = selectedAddressId === addr.id;
                      return (
                        <button
                          key={addr.id}
                          type="button"
                          onClick={() => applySavedAddress(addr)}
                          className={cn(
                            "min-h-10 border px-3 py-2 text-left text-sm transition-colors",
                            active
                              ? "border-[var(--accent)] bg-[var(--accent)]/10 font-medium"
                              : "border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]",
                          )}
                        >
                          {addr.line1}, {addr.label}
                        </button>
                      );
                    })}
                  </div>
                ) : null}

                <div className="grid gap-3.5 sm:grid-cols-2">
                  <div>
                    <label htmlFor="firstName" className={labelClass}>
                      First name
                    </label>
                    <input
                      id="firstName"
                      name="firstName"
                      required
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      autoComplete="given-name"
                      className={field}
                    />
                    {errors.firstName ? (
                      <p className="mt-1.5 text-sm text-danger">{errors.firstName}</p>
                    ) : null}
                  </div>
                  <div>
                    <label htmlFor="lastName" className={labelClass}>
                      Last name
                    </label>
                    <input
                      id="lastName"
                      name="lastName"
                      required
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      autoComplete="family-name"
                      className={field}
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label htmlFor="line1" className={labelClass}>
                      Address / digital address
                    </label>
                    <input
                      id="line1"
                      name="line1"
                      required
                      value={line1}
                      onChange={(e) => setLine1(e.target.value)}
                      autoComplete="address-line1"
                      placeholder="House number and street, or GA-123-4567"
                      className={field}
                    />
                    {errors.line1 ? <p className="mt-1.5 text-sm text-danger">{errors.line1}</p> : null}
                  </div>

                  <div>
                    <label htmlFor="region" className={labelClass}>
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
                    <label htmlFor="city" className={labelClass}>
                      City or town
                    </label>
                    <input
                      id="city"
                      name="city"
                      required
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      autoComplete="address-level2"
                      className={field}
                    />
                    {errors.city ? <p className="mt-1.5 text-sm text-danger">{errors.city}</p> : null}
                  </div>
                </div>
              </section>
            )}

            <section className="mt-8">
              <label htmlFor="customerNote" className={labelClass}>
                Note <span className="text-[var(--text-muted)]">(optional)</span>
              </label>
              <textarea
                id="customerNote"
                name="customerNote"
                rows={3}
                placeholder={
                  isPickup
                    ? "Anything we should know about your pickup."
                    : "Anything we should know about delivery or access."
                }
                className={`${field} resize-y`}
              />
            </section>

            {stepError || blockingProblem ? (
              <p role="alert" className="mt-6 text-sm text-danger">
                {stepError ?? blockingProblem}
              </p>
            ) : null}
            <div className="mt-8 flex flex-col-reverse items-center gap-4 sm:flex-row sm:justify-between">
              <Link
                href="/cart"
                className="flex items-center gap-1.5 text-sm text-[var(--accent)] underline-offset-4 hover:underline"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden />
                Return to bag
              </Link>
              <button
                type="button"
                onClick={goToPayment}
                disabled={Boolean(blockingProblem)}
                className={primaryButton}
              >
                Continue to payment
              </button>
            </div>
          </div>

          {/* ---------------- Step 2: Payment ---------------- */}
          <div hidden={step !== 1}>
            {/* Review, as the big checkouts do before the payment choice */}
            <dl className="divide-y divide-[var(--border-subtle)] border border-[var(--border-strong)] bg-[var(--surface-raised)] px-4 text-sm">
              {[
                { label: "Contact", value: `${email} · ${phone}` },
                isPickup
                  ? {
                      label: "Pickup",
                      value: pickupLocation
                        ? `${firstName} ${lastName} collects from ${pickupLocation.name}${pickupLocation.address ? `, ${pickupLocation.address}` : ""}`
                        : "—",
                    }
                  : {
                      label: "Deliver to",
                      value: `${firstName} ${lastName}, ${line1}, ${city}, ${region}`,
                    },
                {
                  label: "Method",
                  value: isPickup
                    ? "Pickup · Free"
                    : `Delivery · ${delivery.price === 0 ? "Free" : formatPrice(delivery.price)}`,
                },
              ].map((row) => (
                <div key={row.label} className="flex items-start gap-3 py-3">
                  <dt className="w-20 shrink-0 text-[var(--text-muted)] sm:w-24">{row.label}</dt>
                  <dd className="min-w-0 flex-1 break-words">{row.value}</dd>
                  <button
                    type="button"
                    onClick={backToDelivery}
                    className="shrink-0 text-sm text-[var(--accent)] underline-offset-4 hover:underline"
                  >
                    Change
                  </button>
                </div>
              ))}
            </dl>

            {hasPreorderItems ? (
              <section className="mt-10">
                <h2 className={sectionHeading}>Amount to pay today</h2>
                <div className={optionGroup}>
                  <label className={optionRow(preorderDepositOption === "deposit_50")}>
                    <input
                      type="radio"
                      name="preorderDepositOption"
                      value="deposit_50"
                      checked={preorderDepositOption === "deposit_50"}
                      onChange={() => setPreorderDepositOption("deposit_50")}
                      className="sr-only"
                    />
                    {radioDot(preorderDepositOption === "deposit_50")}
                    <span className="min-w-0 flex-1 text-left text-sm">
                      <span className="block font-medium">50% pre-order deposit</span>
                      <span className="mt-0.5 block text-[var(--text-muted)]">
                        The other half is paid on delivery
                      </span>
                    </span>
                    <span className="shrink-0 whitespace-nowrap text-sm font-medium tabular-nums">
                      {formatPrice(Math.round(total * 0.5))}
                    </span>
                  </label>
                  <label className={optionRow(preorderDepositOption === "full")}>
                    <input
                      type="radio"
                      name="preorderDepositOption"
                      value="full"
                      checked={preorderDepositOption === "full"}
                      onChange={() => setPreorderDepositOption("full")}
                      className="sr-only"
                    />
                    {radioDot(preorderDepositOption === "full")}
                    <span className="min-w-0 flex-1 text-left text-sm">Pay the full amount</span>
                    <span className="shrink-0 whitespace-nowrap text-sm tabular-nums">
                      {formatPrice(total)}
                    </span>
                  </label>
                </div>
              </section>
            ) : (
              <input type="hidden" name="preorderDepositOption" value="full" />
            )}

            <section className="mt-10">
              <h2 className="text-xl sm:text-2xl">Payment</h2>
              <p className="mb-4 mt-1 flex items-center gap-1.5 text-sm text-[var(--text-muted)]">
                <Lock className="h-3.5 w-3.5" aria-hidden />
                All payments are secure and encrypted.
              </p>

              {/* One list; the chosen option opens its details underneath. */}
              <div className={optionGroup} role="radiogroup" aria-label="Payment method">
                {MOMO_NETWORK_OPTIONS.map((option) => {
                  const active = payWith === option.id;
                  const direct = directNetworks.includes(option.id);
                  return (
                    <div key={option.id}>
                      <label className={optionRow(active)}>
                        <input
                          type="radio"
                          name="payWith"
                          value={option.id}
                          checked={active}
                          onChange={() => {
                            setPayWith(option.id);
                            setMomoRoute(null);
                          }}
                          className="sr-only"
                        />
                        {radioDot(active)}
                        <span className="min-w-0 flex-1 text-left text-sm">
                          <span className="block font-medium">{option.label}</span>
                          <span className="mt-0.5 block text-[var(--text-muted)]">
                            {direct ? "Direct Debit or Paystack" : "Paystack secure page"}
                          </span>
                        </span>
                        <span
                          aria-hidden
                          className="h-3.5 w-3.5 shrink-0 rounded-full"
                          style={{ backgroundColor: option.color }}
                        />
                      </label>

                      {/* Two ways to pay on this network: let the buyer choose. */}
                      {active && direct ? (
                        <div className="border-t border-[var(--border-subtle)] bg-[var(--surface-sunken)] px-4 pt-4">
                          <p className="mb-2 text-sm text-[var(--text-secondary)]">
                            How would you like to pay with {option.label}?
                          </p>
                          <div className="grid gap-2 sm:grid-cols-2">
                            {(
                              [
                                {
                                  id: "direct",
                                  title: "Direct Debit",
                                  note: "We send a prompt to your phone. Approve with your PIN.",
                                },
                                {
                                  id: "hosted",
                                  title: "Paystack",
                                  note: "Enter your number on Paystack's secure page.",
                                },
                              ] as const
                            ).map((choice) => {
                              const chosen = momoRoute === choice.id;
                              return (
                                <label
                                  key={choice.id}
                                  className={cn(
                                    "flex cursor-pointer items-start gap-2.5 border px-3 py-3 transition-colors",
                                    chosen
                                      ? "border-[var(--accent)] bg-[var(--surface-raised)]"
                                      : "border-[var(--border-strong)] hover:bg-[var(--surface-raised)]",
                                  )}
                                >
                                  <input
                                    type="radio"
                                    name="momoRoute"
                                    value={choice.id}
                                    checked={chosen}
                                    onChange={() => setMomoRoute(choice.id)}
                                    className="sr-only"
                                  />
                                  <span className="mt-0.5">{radioDot(chosen)}</span>
                                  <span className="text-sm">
                                    <span className="block font-medium">{choice.title}</span>
                                    <span className="block text-[var(--text-muted)]">{choice.note}</span>
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}

                      {active && route === "direct_debit" ? (
                        <div className="bg-[var(--surface-sunken)] px-4 py-4">
                          <label
                            htmlFor="momoPhone"
                            className="mb-1.5 flex items-center gap-1.5 text-sm text-[var(--text-secondary)]"
                          >
                            <Smartphone className="h-4 w-4" aria-hidden />
                            {option.label} number
                          </label>
                          <input
                            id="momoPhone"
                            name="momoPhone"
                            type="tel"
                            inputMode="tel"
                            required
                            value={momoPhone ?? phone}
                            onChange={(e) => setMomoPhone(e.target.value)}
                            autoComplete="tel"
                            placeholder="024 000 0000"
                            className={field}
                          />
                          {errors.momoPhone ? (
                            <p className="mt-1.5 text-sm text-danger">{errors.momoPhone}</p>
                          ) : null}
                          <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
                            We will send a request for{" "}
                            <strong className="font-medium text-[var(--text-primary)]">
                              {formatPrice(depositDueNow)}
                            </strong>{" "}
                            to this number. Approve it with your MoMo PIN.
                          </p>
                        </div>
                      ) : null}

                      {active && !direct ? <input type="hidden" name="momoRoute" value="hosted" /> : null}
                      {active && route === "mobile_money" ? (
                        <p
                          className={cn(
                            "flex items-start gap-2.5 bg-[var(--surface-sunken)] px-4 py-4 text-sm leading-relaxed text-[var(--text-secondary)]",
                            !direct && "border-t border-[var(--border-subtle)]",
                          )}
                        >
                          <ExternalLink className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                          <span>
                            After you select Pay now, you will go to our payment partner&apos;s
                            secure page to enter your {option.label} number and approve.
                          </span>
                        </p>
                      ) : null}
                    </div>
                  );
                })}

                <div>
                  <label className={optionRow(payWith === "card")}>
                    <input
                      type="radio"
                      name="payWith"
                      value="card"
                      checked={payWith === "card"}
                      onChange={() => setPayWith("card")}
                      className="sr-only"
                    />
                    {radioDot(payWith === "card")}
                    <span className="min-w-0 flex-1 text-left text-sm">
                      <span className="block font-medium">Debit or credit card</span>
                      <span className="mt-0.5 block text-[var(--text-muted)]">Visa · Mastercard</span>
                    </span>
                    <CreditCard className="h-4 w-4 shrink-0 text-[var(--text-muted)]" aria-hidden />
                  </label>
                  {payWith === "card" ? (
                    <p className="flex items-start gap-2.5 border-t border-[var(--border-subtle)] bg-[var(--surface-sunken)] px-4 py-4 text-sm leading-relaxed text-[var(--text-secondary)]">
                      <ExternalLink className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                      <span>
                        After you select Pay now, you will enter your card details on our payment
                        partner&apos;s secure page.
                      </span>
                    </p>
                  ) : null}
                </div>
              </div>
              {errors.payWith ? <p className="mt-2 text-sm text-danger">{errors.payWith}</p> : null}
            </section>

            <div className="mt-8 flex flex-col-reverse items-center gap-4 sm:flex-row sm:justify-between">
              <button
                type="button"
                onClick={backToDelivery}
                className="flex items-center gap-1.5 text-sm text-[var(--accent)] underline-offset-4 hover:underline"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden />
                Return to delivery
              </button>
              <button
                type="submit"
                disabled={pending || !route || !fulfilmentChosen || Boolean(blockingProblem)}
                className={primaryButton}
              >
                {pending ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                ) : (
                  <Lock className="h-4 w-4 shrink-0" aria-hidden />
                )}
                {pending ? "Starting payment…" : payLabel}
              </button>
            </div>
            <p className="mt-4 flex items-center justify-center gap-2 text-xs text-[var(--text-muted)] sm:justify-end">
              <ShieldCheck className="h-3.5 w-3.5 text-sage-600" strokeWidth={1.5} aria-hidden />
              Nothing is taken until you approve it.
            </p>
          </div>
        </div>
      </div>
    </form>
  );
}
