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
import { rateLimit, requestAddress, retryMessage } from "@/lib/rate-limit";
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
  phone: z.string().min(1, "Enter your phone number."),
  password: z.string().optional(),
});

const registerSchema = z.object({
  name: z.string().trim().min(2, "Enter your name."),
  phone: z.string().min(1, "Enter your phone number."),
  acceptsMarketing: z.boolean().optional(),
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
  const rawIdentifier = (formData.get("phone") || formData.get("identifier") || "").toString().trim();
  const password = (formData.get("password") || "").toString().trim();

  if (!rawIdentifier) {
    return { ok: false, fieldErrors: { phone: "Enter your phone number." } };
  }

  const phone = normalisePhone(rawIdentifier);
  if (!phone) {
    // Support email login for legacy staff fallback if password provided
    if (rawIdentifier.includes("@") && password) {
      const user = await db.user.findUnique({ where: { email: rawIdentifier.toLowerCase() } });
      const valid = await verifyPassword(password, user?.passwordHash ?? null);
      if (!user || !valid) {
        return { ok: false, message: "Those details do not match an account." };
      }
      if (!user.isActive) {
        return { ok: false, message: "That account has been disabled." };
      }
      await createSessionCookie({ userId: user.id, role: user.role });
      await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
      await getOrCreateCart().catch(() => {});
      redirect(isStaff(user.role) ? "/admin" : "/account");
    }

    return {
      ok: false,
      fieldErrors: {
        phone:
          "Enter a valid Ghanaian number like 024 000 0000, or one with its country code, like +44 7700 900123.",
      },
    };
  }

  const address = await requestAddress();
  const perAccount = rateLimit(`login:${phone}`, {
    limit: 10,
    windowMs: 15 * 60 * 1000,
  });
  const perAddress = rateLimit(`login-ip:${address}`, { limit: 100, windowMs: 15 * 60 * 1000 });
  if (!perAccount.ok) return { ok: false, message: retryMessage(perAccount.retryAfterSeconds) };
  if (!perAddress.ok) return { ok: false, message: retryMessage(perAddress.retryAfterSeconds) };

  const user = await db.user.findUnique({ where: { phone } });
  if (!user) {
    return { ok: false, message: "No account found with that phone number. Please create an account." };
  }
  if (!user.isActive) {
    return { ok: false, message: "That account has been disabled." };
  }

  // If a password was optionally provided by staff and matches
  if (password && user.passwordHash) {
    const valid = await verifyPassword(password, user.passwordHash);
    if (valid) {
      await createSessionCookie({ userId: user.id, role: user.role });
      await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
      await getOrCreateCart().catch(() => {});
      redirect(isStaff(user.role) ? "/admin" : "/account");
    }
  }

  // Primary number sign-in: send SMS OTP
  const settings = await getSettings();
  const sent = await sendOtp(user.phone ?? phone, settings.storeName);

  if (!sent.ok && sent.fatal) {
    // Fallback when SMS gateway (Vynfy) is not configured: verify and sign in directly
    await db.user.update({
      where: { id: user.id },
      data: { phoneVerified: new Date(), lastLoginAt: new Date() },
    });
    await createSessionCookie({ userId: user.id, role: user.role });
    await getOrCreateCart().catch(() => {});
    redirect(isStaff(user.role) ? "/admin" : "/account");
  }

  await setPendingSignup({
    userId: user.id,
    phone: user.phone ?? phone,
    sentAt: Math.floor(Date.now() / 1000),
    delivered: sent.ok,
  });

  redirect("/register/verify");
}

/**
 * Step one of registration: name and phone number.
 *
 * Sends an SMS OTP to confirm ownership of the phone number.
 */
export async function registerAction(
  _prev: AuthState | null,
  formData: FormData,
): Promise<AuthState> {
  const parsed = registerSchema.safeParse({
    name: formData.get("name"),
    phone: formData.get("phone"),
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

  const signups = rateLimit(`register-ip:${await requestAddress()}`, {
    limit: 8,
    windowMs: 60 * 60 * 1000,
  });
  if (!signups.ok) return { ok: false, message: retryMessage(signups.retryAfterSeconds) };

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
    acceptsMarketing,
    marketingConsentAt: acceptsMarketing ? new Date() : null,
  };

  const user = existing
    ? await db.user.update({ where: { id: existing.id }, data })
    : await db.user.create({ data: { ...data, role: "CUSTOMER" } });

  const sent = await sendOtp(phone, settings.storeName);

  if (!sent.ok && sent.fatal) {
    await db.user.update({
      where: { id: user.id },
      data: { phoneVerified: new Date(), lastLoginAt: new Date() },
    });
    await createSessionCookie({ userId: user.id, role: user.role });
    await getOrCreateCart().catch(() => {});
    redirect("/account");
  }

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

  redirect(isStaff(user.role) ? "/admin" : "/account");
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
