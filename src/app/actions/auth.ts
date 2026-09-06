"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  createSessionCookie,
  destroySessionCookie,
  hashPassword,
  passwordProblems,
  verifyPassword,
} from "@/lib/auth";
import {
  clearPendingSignup,
  cooldownRemaining,
  getPendingSignup,
  setPendingSignup,
} from "@/lib/auth/signup";
import { isStaff } from "@/lib/auth/rbac";
import { getOrCreateCart } from "@/lib/cart";
import { normalisePhone } from "@/lib/phone";
import { OTP_LENGTH } from "@/lib/constants";
import { sendOtp, verifyOtp } from "@/lib/sms";
import { getSettings } from "@/lib/settings";

export type AuthState = { ok: boolean; message?: string; fieldErrors?: Record<string, string> };

/**
 * Sign-in takes a phone number or an email in one field.
 *
 * Customers register by phone; staff accounts predate that and are still keyed
 * on email. Asking which kind of account someone has before they can sign in is
 * a question only we care about, so the field takes either and works it out.
 */
const loginSchema = z.object({
  identifier: z.string().min(1, "Enter your phone number or email."),
  password: z.string().min(1, "Enter your password."),
});

const registerSchema = z
  .object({
    name: z.string().trim().min(2, "Enter your name."),
    phone: z.string().min(1, "Enter your phone number."),
    password: z.string().min(8, "Use at least 8 characters."),
    confirmPassword: z.string().min(1, "Type your password again."),
    acceptsMarketing: z.boolean().optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Those two passwords do not match.",
  });

function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !out[key]) out[key] = issue.message;
  }
  return out;
}

/** "Ama Serwaa Mensah" → first "Ama", last "Serwaa Mensah". One field, two columns. */
function splitName(name: string): { firstName: string; lastName: string | null } {
  const parts = name.trim().split(/\s+/);
  const firstName = parts.shift() ?? name.trim();
  return { firstName, lastName: parts.length ? parts.join(" ") : null };
}

export async function loginAction(
  _prev: AuthState | null,
  formData: FormData,
): Promise<AuthState> {
  const parsed = loginSchema.safeParse({
    identifier: formData.get("identifier"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };

  const identifier = parsed.data.identifier.trim();
  // An "@" settles it before the number parser gets a look in. Without that,
  // an address with enough digits in the local part could be read as a phone
  // number and looked up against the wrong column.
  const phone = identifier.includes("@") ? null : normalisePhone(identifier);

  const user = phone
    ? await db.user.findUnique({ where: { phone } })
    : await db.user.findUnique({ where: { email: identifier.toLowerCase() } });

  // One message for both cases, so this cannot be used to enumerate accounts.
  const valid = await verifyPassword(parsed.data.password, user?.passwordHash ?? null);
  if (!user || !valid) {
    return { ok: false, message: "Those details do not match an account." };
  }
  if (!user.isActive) {
    return { ok: false, message: "That account has been disabled." };
  }

  // An account that was registered by phone and never verified has no other way
  // in, so rather than refusing it, send a fresh code and finish what was
  // started. The session is still withheld until the code is typed.
  if (user.phone && !user.phoneVerified && !user.email) {
    const settings = await getSettings();
    const sent = await sendOtp(user.phone, settings.storeName);
    if (!sent.ok && sent.fatal) return { ok: false, message: sent.message };

    await setPendingSignup({
      userId: user.id,
      phone: user.phone,
      sentAt: Math.floor(Date.now() / 1000),
      delivered: sent.ok,
    });
    redirect("/register/verify");
  }

  await createSessionCookie({ userId: user.id, role: user.role });
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  // Fold anything added while signed out into the account cart. This runs here
  // because a Server Action is the only place the cart cookie may be written.
  await getOrCreateCart().catch(() => {});

  redirect(isStaff(user.role) ? "/admin" : "/account");
}

/**
 * Step one of registration: name, number, password.
 *
 * The account is written now but left unverified, and no session is issued. The
 * code Vynfy texts is what turns it into an account you can sign in to, so an
 * abandoned sign-up is an inert row rather than a live account on somebody
 * else's phone number.
 */
export async function registerAction(
  _prev: AuthState | null,
  formData: FormData,
): Promise<AuthState> {
  const parsed = registerSchema.safeParse({
    name: formData.get("name"),
    phone: formData.get("phone"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
    acceptsMarketing: formData.get("acceptsMarketing") === "on",
  });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };

  const phone = normalisePhone(parsed.data.phone);
  if (!phone) {
    return {
      ok: false,
      fieldErrors: {
        phone:
          "Enter a Ghanaian number like 024 000 0000, or one from anywhere else " +
          "with its country code, like +44 7700 900123.",
      },
    };
  }

  const problems = passwordProblems(parsed.data.password);
  if (problems.length) return { ok: false, fieldErrors: { password: problems[0] } };

  const { firstName, lastName } = splitName(parsed.data.name);
  const acceptsMarketing = Boolean(parsed.data.acceptsMarketing);
  const existing = await db.user.findUnique({ where: { phone } });

  if (existing?.phoneVerified) {
    return {
      ok: false,
      fieldErrors: { phone: "There is already an account on that number. Sign in instead." },
    };
  }

  const settings = await getSettings();
  const data = {
    firstName,
    lastName,
    phone,
    passwordHash: await hashPassword(parsed.data.password),
    acceptsMarketing,
    // Consent has to be evidenced, not assumed — and withdrawing it clears the
    // date as well as the flag.
    marketingConsentAt: acceptsMarketing ? new Date() : null,
  };

  // An unverified row on this number is somebody's abandoned attempt, or this
  // same person coming back. Either way it is theirs only once they hold the
  // phone, so it is safe to take it over rather than block the number forever.
  const user = existing
    ? await db.user.update({ where: { id: existing.id }, data })
    : await db.user.create({ data: { ...data, role: "CUSTOMER" } });

  const sent = await sendOtp(phone, settings.storeName);

  // Only a failure that rules out a code arriving keeps someone on this form.
  // Anything else — an unrecognised error, a 500, a timeout — carries on to the
  // code screen, because the gateway has been seen to send the text and then
  // fail its own reply, and stopping here left people holding a code with
  // nowhere to type it. The screen says whether the send was confirmed.
  if (!sent.ok && sent.fatal) return { ok: false, message: sent.message };

  await setPendingSignup({
    userId: user.id,
    phone,
    sentAt: Math.floor(Date.now() / 1000),
    delivered: sent.ok,
  });

  redirect("/register/verify");
}

/**
 * Step two: the code. This is what creates the session.
 *
 * Called straight from the code screen rather than through a form post — the
 * six boxes verify themselves the moment the last digit lands, so there is no
 * form to submit and nothing to serialise. The redirect below still works from
 * there: a Server Action that redirects navigates the client router.
 */
export async function verifySignupAction(code: string): Promise<AuthState> {
  const pending = await getPendingSignup();
  if (!pending) {
    return {
      ok: false,
      message: "That sign-up has expired. Start again and we will text you a new code.",
    };
  }

  const digits = String(code ?? "").replace(/[^0-9]/g, "");
  // Vynfy issues exactly six digits, so anything else cannot be one of ours and
  // is refused here rather than spent as one of the three attempts.
  if (digits.length !== OTP_LENGTH) {
    return { ok: false, fieldErrors: { code: `Enter the ${OTP_LENGTH}-digit code we texted you.` } };
  }

  const result = await verifyOtp(pending.phone, digits);
  if (!result.ok) return { ok: false, fieldErrors: { code: result.message } };

  const user = await db.user.findUnique({ where: { id: pending.userId } });
  if (!user || !user.isActive) {
    await clearPendingSignup();
    return { ok: false, message: "We could not find that account. Please start again." };
  }

  await db.user.update({
    where: { id: user.id },
    data: { phoneVerified: new Date(), lastLoginAt: new Date() },
  });

  await clearPendingSignup();
  await createSessionCookie({ userId: user.id, role: user.role });
  await getOrCreateCart().catch(() => {});

  redirect("/account");
}

/** Another code, once the cooldown has passed. */
export async function resendSignupOtpAction(): Promise<AuthState> {
  const pending = await getPendingSignup();
  if (!pending) {
    return { ok: false, message: "That sign-up has expired. Please start again." };
  }

  const wait = cooldownRemaining(pending.sentAt);
  if (wait > 0) {
    return { ok: false, message: `Wait ${wait} more second${wait === 1 ? "" : "s"} before asking for another code.` };
  }

  const settings = await getSettings();
  const sent = await sendOtp(pending.phone, settings.storeName);

  await setPendingSignup({
    ...pending,
    sentAt: Math.floor(Date.now() / 1000),
    delivered: sent.ok,
  });

  if (!sent.ok) return { ok: false, message: sent.message };
  return { ok: true, message: "A new code is on its way." };
}

/** Abandons a half-finished sign-up, so the form starts clean. */
export async function cancelSignupAction(): Promise<void> {
  await clearPendingSignup();
  redirect("/register");
}

export async function logoutAction(): Promise<void> {
  await destroySessionCookie();
  redirect("/");
}
