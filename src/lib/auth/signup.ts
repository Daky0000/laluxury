import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

/**
 * The half-finished registration.
 *
 * Between filling in the sign-up form and typing the code we texted, the
 * account exists but is not verified and must not be signed in. That in-between
 * state is carried in its own short-lived signed cookie rather than in a
 * session: a session cookie at this point would be an unverified account with
 * the run of the shop, and a plain cookie would let anyone claim any account by
 * editing a user id.
 *
 * Fifteen minutes is three lives of a five-minute code, which is enough for a
 * resend or two and short enough that an abandoned sign-up simply lapses.
 */

const COOKIE_NAME = "lx_signup";
const MAX_AGE_SECONDS = 60 * 15;

/** Vynfy's guidance, and a sensible floor against hammering the resend button. */
export const RESEND_COOLDOWN_SECONDS = 60;

export type PendingSignup = {
  userId: string;
  /** Canonical E.164 digits. */
  phone: string;
  /** Epoch seconds of the last code we asked Vynfy to send. */
  sentAt: number;
  /**
   * Whether the gateway actually confirmed that send.
   *
   * False means we asked and did not get a clean answer — the code may well
   * have gone out anyway, which is why the sign-up continues. The verify screen
   * uses this to say so rather than leaving someone waiting on a text that may
   * never come.
   */
  delivered: boolean;
};

function secretKey(): Uint8Array {
  return new TextEncoder().encode(env.authSecret());
}

export async function setPendingSignup(pending: PendingSignup): Promise<void> {
  const token = await new SignJWT({ ...pending })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secretKey());

  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.isProduction(),
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function getPendingSignup(): Promise<PendingSignup | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    if (typeof payload.userId !== "string" || typeof payload.phone !== "string") return null;
    return {
      userId: payload.userId,
      phone: payload.phone,
      sentAt: typeof payload.sentAt === "number" ? payload.sentAt : 0,
      // Absent on a cookie issued before this field existed; assume the send
      // was fine rather than warning everyone mid-sign-up.
      delivered: payload.delivered !== false,
    };
  } catch {
    return null;
  }
}

export async function clearPendingSignup(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

/** Seconds still to wait before another code may be requested. Zero when free. */
export function cooldownRemaining(sentAt: number): number {
  const elapsed = Math.floor(Date.now() / 1000) - sentAt;
  return Math.max(0, RESEND_COOLDOWN_SECONDS - elapsed);
}

export const SIGNUP_COOKIE_NAME = COOKIE_NAME;
