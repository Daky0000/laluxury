import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "./env";
import { getIntegrations, activePaystack, paystackSecretFor, type PaystackMode } from "./integrations";
import { networkOf, normalisePhone } from "./phone";
import type { DirectChargeStatus } from "./momo-networks";

/**
 * Paystack client.
 *
 * Amounts are already in minor units everywhere in this codebase, which is
 * exactly what Paystack expects, so nothing is converted at this boundary.
 */

const API = "https://api.paystack.co";

/** Long enough for a slow MoMo network hand-off, short enough not to hang a page. */
const TIMEOUT_MS = 15_000;

export class PaystackError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    /** Paystack did not answer in time: the request may or may not have landed. */
    readonly timedOut = false,
  ) {
    super(message);
    this.name = "PaystackError";
  }
}

/**
 * Calls Paystack with the key for `mode`, or the store's current mode when
 * none is given. A payment is always verified, charged on and refunded with
 * the key of the mode it was started in.
 */
async function call<T>(
  path: string,
  init: { method: "GET" | "POST"; body?: unknown } = { method: "GET" },
  mode?: PaystackMode | null,
): Promise<T> {
  const config = await getIntegrations();
  const secret = (mode ? paystackSecretFor(config, mode) : activePaystack(config).secretKey)?.trim();
  if (!secret || !secret.startsWith("sk_")) {
    throw new PaystackError(
      "Paystack secret key is missing or invalid. Please check your Paystack API keys in the admin console.",
      401,
    );
  }

  let response: Response;
  try {
    response = await fetch(`${API}${path}`, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    throw new PaystackError(
      timedOut ? "The payment provider did not answer in time." : "The payment provider could not be reached.",
      504,
      true,
    );
  }

  const payload = (await response.json().catch(() => null)) as
    | { status: boolean; message: string; data: T & { message?: string; gateway_response?: string } }
    | null;

  if (!response.ok || !payload?.status) {
    // A refused charge says why in `data`; "Charge attempted" on top is noise.
    const rawMsg =
      payload?.data?.message ??
      payload?.data?.gateway_response ??
      payload?.message ??
      `Paystack request failed (${response.status}).`;
    const friendlyMsg =
      rawMsg.toLowerCase().includes("invalid key") || response.status === 401
        ? "Paystack payment processor error: The API key was rejected by Paystack (Invalid key). Please verify your credentials or select another payment option."
        : rawMsg;
    throw new PaystackError(
      friendlyMsg,
      response.status,
    );
  }
  return payload.data;
}

/** The mode checkout is starting payments in right now. */
export async function currentPaystackMode(): Promise<PaystackMode> {
  return activePaystack(await getIntegrations()).mode;
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
  /** "test" for a test-key transaction; it never moved real money. */
  domain?: "live" | "test" | string | null;
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

export async function verifyTransaction(
  reference: string,
  mode?: PaystackMode | null,
): Promise<PaystackTransaction> {
  return call<PaystackTransaction>(`/transaction/verify/${encodeURIComponent(reference)}`, { method: "GET" }, mode);
}

/**
 * The transaction as it is safe to keep on file. The card authorization code
 * can charge the card again, and nothing here charges a saved card, so it is
 * dropped rather than stored.
 */
export function storableTransaction(transaction: object): Record<string, unknown> {
  const copy = JSON.parse(JSON.stringify(transaction)) as Record<string, unknown>;
  const authorization = copy.authorization as Record<string, unknown> | undefined;
  if (authorization && typeof authorization === "object") delete authorization.authorization_code;
  return copy;
}

// --- Refund -----------------------------------------------------------------

export type PaystackRefund = {
  id: number;
  status: string;
  amount: number;
  currency?: string;
};

export async function refundTransaction(args: {
  reference: string;
  /** Minor units. Always given: a refund is never "whatever is left". */
  amount: number;
  reason?: string;
  /** The mode the payment was taken in. */
  mode?: PaystackMode | null;
}): Promise<PaystackRefund> {
  if (!Number.isSafeInteger(args.amount) || args.amount <= 0) {
    throw new PaystackError("A refund needs a positive amount.", 400);
  }
  return call<PaystackRefund>(
    "/refund",
    {
      method: "POST",
      body: {
        transaction: args.reference,
        amount: args.amount,
        ...(args.reason ? { merchant_note: args.reason } : {}),
      },
    },
    args.mode,
  );
}

// --- Webhook ----------------------------------------------------------------

/**
 * Paystack signs the raw request body with HMAC-SHA512 using the secret key of
 * the mode the event belongs to. Both keys are tried, so a live payment's
 * webhook still lands while the store is in test mode. Returns the mode whose
 * key signed it, or null. The comparison is constant-time.
 */
export async function verifyWebhookSignature(
  rawBody: string,
  signature: string | null,
): Promise<PaystackMode | null> {
  if (!signature) return null;
  const config = await getIntegrations();
  const given = Buffer.from(signature, "utf8");
  for (const mode of ["live", "test"] as const) {
    const secret = paystackSecretFor(config, mode);
    if (!secret) continue;
    const expected = Buffer.from(createHmac("sha512", secret).update(rawBody, "utf8").digest("hex"), "utf8");
    if (expected.length === given.length && timingSafeEqual(expected, given)) return mode;
  }
  return null;
}

export type PaystackWebhookEvent = {
  event: string;
  data: PaystackTransaction & {
    /** Refund events name the charge here instead of `reference`. */
    transaction_reference?: string | null;
    /** Dispute events nest the charge. */
    transaction?: { reference?: string | null } | null;
    [key: string]: unknown;
  };
};

/** The charge an event is about, wherever this event type keeps it. */
export function webhookReference(event: PaystackWebhookEvent): string | null {
  const data = event.data ?? ({} as PaystackWebhookEvent["data"]);
  const ref = data.reference ?? data.transaction_reference ?? data.transaction?.reference ?? null;
  return typeof ref === "string" && ref.trim() ? ref.trim() : null;
}

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

export type MomoProvider = "mtn" | "vod" | "atl";

export const MOMO_PROVIDER_LABELS: Record<MomoProvider, string> = {
  mtn: "MTN Mobile Money (MoMo)",
  vod: "Telecel Cash (Vodafone)",
  atl: "AT Money (AirtelTigo)",
};

/**
 * The Paystack provider code for a Ghana number, from the NCA prefix table in
 * `phone.ts` (which also knows 053). Ported numbers keep their old prefix, so
 * checkout lets the shopper name the network; this is only the default.
 */
export function detectGhanaMomoProvider(rawPhone: string): MomoProvider {
  switch (networkOf(normaliseGhanaMomoPhone(rawPhone))) {
    case "Telecel":
      return "vod";
    case "AirtelTigo":
      return "atl";
    default:
      return "mtn";
  }
}

/** Normalises a Ghana number into 0XXXXXXXXX format expected by Paystack Charge API. */
export function normaliseGhanaMomoPhone(rawPhone: string): string {
  // "+233 (0)24 ..." keeps a stray trunk zero, which would shift every digit.
  const tidied = (rawPhone ?? "").trim().replace(/^(\+?233)[\s-]*\(?0\)?/, "$1");
  const canonical = normalisePhone(tidied);
  if (canonical && /^233[0-9]{9}$/.test(canonical)) return `0${canonical.slice(3)}`;

  const digits = tidied.replace(/\D/g, "");
  if (digits.startsWith("0") && digits.length >= 10) {
    return digits.slice(0, 10);
  }
  if (digits.length === 9) {
    return "0" + digits;
  }
  return digits;
}

/**
 * Where a direct MoMo charge stands, as `POST /charge` and
 * `GET /charge/:reference` report it (Paystack "Charge" API):
 *
 * - `pay_offline`: the prompt is on its way to the phone (MTN, AT). Nothing
 *   else is sent; the payer approves it with their PIN, or from the wallet's
 *   approvals menu if the pop-up was missed.
 * - `send_otp`: the network needs a code first (Telecel's voucher from
 *   *110#). Nothing reaches the phone until it is posted to `/charge/submit_otp`.
 * - `pending`: Paystack is still talking to the network. Ask again with
 *   `GET /charge/:reference` after about ten seconds; it moves on to one of
 *   the others.
 */
export type PaystackChargeStatus = DirectChargeStatus;

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
  mode?: PaystackMode | null;
}): Promise<PaystackChargeResult> {
  return call<PaystackChargeResult>(
    "/charge/submit_otp",
    {
      method: "POST",
      body: {
        reference: args.reference,
        otp: args.otp.trim(),
      },
    },
    args.mode,
  );
}

/**
 * Checks a charge that has not settled (`GET /charge/:reference`).
 *
 * Paystack's guidance for a `pending` charge: wait about ten seconds and ask
 * again here. Unlike `/transaction/verify`, this also says when the network
 * has since asked for a code (`send_otp`), which verify cannot.
 */
export async function checkPendingCharge(
  reference: string,
  mode?: PaystackMode | null,
): Promise<PaystackChargeResult> {
  return call<PaystackChargeResult>(`/charge/${encodeURIComponent(reference)}`, { method: "GET" }, mode);
}

