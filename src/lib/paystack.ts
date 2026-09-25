import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "./env";
import { getIntegrations, activePaystack } from "./integrations";

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
  const secret = activePaystack(await getIntegrations()).secretKey;
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
  const secret = activePaystack(await getIntegrations()).secretKey;
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

// --- Direct Mobile Money Push-to-Phone (Ghana USSD / STK PIN Prompt) --------

export type MomoProvider = "mtn" | "vod" | "tgo";

export const MOMO_PROVIDER_LABELS: Record<MomoProvider, string> = {
  mtn: "MTN Mobile Money (MoMo)",
  vod: "Telecel Cash (Vodafone)",
  tgo: "AT Money (AirtelTigo)",
};

/**
 * Auto-detects the Ghanaian mobile money network from standard phone prefixes:
 * - MTN: 024, 054, 055, 059, 025
 * - Telecel (Vodafone): 020, 050
 * - AT (AirtelTigo): 027, 057, 026, 056
 */
export function detectGhanaMomoProvider(rawPhone: string): MomoProvider {
  const digits = rawPhone.replace(/\D/g, "");
  // Normalise 233XXXXXXXXX -> 0XXXXXXXXX
  const local = digits.startsWith("233") && digits.length >= 12
    ? "0" + digits.slice(3)
    : digits;

  const prefix = local.slice(0, 3);
  if (["020", "050"].includes(prefix)) return "vod";
  if (["027", "057", "026", "056"].includes(prefix)) return "tgo";
  return "mtn";
}

/** Normalises a Ghana number into 0XXXXXXXXX format expected by Paystack Charge API. */
export function normaliseGhanaMomoPhone(rawPhone: string): string {
  const digits = rawPhone.replace(/\D/g, "");
  if (digits.startsWith("233") && digits.length >= 12) {
    return "0" + digits.slice(3, 12);
  }
  if (digits.startsWith("0") && digits.length >= 10) {
    return digits.slice(0, 10);
  }
  if (digits.length === 9) {
    return "0" + digits;
  }
  return digits;
}

export type PaystackChargeStatus =
  | "pay_offline" // USSD prompt pushed to customer's phone awaiting 4-digit MoMo PIN
  | "send_otp"    // Telco sent SMS OTP first before triggering PIN prompt
  | "success"     // Immediately authorised & paid
  | "pending"
  | "failed";

export type PaystackChargeResult = {
  reference: string;
  status: PaystackChargeStatus;
  display_text?: string;
  message?: string;
};

/**
 * Initiates a Direct Mobile Money Charge (`POST /charge`) via Paystack.
 * This sends a live USSD / STK push prompt directly to the customer's handset
 * asking them to enter their 4-digit MoMo PIN.
 */
export async function chargeMobileMoney(args: {
  email: string;
  amount: number; // in pesewas (minor units)
  phone: string;
  provider?: MomoProvider;
  reference: string;
  metadata?: Record<string, unknown>;
}): Promise<PaystackChargeResult> {
  const cleanPhone = normaliseGhanaMomoPhone(args.phone);
  const provider = args.provider ?? detectGhanaMomoProvider(cleanPhone);

  return call<PaystackChargeResult>("/charge", {
    method: "POST",
    body: {
      email: args.email,
      amount: args.amount,
      currency: "GHS",
      reference: args.reference,
      mobile_money: {
        phone: cleanPhone,
        provider,
      },
      metadata: args.metadata ?? {},
    },
  });
}

/**
 * Submits the OTP (`POST /charge/submit_otp`) if the telco requires an OTP
 * before popping up the MoMo PIN prompt on the customer's handset.
 */
export async function submitMobileMoneyOtp(args: {
  reference: string;
  otp: string;
}): Promise<PaystackChargeResult> {
  return call<PaystackChargeResult>("/charge/submit_otp", {
    method: "POST",
    body: {
      reference: args.reference,
      otp: args.otp.trim(),
    },
  });
}

