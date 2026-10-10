"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Re-renders the confirmation page every few seconds while a payment is
 * pending. The page verifies with the provider on each render, so it turns
 * into the receipt by itself once the shopper approves the prompt.
 */
export function PaymentStatusRefresher({
  intervalMs = 5000,
  maxChecks = 36,
}: {
  intervalMs?: number;
  maxChecks?: number;
}) {
  const router = useRouter();

  useEffect(() => {
    let checks = 0;
    const timer = setInterval(() => {
      checks += 1;
      if (checks > maxChecks) {
        clearInterval(timer);
        return;
      }
      router.refresh();
    }, intervalMs);
    return () => clearInterval(timer);
  }, [router, intervalMs, maxChecks]);

  return null;
}
