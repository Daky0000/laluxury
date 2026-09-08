"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { currentUser, hashPassword, passwordProblems, verifyPassword } from "@/lib/auth";
import { rateLimit, retryMessage } from "@/lib/rate-limit";

/**
 * A customer looking after their own account: the name orders are addressed
 * to, the email receipts go to, and the password.
 *
 * The phone number is deliberately not editable here. It is the account's
 * identity and was proved by a code, so changing it means proving the new one
 * the same way — a flow of its own, not a text box. Contact us is the route
 * until then.
 */

export type AccountState = { ok: boolean; message?: string; fieldErrors?: Record<string, string> };

const detailsSchema = z.object({
  firstName: z.string().trim().min(1, "Enter your first name.").max(60),
  lastName: z.string().trim().max(60).optional(),
  email: z.string().trim().toLowerCase().email("Enter a valid email address.").optional(),
});

function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !out[key]) out[key] = issue.message;
  }
  return out;
}

export async function updateAccountDetailsAction(
  _prev: AccountState | null,
  formData: FormData,
): Promise<AccountState> {
  const user = await currentUser();
  if (!user) return { ok: false, message: "Sign in first." };

  const parsed = detailsSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName") || undefined,
    email: formData.get("email") || undefined,
  });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };

  const email = parsed.data.email ?? null;

  // Staff sign in by email, so theirs is not something to clear from here.
  if (!email && user.email && user.role !== "CUSTOMER") {
    return { ok: false, fieldErrors: { email: "A staff account needs an email address." } };
  }

  if (email && email !== user.email) {
    const taken = await db.user.findUnique({ where: { email }, select: { id: true } });
    if (taken && taken.id !== user.id) {
      return { ok: false, fieldErrors: { email: "Another account already uses that email." } };
    }
  }

  await db.user.update({
    where: { id: user.id },
    data: {
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName || null,
      email,
      // A changed address has not been checked; the old verification does not carry over.
      ...(email !== user.email ? { emailVerified: null } : {}),
    },
  });

  revalidatePath("/account");
  return { ok: true, message: "Saved." };
}

const passwordSchema = z
  .object({
    current: z.string().min(1, "Enter your current password."),
    password: z.string().min(8, "Use at least 8 characters."),
    confirmPassword: z.string().min(1, "Type your new password again."),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Those two passwords do not match.",
  });

export async function changePasswordAction(
  _prev: AccountState | null,
  formData: FormData,
): Promise<AccountState> {
  const user = await currentUser();
  if (!user) return { ok: false, message: "Sign in first." };

  const parsed = passwordSchema.safeParse({
    current: formData.get("current"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };

  // The current password is a credential check like any other, and gets the
  // same brake: a stolen session must not be a free run at guessing it.
  const limited = rateLimit(`change-password:${user.id}`, { limit: 10, windowMs: 15 * 60 * 1000 });
  if (!limited.ok) return { ok: false, message: retryMessage(limited.retryAfterSeconds) };

  // An account made in the console has no password yet; the reset flow is the
  // way to set a first one, because it proves the phone or the inbox.
  if (!user.passwordHash) {
    return {
      ok: false,
      message: "This account has no password yet. Use “Forgotten your password?” on the sign-in page to set one.",
    };
  }

  if (!(await verifyPassword(parsed.data.current, user.passwordHash))) {
    return { ok: false, fieldErrors: { current: "That is not your current password." } };
  }

  const problems = passwordProblems(parsed.data.password);
  if (problems.length) return { ok: false, fieldErrors: { password: problems[0] } };

  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(parsed.data.password) },
  });

  return { ok: true, message: "Password changed." };
}
