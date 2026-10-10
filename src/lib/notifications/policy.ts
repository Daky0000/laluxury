export const MAX_ATTEMPTS = 5;

export type DeliveryResult = {
  status: "ACCEPTED" | "FAILED" | "UNKNOWN" | "SUPPRESSED";
  code?: string;
  retryable?: boolean;
};

/** SMTP rejection is safe to retry only when nonacceptance is established. */
export function classifyEmailError(error: unknown): DeliveryResult {
  const value = error as { code?: string; responseCode?: number; command?: string } | null;
  const code = value?.code || "SMTP_ERROR";
  if (value?.responseCode && value.responseCode >= 400 && value.responseCode < 500) {
    return { status: "FAILED", code: `SMTP_${value.responseCode}`, retryable: true };
  }
  if (value?.responseCode && value.responseCode >= 500) {
    return { status: "FAILED", code: `SMTP_${value.responseCode}` };
  }
  if (["ECONNREFUSED", "EDNS", "ENOTFOUND", "EAI_AGAIN"].includes(code)) {
    return { status: "FAILED", code, retryable: true };
  }
  if (["EAUTH", "EENVELOPE", "EMESSAGE"].includes(code)) return { status: "FAILED", code };
  // A dropped DATA connection can mean the provider accepted the message.
  return { status: "UNKNOWN", code };
}

export function deliveryTransition(result: DeliveryResult, attempt: number, now: Date) {
  const retry = result.retryable === true && result.status === "FAILED" && attempt < MAX_ATTEMPTS;
  return {
    status: retry ? "QUEUED" : result.status,
    nextAttemptAt: new Date(now.getTime() + Math.min(60 * 60_000, 30_000 * 2 ** Math.max(0, attempt - 1))),
    failureCode: result.code ?? null,
    acceptedAt: result.status === "ACCEPTED" ? now : null,
    lockedAt: null,
    lockToken: null,
  };
}

/** Inbox destinations never carry guest access tokens or external URLs. */
export function safeNotificationUrl(url: string): string {
  return /^\/orders\/track\?order=[A-Za-z0-9%-]+$/.test(url) ? url : "/account";
}

export function isNoticeCurrent(event: string, order: { status: string; paymentStatus: string }): boolean {
  const expectedStatus: Record<string, string> = {
    "order.processing": "PROCESSING", "order.fulfilled": "FULFILLED", "order.shipped": "SHIPPED",
    "order.delivered": "DELIVERED", "order.cancelled": "CANCELLED",
  };
  if (expectedStatus[event]) return order.status === expectedStatus[event];
  if (event === "order.placed") return order.status === "PENDING" && order.paymentStatus !== "SUCCESS";
  if (event === "payment.failed") return order.paymentStatus === "FAILED" && !["CANCELLED", "REFUNDED"].includes(order.status);
  if (event === "payment.received") return order.paymentStatus === "SUCCESS";
  return true;
}
