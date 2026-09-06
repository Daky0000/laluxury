import { OTP_LENGTH } from "./constants";
import { getIntegrations } from "./integrations";
import { isGhanaian, normalisePhone } from "./phone";

/**
 * Vynfy — the SMS and OTP gateway the shop sends through.
 *
 * Two services are used. `/otp/generate` and `/otp/verify` hold the code
 * themselves, which is why nothing here stores one: Vynfy generates it, texts
 * it, counts the attempts (three, then the code is dead) and expires it. We
 * never see the code, so we cannot leak it, and there is no code column to go
 * stale in our database. `/api/v1/send` is the plain send, used for order
 * notices.
 *
 * Reference: https://www.vynfy.com/api-documentation
 * (the live contract is served at https://sms.vynfy.com/api/v1/docs)
 */

const BASE_URL = "https://sms.vynfy.com";

/**
 * Vynfy documents three accepted spellings, all Ghanaian: `233XXXXXXXXX`,
 * `+233XXXXXXXXX` and `0XXXXXXXXX`. A Ghanaian number therefore goes out in the
 * bare form its examples use, and anything else goes out as `+` and the digits
 * — unambiguous, and the only form that could carry a country code at all.
 *
 * Whether Vynfy delivers to that number is Vynfy's to answer: its OTP endpoint
 * validates for "a valid Ghanaian phone number". We send and let it decide,
 * rather than refusing here — if the account is enabled for international
 * traffic this works, and if it is not, the failure is named accurately.
 */
function forGateway(canonical: string): string {
  return isGhanaian(canonical) ? canonical : `+${canonical}`;
}

/** Vynfy's own limits, repeated here so callers can be told before a round trip. */
export { OTP_LENGTH };
export const OTP_EXPIRY_MINUTES = 5;
/** Vynfy allows three verification attempts per code. */
export const OTP_MAX_ATTEMPTS = 3;

export type SmsResult =
  | { ok: true; otpId?: number }
  | {
      ok: false;
      code: string;
      message: string;
      /**
       * True when no code can have gone out and trying again unchanged is
       * pointless — a number we cannot send to, a key the gateway refuses,
       * an empty balance. False when the outcome is merely unknown, which is
       * the common case and the one that must not strand anybody.
       */
      fatal: boolean;
    };

/**
 * Failures where the sign-up genuinely cannot continue.
 *
 * Everything not on this list — an unrecognised code, a 500, an edge challenge,
 * a timeout — is treated as "we do not know". Vynfy has been observed to text
 * the code and *then* fail its own response, so refusing to move on because the
 * reply was unhappy left people holding a code with nowhere to type it.
 */
const FATAL_CODES = new Set([
  "NOT_CONFIGURED",
  "UNAUTHORISED",
  "INVALID_PHONE",
  "MISSING_PHONE",
  "EMPTY_PHONE",
  "INSUFFICIENT_BALANCE",
  // Our own payload being wrong. Retrying sends the same payload.
  "EMPTY_MESSAGE",
  "INVALID_MESSAGE",
  "MESSAGE_TOO_LONG",
  "EMPTY_SENDER_ID",
  "SENDER_ID_TOO_LONG",
  "INVALID_LENGTH",
  "INVALID_EXPIRY",
  "INVALID_MEDIUM",
  "INVALID_OTP_TYPE",
]);

async function credentials(): Promise<{ apiKey: string; senderId: string } | null> {
  const { sms } = await getIntegrations();
  if (!sms.apiKey || !sms.senderId) return null;
  // The sender ID is a brand name on the handset and Vynfy caps it at 11
  // characters, so it is trimmed here rather than rejected at send time.
  return { apiKey: sms.apiKey, senderId: sms.senderId.slice(0, 11) };
}

export async function isSmsConfigured(): Promise<boolean> {
  return (await credentials()) !== null;
}

type VynfyResponse = {
  success?: boolean;
  message?: string;
  error?: string;
  error_code?: string;
  otp_id?: number;
  attempts_remaining?: number;
};

/**
 * `sms.vynfy.com` sits behind Cloudflare, which is why the reply is read as
 * text and only then parsed.
 *
 * When Cloudflare decides to challenge a caller — far likelier from a host's
 * datacentre address than from an office connection — what comes back is an
 * HTML interstitial, not the documented JSON envelope. Calling `response.json()`
 * on that throws, and the previous version of this swallowed the throw and
 * returned an empty object, so every such failure reached the customer as
 * "we could not reach the SMS network" with nothing written down anywhere.
 *
 * Now the body is kept and logged whatever it turns out to be. The API key is
 * never logged.
 */
async function call(
  path: string,
  apiKey: string,
  body: Record<string, unknown>,
): Promise<{ status: number; data: VynfyResponse }> {
  let response: Response;
  let text: string;

  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        // An empty User-Agent is one of the cheapest things for an edge to
        // block, and a named one is something Vynfy can allowlist on request.
        "User-Agent": "LaLuxury-Shop/1.0 (+https://laluxurys.com)",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify(body),
      cache: "no-store",
      // An edge that accepts the connection and then says nothing would
      // otherwise hold the sign-up open indefinitely, and the shopper would
      // watch a spinner rather than get an answer.
      signal: AbortSignal.timeout(15_000),
    });
    text = await response.text();
  } catch (error) {
    // DNS, TLS, a dropped connection, or the timeout above.
    console.error(`[sms] ${path} did not complete:`, error);
    return { status: 0, data: {} };
  }

  try {
    return { status: response.status, data: JSON.parse(text) as VynfyResponse };
  } catch {
    // Not JSON. Almost always an edge challenge or an error page; the first few
    // hundred characters are enough to tell which.
    console.error(
      `[sms] ${path} returned ${response.status} ${response.headers.get("content-type") ?? "?"}, ` +
        `not JSON: ${text.slice(0, 300).replace(/\s+/g, " ")}`,
    );
    return { status: response.status, data: {} };
  }
}

/**
 * Vynfy names its failures. Turning them into sentences here keeps the wording
 * in one place and keeps gateway vocabulary off the customer's screen.
 */
function readableError(
  path: string,
  status: number,
  data: VynfyResponse,
): { code: string; message: string; fatal: boolean } {
  const code = data.error_code ?? data.error ?? `HTTP_${status}`;

  // Whatever the gateway said, in full, in our own log. Nothing below passes it
  // on to the customer: it is Vynfy's internal wording, and when their own
  // backend fails it has been seen to hand back things like a raw database
  // error — which is meaningless to a shopper and looks like our bug.
  console.error(
    `[sms] ${path} failed: status=${status} code=${JSON.stringify(code)} ` +
      `message=${JSON.stringify(data.message ?? null)}`,
  );

  // Vynfy answers an unusable key with a 401 and "Invalid API key". That is a
  // setup fault rather than something the customer can do anything about, so it
  // is named plainly here and loudly in the log.
  if (status === 401) {
    return {
      code: "UNAUTHORISED",
      fatal: true,
      message:
        "Our SMS account needs attention, so we could not do that just now. " +
        "Please contact us and we will set your account up.",
    };
  }

  const messages: Record<string, string> = {
    INVALID_PHONE:
      "Our SMS network would not accept that number. Codes reach Ghanaian " +
      "networks reliably; if yours is elsewhere, contact us and we will set the " +
      "account up for you.",
    MISSING_PHONE: "Enter your phone number.",
    OTP_PENDING:
      "A code is already on its way to that number. Wait for it, or try again in a few minutes.",
    INSUFFICIENT_BALANCE:
      "We could not send the code just now. Please try again shortly, or contact us.",
    NO_OTP_FOUND: "That code has expired. Ask for a new one.",
    OTP_EXPIRED: "That code has expired. Ask for a new one.",
    INVALID_OTP: "That code is not right. Check the message and try again.",
    ALREADY_VERIFIED: "That number is already verified. Try signing in.",
    EMPTY_CODE: "Enter the code we sent you.",
  };

  // The reference on the end is the point of this branch: a shopper reporting
  // "it said SMS-500" tells the owner in three characters what a screenshot of
  // a generic sentence never did. Vynfy's own wording is logged, not shown.
  return {
    code,
    fatal: FATAL_CODES.has(code),
    message:
      messages[code] ??
      `The SMS network had trouble with that. If the code does not arrive, ask for another — and tell us if it keeps happening (SMS-${status || "NET"}).`,
  };
}

/**
 * Generates a code and texts it. The code itself is never returned — Vynfy
 * sends it and holds it, and `verifyOtp` is the only way to check it.
 */
export async function sendOtp(phone: string, storeName: string): Promise<SmsResult> {
  const number = normalisePhone(phone);
  if (!number) {
    return {
      ok: false,
      code: "INVALID_PHONE",
      fatal: true,
      message: "Enter your number with its country code, e.g. +233 24 000 0000.",
    };
  }

  const config = await credentials();
  if (!config) {
    return {
      ok: false,
      code: "NOT_CONFIGURED",
      fatal: true,
      message: "Phone verification is not switched on yet. Please contact us to set up an account.",
    };
  }

  // `%otp_code%` is required by the API, and the whole message has to fit 160
  // characters or Vynfy rejects it.
  const message =
    `${storeName}: your verification code is %otp_code%. ` +
    `It expires in ${OTP_EXPIRY_MINUTES} minutes. Do not share it with anyone.`;

  const { status, data } = await call("/otp/generate", config.apiKey, {
    number: forGateway(number),
    message: message.slice(0, 160),
    sender_id: config.senderId,
    otp_type: "numeric",
    medium: "sms",
    length: OTP_LENGTH,
    expiry: OTP_EXPIRY_MINUTES,
  });

  if (status === 200 && data.success) return { ok: true, otpId: data.otp_id };
  return { ok: false, ...readableError("/otp/generate", status, data) };
}

/** Checks a code against the pending OTP for that number. */
export async function verifyOtp(phone: string, code: string): Promise<SmsResult> {
  const number = normalisePhone(phone);
  if (!number) {
    return {
      ok: false,
      code: "INVALID_PHONE",
      fatal: true,
      message: "Enter your number with its country code, e.g. +233 24 000 0000.",
    };
  }

  const config = await credentials();
  if (!config) {
    return {
      ok: false,
      code: "NOT_CONFIGURED",
      fatal: true,
      message: "Phone verification is not switched on yet. Please contact us.",
    };
  }

  const { status, data } = await call("/otp/verify", config.apiKey, {
    number: forGateway(number),
    code: code.trim(),
  });

  if (status === 200 && data.success) return { ok: true };

  const error = readableError("/otp/verify", status, data);
  // Vynfy counts down the attempts for us; saying how many are left is one of
  // its own documented best practices, and stops a customer burning the code.
  if (error.code === "INVALID_OTP" && typeof data.attempts_remaining === "number") {
    const left = data.attempts_remaining;
    error.message = `That code is not right. ${left} attempt${left === 1 ? "" : "s"} left before you need a new one.`;
  }

  return { ok: false, ...error };
}

/**
 * A plain text message — order confirmations, delivery notices.
 *
 * Failure is returned rather than thrown: a text that does not go out should
 * never be the reason an order fails to save.
 */
export async function sendSms(phone: string, message: string): Promise<SmsResult> {
  const number = normalisePhone(phone);
  if (!number) {
    return { ok: false, code: "INVALID_PHONE", fatal: true, message: "Not a usable phone number." };
  }

  const config = await credentials();
  if (!config) {
    return { ok: false, code: "NOT_CONFIGURED", fatal: true, message: "SMS is not configured." };
  }

  const { status, data } = await call("/api/v1/send", config.apiKey, {
    sender: config.senderId,
    recipients: [forGateway(number)],
    message: message.slice(0, 650),
  });

  if (status === 200 && data.success) return { ok: true };
  return { ok: false, ...readableError("/api/v1/send", status, data) };
}
