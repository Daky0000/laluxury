import { NextResponse } from "next/server";
import { rateLimitResponse, requestAddress } from "@/lib/rate-limit";
import { z } from "zod";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import { signSession } from "@/lib/auth/session";
import { permissionsFor } from "@/lib/auth/rbac";
import { normalisePhone } from "@/lib/phone";

import { apiOptionsResponse } from "@/lib/auth/bearer";

export const runtime = "nodejs";

export const OPTIONS = apiOptionsResponse;

const loginSchema = z
  .object({
    identifier: z.string().optional(),
    email: z.string().optional(),
    password: z.string().min(1, "Enter your password."),
  })
  .refine((data) => !!(data.identifier || data.email), {
    message: "Enter your email or phone number.",
    path: ["identifier"],
  });

export async function POST(request: Request) {
  try {
    const json = await request.json().catch(() => null);
    const parsed = loginSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid login credentials." },
        { status: 400 },
      );
    }

    const { identifier, email, password } = parsed.data;
    const clean = (identifier || email || "").trim();
    const address = await requestAddress();
    const limited = rateLimitResponse([
      { key: `app-login:${clean.toLowerCase()}`, limit: 10, windowMs: 15 * 60 * 1000 },
      { key: `app-login-ip:${address}`, limit: 100, windowMs: 15 * 60 * 1000 },
    ]);
    if (limited) return limited;

    // Check if it's a phone number or an email
    const asPhone = normalisePhone(clean);
    const user = await db.user.findFirst({
      where: {
        OR: [
          ...(asPhone ? [{ phone: asPhone }] : []),
          { email: { equals: clean, mode: "insensitive" } },
        ],
      },
    });

    let valid = false;
    if (user?.passwordHash) {
      valid = await verifyPassword(password, user.passwordHash);
    } else {
      await verifyPassword(password, null);
    }

    if (!user || !valid) {
      return NextResponse.json(
        { error: "Incorrect email, phone, or password." },
        { status: 401 },
      );
    }

    if (!user.isActive) {
      return NextResponse.json(
        { error: "This account has been disabled." },
        { status: 403 },
      );
    }

    // User is authenticated. Allow both customers and staff to sign in.
    // If user is staff/owner/admin, permissions will reflect it so mobile app can direct to management dashboard.

    // Update lastLoginAt
    await db.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const token = await signSession({
      userId: user.id,
      role: user.role,
    });

    return NextResponse.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        permissions: permissionsFor(user.role),
      },
    });
  } catch (error) {
    console.error("App login error:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}
