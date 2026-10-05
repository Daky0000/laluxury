import { NextResponse } from "next/server";
import { rateLimitResponse, requestAddress } from "@/lib/rate-limit";
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
    const limited = rateLimitResponse([
      { key: `app-otp-send:${phone}`, limit: 5, windowMs: 60 * 60 * 1000 },
      { key: `app-otp-send-ip:${await requestAddress()}`, limit: 20, windowMs: 60 * 60 * 1000 },
    ]);
    if (limited) return limited;
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

    const storeName = "Noble Enclave";
    const otpRes = await sendOtp(normalized, storeName);

    if (!otpRes.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: otpRes.message,
          ussdCode: otpRes.ussdCode || "*928*01#",
        },
        { status: 400 },
      );
    }

    const message = otpRes.pending
      ? `A verification code is already active for ${phone}. Check your messages or dial *928*01#.`
      : `Verification code sent via SMS to ${phone}.`;

    return NextResponse.json({
      ok: true,
      message,
      normalizedPhone: normalized,
      ussdCode: otpRes.ussdCode || "*928*01#",
    });
  } catch (error) {
    console.error("Error sending OTP:", error);
    return NextResponse.json(
      { ok: false, error: "Unable to send verification SMS at this time. Please try again." },
      { status: 500 },
    );
  }
}
