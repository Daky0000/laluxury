import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiOptionsResponse, getOptionalBearerUser, withApiAuth } from "@/lib/auth/bearer";
import { isExpoPushToken, registerPushDevice } from "@/lib/push";
import { rateLimitResponse, requestAddress } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = apiOptionsResponse;

const deviceSchema = z.object({
  token: z.string().trim().max(200).refine(isExpoPushToken, "Not an Expo push token."),
  platform: z.enum(["android", "ios"]),
  appVersion: z.string().trim().max(32).optional().nullable(),
});

/**
 * POST /api/app/devices
 * Registers this phone for push. Signed-in phones are tied to the account;
 * signed-out phones stay anonymous, so no order alerts reach them.
 */
export const POST = withApiAuth(async (request: Request) => {
  const limited = rateLimitResponse([
    { key: `app-device-ip:${await requestAddress()}`, limit: 30, windowMs: 60 * 60 * 1000 },
  ]);
  if (limited) return limited;

  const user = await getOptionalBearerUser();
  const parsed = deviceSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message }, { status: 400 });
  }
  await registerPushDevice({ ...parsed.data, userId: user?.id ?? null });
  return NextResponse.json({ ok: true });
});

/**
 * DELETE /api/app/devices?token=...
 * Detaches the phone from the account at sign-out, so the next person to use
 * it does not receive the previous person's order alerts.
 */
export const DELETE = withApiAuth(async (request: Request) => {
  const user = await getOptionalBearerUser();
  const token = new URL(request.url).searchParams.get("token")?.trim();
  if (!token) return NextResponse.json({ ok: false, error: "Token is required." }, { status: 400 });
  // Only the account that owns the device can detach it.
  await db.pushDevice.updateMany({
    where: { token, userId: user?.id ?? null },
    data: { userId: null },
  });
  return NextResponse.json({ ok: true });
});
