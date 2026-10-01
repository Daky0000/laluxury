import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import { signSession } from "@/lib/auth/session";
import { isStaff, permissionsFor } from "@/lib/auth/rbac";
import { normalisePhone } from "@/lib/phone";

export const runtime = "nodejs";

const loginSchema = z.object({
  identifier: z.string().min(1, "Enter your email or phone number."),
  password: z.string().min(1, "Enter your password."),
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

    const { identifier, password } = parsed.data;
    const clean = identifier.trim();

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

    if (!user || !user.passwordHash) {
      // Run verify against dummy hash to prevent timing attacks
      await verifyPassword(password, null);
      return NextResponse.json(
        { error: "Incorrect email, phone, or password." },
        { status: 401 },
      );
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
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

    // Product management requires at least STAFF role
    if (!isStaff(user.role)) {
      return NextResponse.json(
        { error: "Access denied. Only staff members can access the management app." },
        { status: 403 },
      );
    }

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
