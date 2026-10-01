import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword, passwordProblems } from "@/lib/auth/password";
import { signSession } from "@/lib/auth/session";
import { permissionsFor } from "@/lib/auth/rbac";
import { normalisePhone } from "@/lib/phone";
import { apiOptionsResponse } from "@/lib/auth/bearer";

export const runtime = "nodejs";

export const OPTIONS = apiOptionsResponse;

const registerSchema = z.object({
  name: z.string().trim().min(2, "Enter your full name."),
  email: z.string().email("Enter a valid email address.").optional().or(z.literal("")),
  phone: z.string().min(1, "Enter a valid phone number.").optional().or(z.literal("")),
  password: z.string().min(6, "Password must be at least 6 characters."),
}).refine((data) => Boolean(data.email || data.phone), {
  message: "Provide either an email or phone number.",
  path: ["email"],
});

function splitName(name: string): { firstName: string; lastName: string | null } {
  const parts = name.trim().split(/\s+/);
  const firstName = parts.shift() ?? name.trim();
  return { firstName, lastName: parts.length ? parts.join(" ") : null };
}

export async function POST(request: Request) {
  try {
    const json = await request.json().catch(() => null);
    const parsed = registerSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid registration details." },
        { status: 400 },
      );
    }

    const { name, email, phone, password } = parsed.data;

    const problems = passwordProblems(password);
    if (problems.length > 0) {
      return NextResponse.json({ error: problems[0] }, { status: 400 });
    }

    const cleanEmail = email ? email.trim().toLowerCase() : null;
    const cleanPhone = phone ? normalisePhone(phone) : null;

    if (cleanPhone && !normalisePhone(cleanPhone)) {
      return NextResponse.json(
        { error: "Please enter a valid phone number with country code." },
        { status: 400 },
      );
    }

    // Check for existing account
    const existing = await db.user.findFirst({
      where: {
        OR: [
          ...(cleanEmail ? [{ email: cleanEmail }] : []),
          ...(cleanPhone ? [{ phone: cleanPhone }] : []),
        ],
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: "An account with this email or phone number already exists." },
        { status: 409 },
      );
    }

    const { firstName, lastName } = splitName(name);
    const passwordHash = await hashPassword(password);

    const user = await db.user.create({
      data: {
        firstName,
        lastName,
        email: cleanEmail,
        phone: cleanPhone,
        passwordHash,
        role: "CUSTOMER",
        isActive: true,
        phoneVerified: cleanPhone ? new Date() : null,
      },
    });

    const token = await signSession({
      userId: user.id,
      role: user.role,
    });

    return NextResponse.json(
      {
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
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("App register error:", error);
    return NextResponse.json(
      { error: "Failed to create account. Please try again." },
      { status: 500 },
    );
  }
}
