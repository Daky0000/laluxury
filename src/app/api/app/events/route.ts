import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiOptionsResponse, getOptionalBearerUser, withApiAuth } from "@/lib/auth/bearer";
import { rateLimitResponse, requestAddress } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = apiOptionsResponse;

/** The funnel the app reports. Anything else is rejected, so the table stays readable. */
const APP_EVENT_NAMES = [
  "app_open",
  "product_view",
  "add_to_bag",
  "wishlist_add",
  "search",
  "checkout_start",
  "purchase",
] as const;

const eventSchema = z.object({
  name: z.enum(APP_EVENT_NAMES),
  sessionId: z.string().trim().max(64).optional().nullable(),
  props: z
    .record(z.string().max(40), z.union([z.string().max(200), z.number(), z.boolean(), z.null()]))
    .optional()
    .nullable()
    .refine((p) => !p || Object.keys(p).length <= 12, "Too many properties."),
});

/**
 * POST /api/app/events { platform, events: [...] }
 * Batched funnel events from the app. Fire-and-forget on the client.
 */
export const POST = withApiAuth(async (request: Request) => {
  const limited = rateLimitResponse([
    { key: `app-events-ip:${await requestAddress()}`, limit: 120, windowMs: 10 * 60 * 1000 },
  ]);
  if (limited) return limited;

  const parsed = z
    .object({ platform: z.enum(["android", "ios"]), events: z.array(eventSchema).min(1).max(25) })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const user = await getOptionalBearerUser();
  await db.analyticsEvent.createMany({
    data: parsed.data.events.map((e) => ({
      name: e.name,
      sessionId: e.sessionId ?? null,
      props: e.props ?? undefined,
      platform: parsed.data.platform,
      userId: user?.id ?? null,
    })),
  });
  return NextResponse.json({ ok: true });
});
