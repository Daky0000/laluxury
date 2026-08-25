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
import { isStaff } from "@/lib/auth/rbac";
import { getOrCreateCart } from "@/lib/cart";

export type AuthState = { ok: boolean; message?: string; fieldErrors?: Record<string, string> };

const loginSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

const registerSchema = z.object({
  firstName: z.string().min(1, "Enter your first name."),
  lastName: z.string().min(1, "Enter your last name."),
  email: z.string().email("Enter a valid email address."),
  phone: z.string().optional(),
  password: z.string().min(8, "Use at least 8 characters."),
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

export async function loginAction(
  _prev: AuthState | null,
  formData: FormData,
): Promise<AuthState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };

  const email = parsed.data.email.toLowerCase().trim();
  const user = await db.user.findUnique({ where: { email } });

  // One message for both cases, so this cannot be used to enumerate accounts.
  const valid = await verifyPassword(parsed.data.password, user?.passwordHash ?? null);
  if (!user || !valid) {
    return { ok: false, message: "That email and password do not match." };
  }
  if (!user.isActive) {
    return { ok: false, message: "That account has been disabled." };
  }

  await createSessionCookie({ userId: user.id, email: user.email, role: user.role });
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  // Fold anything added while signed out into the account cart. This runs here
  // because a Server Action is the only place the cart cookie may be written.
  await getOrCreateCart().catch(() => {});

  redirect(isStaff(user.role) ? "/admin" : "/account");
}

export async function registerAction(
  _prev: AuthState | null,
  formData: FormData,
): Promise<AuthState> {
  const parsed = registerSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: formData.get("email"),
    phone: formData.get("phone") || undefined,
    password: formData.get("password"),
    acceptsMarketing: formData.get("acceptsMarketing") === "on",
  });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };

  const problems = passwordProblems(parsed.data.password);
  if (problems.length) return { ok: false, fieldErrors: { password: problems[0] } };

  const email = parsed.data.email.toLowerCase().trim();
  const existing = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    return { ok: false, fieldErrors: { email: "There is already an account with that email." } };
  }

  const user = await db.user.create({
    data: {
      email,
      firstName: parsed.data.firstName.trim(),
      lastName: parsed.data.lastName.trim(),
      phone: parsed.data.phone?.trim() || null,
      passwordHash: await hashPassword(parsed.data.password),
      acceptsMarketing: Boolean(parsed.data.acceptsMarketing),
      role: "CUSTOMER",
    },
  });

  await createSessionCookie({ userId: user.id, email: user.email, role: user.role });
  redirect("/account");
}

export async function logoutAction(): Promise<void> {
  await destroySessionCookie();
  redirect("/");
}
