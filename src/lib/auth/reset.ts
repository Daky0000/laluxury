import { randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

/**
 * Forgotten passwords.
 *
 * Two routes back in, chosen by what the account is keyed on. A customer
 * registered by phone gets a one-time code by text, carried between the two
 * screens by a short-lived signed cookie - the same shape as the sign-up
 * cookie, and for the same reason: an unsigned cookie would let anyone reset
 * any account by editing a user id. A staff account keyed on email gets a link
 * carrying a single-use token from the `VerificationToken` table.
 *
 * Neither screen says whether an account exists. The forgot-password form
 * answers the same way for a number it has never seen, and the code screen
 * refuses a code for a missing account with the same words it uses for a wrong
 * one, so the flow cannot be used to list who has an account.
 */

const COOKIE_NAME = "lx_reset";
/** Three lives of a five-minute code, like the sign-up cookie. */
const MAX_AGE_SECONDS = 60 * 15;

/** How long an emailed reset link stays good for. */
export const RESET_LINK_TTL_MS = 60 * 60 * 1000;

export type PendingReset = {
  /** Canonical E.164 digits the code was sent to. */
  phone: string;
  /**
   * The account behind the number, or null when there is none. The screen
   * behaves identically either way; only the final step differs, and it fails
   * a missing account with the wrong-code message.
   */
  userId: string | null;
  /** Epoch seconds of the last code we asked Vynfy to send. */
  sentAt: number;
  /** Whether the gateway confirmed that send; see the sign-up cookie. */
  delivered: boolean;
};

function secretKey(): Uint8Array {
  return new TextEncoder().encode(env.authSecret());
}

export async function setPendingReset(pending: PendingReset): Promise<void> {
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

export async function getPendingReset(): Promise<PendingReset | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    if (typeof payload.phone !== "string") return null;
    return {
      phone: payload.phone,
      userId: typeof payload.userId === "string" ? payload.userId : null,
      sentAt: typeof payload.sentAt === "number" ? payload.sentAt : 0,
      delivered: payload.delivered !== false,
    };
  } catch {
    return null;
  }
}

export async function clearPendingReset(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

/**
 * Issues a fresh reset link token for an account, retiring any earlier ones so
 * only the newest email works.
 */
export async function issueResetToken(userId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");

  await db.$transaction([
    db.verificationToken.updateMany({
      where: { userId, type: "PASSWORD_RESET", usedAt: null },
      data: { usedAt: new Date() },
    }),
    db.verificationToken.create({
      data: {
        userId,
        token,
        type: "PASSWORD_RESET",
        expiresAt: new Date(Date.now() + RESET_LINK_TTL_MS),
      },
    }),
  ]);

  return token;
}

/** The account a link token belongs to, or null when it is spent, expired or made up. */
export async function consumeResetToken(token: string): Promise<{ userId: string } | null> {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;

  const row = await db.verificationToken.findUnique({ where: { token } });
  if (!row || row.type !== "PASSWORD_RESET" || row.usedAt || row.expiresAt < new Date()) {
    return null;
  }

  // Marked used in the same breath, so the link cannot be replayed.
  const claimed = await db.verificationToken.updateMany({
    where: { id: row.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (claimed.count === 0) return null;

  return { userId: row.userId };
}

/** Whether a link token is still good, without spending it - for the page that shows the form. */
export async function peekResetToken(token: string): Promise<boolean> {
  if (!/^[0-9a-f]{64}$/.test(token)) return false;
  const row = await db.verificationToken.findUnique({
    where: { token },
    select: { type: true, usedAt: true, expiresAt: true },
  });
  return Boolean(row && row.type === "PASSWORD_RESET" && !row.usedAt && row.expiresAt > new Date());
}

export const RESET_COOKIE_NAME = COOKIE_NAME;
