import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "./env";
import { getIntegrations } from "./integrations";

/**
 * Paystack client.
 *
 * Amounts are already in minor units everywhere in this codebase, which is
 * exactly what Paystack expects, so nothing is converted at this boundary.
 */

const API = "https://api.paystack.co";

export class PaystackError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "PaystackError";
  }
}

async function call<T>(
  path: string,
  init: { method: "GET" | "POST"; body?: unknown } = { method: "GET" },
): Promise<T> {
  const secret = (await getIntegrations()).paystack.secretKey;
  if (!secret) {
    throw new PaystackError(
      "Paystack is not configured. Add its keys under Settings → Integrations.",
    );
  }

  const response = await fetch(`${API}${path}`, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as
    | { status: boolean; message: string; data: T }
    | null;

  if (!response.ok || !payload?.status) {
    throw new PaystackError(
      payload?.message ?? `Paystack request failed (${response.status}).`,
      response.status,
    );
  }
  return payload.data;
}

// --- Initialise -------------------------------------------------------------

export type InitializeResult = {
  authorization_url: string;
  access_code: string;
  reference: string;
};

export async function initializeTransaction(args: {
  email: string;
  amount: number;
  reference: string;
  callbackUrl: string;
  currency?: string;
  metadata?: Record<string, unknown>;
  /** Restrict payment methods; Ghana defaults to card + MoMo. */
  channels?: string[];
}): Promise<InitializeResult> {
  return call<InitializeResult>("/transaction/initialize", {
    method: "POST",
    body: {
      email: args.email,
      amount: args.amount,
      currency: args.currency ?? env.currency(),
      reference: args.reference,
      callback_url: args.callbackUrl,
      metadata: args.metadata ?? {},
      channels: args.channels ?? ["card", "mobile_money", "bank_transfer", "ussd"],
    },
  });
}

// --- Verify -----------------------------------------------------------------

export type PaystackTransaction = {
  id: number;
  status: "success" | "failed" | "abandoned" | "ongoing" | "pending";
  reference: string;
  amount: number;
  currency: string;
  channel: string | null;
  paid_at: string | null;
  gateway_response: string | null;
  authorization: {
    authorization_code: string | null;
    last4: string | null;
    brand: string | null;
    mobile_money_number: string | null;
    channel: string | null;
  } | null;
  customer: { email: string } | null;
  metadata: Record<string, unknown> | null;
};

export async function verifyTransaction(reference: string): Promise<PaystackTransaction> {
  return call<PaystackTransaction>(`/transaction/verify/${encodeURIComponent(reference)}`);
}

// --- Refund -----------------------------------------------------------------

export async function refundTransaction(args: {
  reference: string;
  /** Minor units. Omit to refund the full amount. */
  amount?: number;
  reason?: string;
}): Promise<{ id: number; status: string; amount: number }> {
  return call("/refund", {
    method: "POST",
    body: {
      transaction: args.reference,
      ...(args.amount ? { amount: args.amount } : {}),
      ...(args.reason ? { merchant_note: args.reason } : {}),
    },
  });
}

// --- Webhook ----------------------------------------------------------------

/**
 * Paystack signs the raw request body with HMAC-SHA512 using the secret key.
 * The comparison is constant-time so the signature cannot be probed byte by
 * byte.
 */
export async function verifyWebhookSignature(
  rawBody: string,
  signature: string | null,
): Promise<boolean> {
  const secret = (await getIntegrations()).paystack.secretKey;
  if (!secret || !signature) return false;

  const expected = createHmac("sha512", secret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export type PaystackWebhookEvent = {
  event: string;
  data: PaystackTransaction & { [key: string]: unknown };
};

/** Human label for the payment channel, for order timelines and receipts. */
export function describeChannel(channel: string | null): string {
  switch (channel) {
    case "mobile_money":
      return "Mobile Money";
    case "card":
      return "Card";
    case "bank_transfer":
      return "Bank transfer";
    case "ussd":
      return "USSD";
    case "bank":
      return "Bank";
    default:
      return channel ? channel.replace(/_/g, " ") : "Unknown";
  }
}
