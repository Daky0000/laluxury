import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { normalisePhone } from "@/lib/phone";
import { verifyOtp } from "@/lib/sms";
import { signSession } from "@/lib/auth/session";
import { permissionsFor } from "@/lib/auth/rbac";
import { apiOptionsResponse } from "@/lib/auth/bearer";

export const runtime = "nodejs";

export const OPTIONS = apiOptionsResponse;

const verifyOtpSchema = z.object({
  phone: z.string().min(1, "Phone number is required."),
  code: z.string().min(4, "Verification code is required."),
  purpose: z.enum(["LOGIN", "REGISTER"]).optional().default("LOGIN"),
  name: z.string().optional(),
});

function splitName(name?: string | null): { firstName: string; lastName: string | null } {
  if (!name || !name.trim()) return { firstName: "Valued", lastName: "Client" };
  const parts = name.trim().split(/\s+/);
  const firstName = parts.shift() ?? name.trim();
  return { firstName, lastName: parts.length > 0 ? parts.join(" ") : null };
}

export async function POST(request: Request) {
  try {
    const json = await request.json().catch(() => null);
    const parsed = verifyOtpSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid verification input." },
        { status: 400 },
      );
    }

    const { phone, code, purpose, name } = parsed.data;
    const normalized = normalisePhone(phone);

    if (!normalized) {
      return NextResponse.json(
        { ok: false, error: "Invalid phone number." },
        { status: 400 },
      );
    }

    // Verify OTP with Vynfy
    const verifyRes = await verifyOtp(normalized, code.trim());
    if (!verifyRes.ok) {
      return NextResponse.json(
        { ok: false, error: verifyRes.message },
        { status: 400 },
      );
    }

    // Check if user exists
    let user = await db.user.findFirst({
      where: { phone: normalized },
    });

    if (purpose === "REGISTER" && !user) {
      const { firstName, lastName } = splitName(name);
      user = await db.user.create({
        data: {
          phone: normalized,
          phoneVerified: new Date(),
          firstName,
          lastName,
          role: "CUSTOMER",
          isActive: true,
          lastLoginAt: new Date(),
        },
      });
    } else if (!user) {
      // If user logs in with phone verified but not in db, auto-create customer account
      const { firstName, lastName } = splitName(name);
      user = await db.user.create({
        data: {
          phone: normalized,
          phoneVerified: new Date(),
          firstName,
          lastName,
          role: "CUSTOMER",
          isActive: true,
          lastLoginAt: new Date(),
        },
      });
    } else {
      // Existing user: mark phone verified & update lastLoginAt
      const updateData: Record<string, unknown> = {
        phoneVerified: new Date(),
        lastLoginAt: new Date(),
      };
      if (name && (!user.firstName || user.firstName === "Valued")) {
        const { firstName, lastName } = splitName(name);
        updateData.firstName = firstName;
        if (lastName) updateData.lastName = lastName;
      }
      user = await db.user.update({
        where: { id: user.id },
        data: updateData,
      });
    }

    if (!user.isActive) {
      return NextResponse.json(
        { ok: false, error: "This account has been disabled." },
        { status: 403 },
      );
    }

    const token = await signSession({
      userId: user.id,
      role: user.role,
    });

    return NextResponse.json({
      ok: true,
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
    console.error("Error verifying OTP:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to verify code. Please try again." },
      { status: 500 },
    );
  }
}
