import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { normalisePhone } from "@/lib/phone";
import { sendOtp } from "@/lib/sms";
import { apiOptionsResponse } from "@/lib/auth/bearer";

export const runtime = "nodejs";

export const OPTIONS = apiOptionsResponse;

const sendOtpSchema = z.object({
  phone: z.string().min(1, "Phone number is required."),
  purpose: z.enum(["LOGIN", "REGISTER"]).optional().default("LOGIN"),
  name: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const json = await request.json().catch(() => null);
    const parsed = sendOtpSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid phone input." },
        { status: 400 },
      );
    }

    const { phone, purpose } = parsed.data;
    const normalized = normalisePhone(phone);

    if (!normalized) {
      return NextResponse.json(
        {
          ok: false,
          error: "Please enter a valid phone number (e.g. 024 123 4567 or +233 24 123 4567).",
        },
        { status: 400 },
      );
    }

    const existingUser = await db.user.findFirst({
      where: { phone: normalized },
    });

    if (purpose === "LOGIN" && !existingUser) {
      return NextResponse.json(
        {
          ok: false,
          error: "No account found with this phone number. Please choose 'Create Account' first.",
          notRegistered: true,
        },
        { status: 404 },
      );
    }

    if (purpose === "REGISTER" && existingUser) {
      return NextResponse.json(
        {
          ok: false,
          error: "An account with this phone number already exists. Please choose 'Sign In' instead.",
          alreadyRegistered: true,
        },
        { status: 409 },
      );
    }

    const storeName = "Nobel Enclave";
    const otpRes = await sendOtp(normalized, storeName);

    if (!otpRes.ok) {
      if (!otpRes.fatal) {
        // Gateway queue hiccup (e.g. transient 500) where SMS is in flight
        return NextResponse.json({
          ok: true,
          message: `Verification code is on its way via SMS to ${phone}. It may take a minute to arrive.`,
          normalizedPhone: normalized,
        });
      }
      return NextResponse.json(
        { ok: false, error: otpRes.message },
        { status: 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      message: `Verification code sent to ${phone}.`,
      normalizedPhone: normalized,
    });
  } catch (error) {
    console.error("Error sending OTP:", error);
    return NextResponse.json(
      { ok: false, error: "Unable to send verification SMS at this time. Please try again." },
      { status: 500 },
    );
  }
}
