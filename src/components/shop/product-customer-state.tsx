"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { ReviewForm, type OwnReview } from "./review-form";

type CustomerState = { signedIn: boolean; isSaved: boolean; myReview: OwnReview | null; loadError?: boolean };
const CustomerContext = createContext<CustomerState | null>(null);

/** Customer state is fetched separately from the public product payload. */
export function ProductCustomerState({ productId, children }: { productId: string; children: ReactNode }) {
  const [state, setState] = useState<CustomerState | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/account/product-state?productId=${encodeURIComponent(productId)}`, {
      cache: "no-store", signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) throw new Error("Customer state could not be loaded.");
      return response.json();
    }).then(setState).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [productId]);
  return <CustomerContext.Provider value={failed ? { signedIn: false, isSaved: false, myReview: null, loadError: true } : state}>{children}</CustomerContext.Provider>;
}

export function useProductCustomerState() { return useContext(CustomerContext); }

export function CustomerReviewForm({ productId }: { productId: string }) {
  const state = useProductCustomerState();
  if (state?.loadError) return <p role="alert" className="text-sm text-[var(--text-secondary)]">Review controls could not load. Refresh this page to try again.</p>;
  if (!state) return <p className="text-sm text-[var(--text-secondary)]">Loading review controls…</p>;
  return <ReviewForm productId={productId} signedIn={state.signedIn} existing={state.myReview} />;
}
