"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { createSessionCookie, hashPassword, passwordProblems } from "@/lib/auth";
import {
  clearPendingReset,
  consumeResetToken,
  getPendingReset,
  issueResetToken,
  setPendingReset,
} from "@/lib/auth/reset";
import { cooldownRemaining } from "@/lib/auth/signup";
import { isStaff } from "@/lib/auth/rbac";
import { getOrCreateCart } from "@/lib/cart";
import { OTP_LENGTH } from "@/lib/constants";
import { isEmailConfigured, sendEmail } from "@/lib/email";
import { env } from "@/lib/env";
import { normalisePhone } from "@/lib/phone";
import { rateLimit, requestAddress, retryMessage } from "@/lib/rate-limit";
import { getSettings } from "@/lib/settings";
import { sendOtp, verifyOtp } from "@/lib/sms";
import type { AuthState } from "./auth";

/**
 * Forgotten passwords, end to end.
 *
 * A phone number gets a code by text and a new password on the next screen; an
 * email gets a single-use link, when the shop can send email at all. Neither
 * step says whether an account exists — see `lib/auth/reset.ts`.
 */

const RESET_WINDOW_MS = 15 * 60 * 1000;

function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !out[key]) out[key] = issue.message;
  }
  return out;
}

/**
 * Step one: who are you.
 *
 * The reply is the same whether or not an account exists, so this cannot be
 * used to check who has one. For a phone the flow carries on to the code screen
 * either way; a number with no account simply never receives a code.
 */
export async function requestPasswordResetAction(
  _prev: AuthState | null,
  formData: FormData,
): Promise<AuthState> {
  const identifier = String(formData.get("identifier") ?? "").trim();
  if (!identifier) {
    return { ok: false, fieldErrors: { identifier: "Enter your phone number or email." } };
  }

  const address = await requestAddress();
  const perTarget = rateLimit(`reset:${identifier.toLowerCase()}`, {
    limit: 5,
    windowMs: RESET_WINDOW_MS,
  });
  const perAddress = rateLimit(`reset-ip:${address}`, { limit: 20, windowMs: RESET_WINDOW_MS });
  if (!perTarget.ok) return { ok: false, message: retryMessage(perTarget.retryAfterSeconds) };
  if (!perAddress.ok) return { ok: false, message: retryMessage(perAddress.retryAfterSeconds) };

  // --- Email: a link -------------------------------------------------------
  if (identifier.includes("@")) {
    const email = identifier.toLowerCase();
    if (!(await isEmailConfigured())) {
      return {
        ok: false,
        message:
          "Email resets are not switched on for this shop yet. If you signed up with a phone number, enter that instead; otherwise contact us.",
      };
    }

    const user = await db.user.findUnique({
      where: { email },
      select: { id: true, isActive: true, firstName: true },
    });

    if (user?.isActive) {
      const token = await issueResetToken(user.id);
      const settings = await getSettings();
      const link = `${env.siteUrl()}/reset-password?token=${token}`;
      await sendEmail({
        to: email,
        subject: `${settings.storeName} — reset your password`,
        text:
          `${user.firstName ? `Hi ${user.firstName},` : "Hello,"}\n\n` +
          `Somebody asked to reset the password on your ${settings.storeName} account. ` +
          `If that was you, open this link within the hour:\n\n${link}\n\n` +
          `If it was not you, ignore this email — nothing changes until the link is used.\n\n— ${settings.storeName}`,
      });
    }

    return {
      ok: true,
      message:
        "If there is an account with that email, a reset link is on its way. Check your inbox, and the spam folder.",
    };
  }

  // --- Phone: a code -------------------------------------------------------
  const phone = normalisePhone(identifier);
  if (!phone) {
    return {
      ok: false,
      fieldErrors: {
        identifier:
          "Enter a Ghanaian number like 024 000 0000, one with its country code, or your email.",
      },
    };
  }

  const user = await db.user.findUnique({ where: { phone }, select: { id: true, isActive: true } });
  let delivered = true;

  if (user?.isActive) {
    const settings = await getSettings();
    const sent = await sendOtp(phone, settings.storeName);
    // Only a gateway that is not set up at all stops the flow here; anything
    // else carries on to the code screen, as sign-up does, because the text has
    // been seen to arrive after the gateway reported a failure.
    if (!sent.ok && sent.code === "NOT_CONFIGURED") return { ok: false, message: sent.message };
    delivered = sent.ok;
  }

  await setPendingReset({
    phone,
    userId: user?.isActive ? user.id : null,
    sentAt: Math.floor(Date.now() / 1000),
    delivered,
  });

  redirect("/reset-password");
}

/** Another code, once the cooldown has passed. */
export async function resendResetOtpAction(): Promise<AuthState> {
  const pending = await getPendingReset();
  if (!pending) return { ok: false, message: "That reset has expired. Please start again." };

  const wait = cooldownRemaining(pending.sentAt);
  if (wait > 0) {
    return {
      ok: false,
      message: `Wait ${wait} more second${wait === 1 ? "" : "s"} before asking for another code.`,
    };
  }

  const limited = rateLimit(`reset:${pending.phone}`, { limit: 5, windowMs: RESET_WINDOW_MS });
  if (!limited.ok) return { ok: false, message: retryMessage(limited.retryAfterSeconds) };

  let delivered = true;
  if (pending.userId) {
    const settings = await getSettings();
    const sent = await sendOtp(pending.phone, settings.storeName);
    if (!sent.ok && sent.fatal) return { ok: false, message: sent.message };
    delivered = sent.ok;
  }

  await setPendingReset({ ...pending, sentAt: Math.floor(Date.now() / 1000), delivered });
  return { ok: true, message: "A new code is on its way." };
}

const newPasswordSchema = z
  .object({
    password: z.string().min(8, "Use at least 8 characters."),
    confirmPassword: z.string().min(1, "Type your password again."),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Those two passwords do not match.",
  });

/** Sets the password, signs the person in, and sends them where they belong. */
async function finishReset(userId: string, password: string): Promise<AuthState> {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || !user.isActive) {
    return { ok: false, message: "We could not find that account. Please start again." };
  }

  await db.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hashPassword(password),
      lastLoginAt: new Date(),
      // Typing a code that was texted to the number is proof of the number.
      ...(user.phone && !user.phoneVerified ? { phoneVerified: new Date() } : {}),
    },
  });

  await createSessionCookie({ userId: user.id, role: user.role });
  await getOrCreateCart().catch(() => {});

  redirect(isStaff(user.role) ? "/admin" : "/account");
}

/** Step two, by text: the code and the new password together. */
export async function resetPasswordWithCodeAction(
  _prev: AuthState | null,
  formData: FormData,
): Promise<AuthState> {
  const pending = await getPendingReset();
  if (!pending) return { ok: false, message: "That reset has expired. Please start again." };

  const digits = String(formData.get("code") ?? "").replace(/[^0-9]/g, "");
  if (digits.length !== OTP_LENGTH) {
    return {
      ok: false,
      fieldErrors: { code: `Enter the ${OTP_LENGTH}-digit code we texted you.` },
    };
  }

  const parsed = newPasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };

  const problems = passwordProblems(parsed.data.password);
  if (problems.length) return { ok: false, fieldErrors: { password: problems[0] } };

  const limited = rateLimit(`reset-verify:${pending.phone}`, {
    limit: 10,
    windowMs: RESET_WINDOW_MS,
  });
  if (!limited.ok) return { ok: false, message: retryMessage(limited.retryAfterSeconds) };

  // A number with no account behind it never had a code sent, so it fails as
  // "not right" — the same words a wrong code gets.
  if (!pending.userId) {
    return {
      ok: false,
      fieldErrors: { code: "That code is not right. Check the message and try again." },
    };
  }

  const result = await verifyOtp(pending.phone, digits);
  if (!result.ok) return { ok: false, fieldErrors: { code: result.message } };

  await clearPendingReset();
  return finishReset(pending.userId, parsed.data.password);
}

/** Step two, by email: the token from the link and the new password. */
export async function resetPasswordWithTokenAction(
  _prev: AuthState | null,
  formData: FormData,
): Promise<AuthState> {
  const token = String(formData.get("token") ?? "").trim();

  const parsed = newPasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };

  const problems = passwordProblems(parsed.data.password);
  if (problems.length) return { ok: false, fieldErrors: { password: problems[0] } };

  const limited = rateLimit(`reset-token-ip:${await requestAddress()}`, {
    limit: 20,
    windowMs: RESET_WINDOW_MS,
  });
  if (!limited.ok) return { ok: false, message: retryMessage(limited.retryAfterSeconds) };

  const claimed = await consumeResetToken(token);
  if (!claimed) {
    return {
      ok: false,
      message: "That reset link has expired or has already been used. Ask for a new one.",
    };
  }

  return finishReset(claimed.userId, parsed.data.password);
}

/** Abandons a half-finished reset, so the form starts clean. */
export async function cancelResetAction(): Promise<void> {
  await clearPendingReset();
  redirect("/forgot-password");
}
