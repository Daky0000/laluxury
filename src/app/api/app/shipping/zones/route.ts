import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiOptionsResponse, requireBearerPermission, withApiAuth } from "@/lib/auth/bearer";
import { isStaff } from "@/lib/auth/rbac";
import { GHANA_REGIONS } from "@/lib/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = apiOptionsResponse;

/**
 * GET /api/app/shipping/zones
 * List all shipping zones with their rates and regions for mobile management.
 */
export const GET = withApiAuth(async () => {
  await requireBearerPermission("settings:manage");
  const zones = await db.shippingZone.findMany({
    include: {
      rates: {
        orderBy: [{ position: "asc" }, { price: "asc" }],
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({
    ok: true,
    availableRegions: GHANA_REGIONS,
    zones: zones.map((z) => ({
      id: z.id,
      name: z.name,
      regions: z.regions,
      isActive: z.isActive,
      rates: z.rates.map((r) => ({
        id: r.id,
        name: r.name,
        price: r.price,
        freeAboveSubtotal: r.freeAboveSubtotal,
        estimatedDaysMin: r.estimatedDaysMin,
        estimatedDaysMax: r.estimatedDaysMax,
        isActive: r.isActive,
        position: r.position,
      })),
    })),
  });
});

/**
 * POST /api/app/shipping/zones
 * Create or update a shipping zone or shipping rate.
 */
export const POST = withApiAuth(async (request: Request) => {
  await requireBearerPermission("settings:manage");
  const body = await request.json().catch(() => ({}));
  const { action } = body;

  if (action === "save_rate") {
    const {
      id,
      zoneId,
      name,
      price,
      freeAboveSubtotal,
      estimatedDaysMin,
      estimatedDaysMax,
      isActive = true,
      position = 0,
    } = body;

    if (!zoneId || !name || price === undefined) {
      return NextResponse.json(
        { ok: false, error: "Zone ID, rate name, and price are required." },
        { status: 400 },
      );
    }

    const payload = {
      zoneId,
      name: String(name).trim(),
      price: Math.max(0, parseInt(String(price), 10) || 0),
      freeAboveSubtotal:
        freeAboveSubtotal !== undefined && freeAboveSubtotal !== null && freeAboveSubtotal !== ""
          ? Math.max(0, parseInt(String(freeAboveSubtotal), 10) || 0)
          : null,
      estimatedDaysMin:
        estimatedDaysMin !== undefined && estimatedDaysMin !== null
          ? parseInt(String(estimatedDaysMin), 10) || null
          : null,
      estimatedDaysMax:
        estimatedDaysMax !== undefined && estimatedDaysMax !== null
          ? parseInt(String(estimatedDaysMax), 10) || null
          : null,
      isActive: Boolean(isActive),
      position: parseInt(String(position), 10) || 0,
    };

    const rate = id
      ? await db.shippingRate.update({ where: { id }, data: payload })
      : await db.shippingRate.create({ data: payload });

    return NextResponse.json({
      ok: true,
      message: id ? "Rate updated successfully." : `Created rate ${rate.name}.`,
      rate,
    });
  }

  // Default: save_zone
  const { id, name, regions = [], isActive = true } = body;
  if (!name || typeof name !== "string") {
    return NextResponse.json({ ok: false, error: "Zone name is required." }, { status: 400 });
  }

  const payload = {
    name: name.trim(),
    regions: Array.isArray(regions) ? regions : [],
    isActive: Boolean(isActive),
  };

  const zone = id
    ? await db.shippingZone.update({ where: { id }, data: payload })
    : await db.shippingZone.create({ data: payload });

  return NextResponse.json({
    ok: true,
    message: id ? "Zone updated successfully." : `Created zone ${zone.name}.`,
    zone,
  });
});

/**
 * DELETE /api/app/shipping/zones
 * Deactivates or removes a shipping zone or rate.
 */
export const DELETE = withApiAuth(async (request: Request) => {
  await requireBearerPermission("settings:manage");
  const url = new URL(request.url);
  const action = url.searchParams.get("action");
  const targetId = url.searchParams.get("id");

  if (!targetId) {
    return NextResponse.json({ ok: false, error: "ID is required." }, { status: 400 });
  }

  if (action === "rate") {
    const used = await db.order.count({ where: { shippingRateId: targetId } });
    if (used > 0) {
      await db.shippingRate.update({ where: { id: targetId }, data: { isActive: false } });
      return NextResponse.json({
        ok: true,
        message: "Rate has past orders; deactivated instead of deleted.",
      });
    }
    await db.shippingRate.delete({ where: { id: targetId } });
    return NextResponse.json({ ok: true, message: "Rate deleted successfully." });
  }

  // Zone deletion
  const used = await db.order.count({ where: { shippingRate: { zoneId: targetId } } });
  if (used > 0) {
    await db.shippingZone.update({ where: { id: targetId }, data: { isActive: false } });
    await db.shippingRate.updateMany({ where: { zoneId: targetId }, data: { isActive: false } });
    return NextResponse.json({
      ok: true,
      message: "Zone has past orders; deactivated instead of deleted.",
    });
  }

  await db.shippingRate.deleteMany({ where: { zoneId: targetId } });
  await db.shippingZone.delete({ where: { id: targetId } });
  return NextResponse.json({ ok: true, message: "Zone deleted successfully." });
});
