"use client";

import { useEffect, useSyncExternalStore } from "react";

export type CurrencyCode = "GHS" | "USD" | "GBP" | "EUR";

export const CURRENCY_RATES: Record<
  CurrencyCode,
  { symbol: string; rateFromGhs: number; label: string }
> = {
  GHS: { symbol: "GH₵", rateFromGhs: 1, label: "GHS ₵" },
  USD: { symbol: "$", rateFromGhs: 0.065, label: "USD $" },
  GBP: { symbol: "£", rateFromGhs: 0.051, label: "GBP £" },
  EUR: { symbol: "€", rateFromGhs: 0.06, label: "EUR €" },
};

function subscribeCurrency(callback: () => void) {
  window.addEventListener("lx-currency-change", callback);
  return () => window.removeEventListener("lx-currency-change", callback);
}

function getCurrencySnapshot(): CurrencyCode {
  try {
    const saved = window.localStorage.getItem("lx_currency") as CurrencyCode | null;
    return saved && CURRENCY_RATES[saved] ? saved : "GHS";
  } catch {
    return "GHS";
  }
}

function getCurrencyServerSnapshot(): CurrencyCode {
  return "GHS";
}

export function useStoreCurrency(): [CurrencyCode, (next: CurrencyCode) => void] {
  const currency = useSyncExternalStore(
    subscribeCurrency,
    getCurrencySnapshot,
    getCurrencyServerSnapshot,
  );

  function setCurrency(next: CurrencyCode) {
    try {
      window.localStorage.setItem("lx_currency", next);
      window.dispatchEvent(new CustomEvent("lx-currency-change", { detail: next }));
    } catch {}
  }

  return [currency, setCurrency];
}

export function formatConvertedFromMinorGhs(minorGhs: number, code: CurrencyCode): string {
  const ghs = minorGhs / 100;
  if (code === "GHS") {
    return `GH₵${ghs.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
  const entry = CURRENCY_RATES[code];
  const converted = ghs * entry.rateFromGhs;
  return `${entry.symbol}${converted.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

export function CurrencySwitcher() {
  const [currency, setCurrency] = useStoreCurrency();

  useEffect(() => {
    fetch("/api/fx")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.rateFromGhs) {
          if (typeof data.rateFromGhs.USD === "number") {
            CURRENCY_RATES.USD.rateFromGhs = data.rateFromGhs.USD;
          }
          if (typeof data.rateFromGhs.GBP === "number") {
            CURRENCY_RATES.GBP.rateFromGhs = data.rateFromGhs.GBP;
          }
          if (typeof data.rateFromGhs.EUR === "number") {
            CURRENCY_RATES.EUR.rateFromGhs = data.rateFromGhs.EUR;
          }
          window.dispatchEvent(
            new CustomEvent("lx-currency-change", {
              detail: (window.localStorage.getItem("lx_currency") as CurrencyCode) ?? "GHS",
            }),
          );
        }
      })
      .catch(() => {});
  }, []);

  return (
    <label className="inline-flex items-center">
      <span className="sr-only">Display currency</span>
      <select
        value={currency}
        onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
        className="cursor-pointer border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-2 py-1.5 text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--text-secondary)] outline-none transition-colors hover:border-[var(--border-strong)] focus:border-[var(--accent)]"
        title="Switch display currency (GHS, USD, GBP, EUR)"
      >
        {(Object.keys(CURRENCY_RATES) as CurrencyCode[]).map((code) => (
          <option key={code} value={code}>
            {CURRENCY_RATES[code].label}
          </option>
        ))}
      </select>
    </label>
  );
}
