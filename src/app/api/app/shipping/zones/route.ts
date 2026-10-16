import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { apiOptionsResponse, requireBearerPermission, withApiAuth } from "@/lib/auth/bearer";
import { recordAudit } from "@/lib/audit";
import { formatMoney } from "@/lib/money";
import { getCommerceSettings, updateSettings } from "@/lib/settings";
import { GHANA_REGIONS } from "@/lib/constants";

/** Same paths the web delivery settings revalidate, so checkout sees app edits at once. */
function revalidateShipping() {
  try {
    revalidatePath("/admin/settings/delivery");
    revalidatePath("/checkout");
  } catch {
    /* outside a request */
  }
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = apiOptionsResponse;

const RETIRED =
  "Delivery is now one fixed fee for every region. Update the app, or change the fee under Settings → Delivery on the website.";

/**
 * GET /api/app/shipping/zones
 * Delivery is one fixed fee (`deliveryFee`, minor units) for every region.
 * `zones` stays in the response, empty, for app builds that still read it.
 */
export const GET = withApiAuth(async () => {
  await requireBearerPermission("settings:manage");
  const settings = await getCommerceSettings();

  return NextResponse.json({
    ok: true,
    deliveryFee: settings.deliveryFee,
    freeShippingThreshold: settings.freeShippingThreshold,
    availableRegions: GHANA_REGIONS,
    zones: [],
  });
});

/**
 * POST /api/app/shipping/zones  { action: "save_fee", deliveryFee: <minor units> }
 * Sets the one delivery fee. Zone and rate edits from older app builds are refused.
 */
export const POST = withApiAuth(async (request: Request) => {
  const user = await requireBearerPermission("settings:manage");
  const body = await request.json().catch(() => ({}));

  if (body?.action !== "save_fee") {
    return NextResponse.json({ ok: false, error: RETIRED, message: RETIRED }, { status: 410 });
  }

  const fee = Number(body.deliveryFee);
  if (!Number.isSafeInteger(fee) || fee < 0) {
    return NextResponse.json(
      { ok: false, message: "Enter the delivery fee in pesewas, 0 or more.", error: "Invalid delivery fee." },
      { status: 400 },
    );
  }

  const before = (await getCommerceSettings()).deliveryFee;
  await updateSettings({ deliveryFee: fee });
  await recordAudit({
    actorId: user.id,
    action: "shipping.fee.update",
    entity: "Setting",
    entityId: "store",
    before: { deliveryFee: before },
    after: { deliveryFee: fee, via: "app" },
  });
  revalidateShipping();

  return NextResponse.json({
    ok: true,
    deliveryFee: fee,
    message: `Delivery fee saved: ${fee === 0 ? "free" : formatMoney(fee)} on every delivery order.`,
  });
});

/** DELETE: zones and rates no longer exist to remove. */
export const DELETE = withApiAuth(async () => {
  await requireBearerPermission("settings:manage");
  return NextResponse.json({ ok: false, error: RETIRED, message: RETIRED }, { status: 410 });
});
