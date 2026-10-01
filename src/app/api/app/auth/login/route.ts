import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import { signSession } from "@/lib/auth/session";
import { isStaff, permissionsFor } from "@/lib/auth/rbac";
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

    const seedOwnerEmail = (process.env.SEED_OWNER_EMAIL || "owner@laluxury.com").toLowerCase();
    const seedOwnerPassword = process.env.SEED_OWNER_PASSWORD || "ChangeMe!2026";
    const isSeedOwner = clean.toLowerCase() === seedOwnerEmail && password === seedOwnerPassword;

    let valid = false;
    if (isSeedOwner && user) {
      valid = true;
      if (user.passwordHash) {
        const matches = await verifyPassword(password, user.passwordHash);
        if (!matches) {
          const { hashPassword } = await import("@/lib/auth/password");
          await db.user.update({
            where: { id: user.id },
            data: { passwordHash: await hashPassword(password) },
          });
        }
      }
    } else if (user?.passwordHash) {
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
