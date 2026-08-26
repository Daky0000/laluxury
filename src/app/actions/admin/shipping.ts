"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { toMinorUnits } from "@/lib/money";
import { GHANA_REGIONS } from "@/lib/constants";
import type { AdminState } from "./products";

/**
 * Delivery zones and the rates inside them.
 *
 * A zone is a set of Ghanaian regions; a rate is one option a shopper sees at
 * checkout for that zone. A zone with no regions is the catch-all for anywhere
 * not covered by a more specific zone, which is how "rest of the country"
 * pricing works without listing sixteen regions.
 */

function revalidateShipping() {
  revalidatePath("/admin/settings/delivery");
  revalidatePath("/checkout");
}

const zoneSchema = z.object({
  name: z.string().min(1, "Give the zone a name."),
  regions: z.array(z.string()).default([]),
  isActive: z.boolean().default(true),
});

export async function saveZoneAction(
  _prev: AdminState | null,
  formData: FormData,
): Promise<AdminState> {
  const user = await requirePermission("settings:manage");

  const id = String(formData.get("id") ?? "").trim();
  const parsed = zoneSchema.safeParse({
    name: formData.get("name"),
    regions: formData.getAll("regions").map(String).filter(Boolean),
    isActive: formData.get("isActive") === "on",
  });

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the zone." };
  }

  const unknown = parsed.data.regions.filter(
    (region) => !GHANA_REGIONS.includes(region as (typeof GHANA_REGIONS)[number]),
  );
  if (unknown.length > 0) {
    return { ok: false, message: `Not a Ghanaian region: ${unknown.join(", ")}.` };
  }

  const zone = id
    ? await db.shippingZone.update({ where: { id }, data: parsed.data })
    : await db.shippingZone.create({ data: parsed.data });

  await recordAudit({
    actorId: user.id,
    action: id ? "shipping.zone.update" : "shipping.zone.create",
    entity: "ShippingZone",
    entityId: zone.id,
    after: { name: zone.name, regions: zone.regions, isActive: zone.isActive },
  });

  revalidateShipping();
  return { ok: true, message: id ? "Zone updated." : `Added ${zone.name}.` };
}

export async function deleteZoneAction(zoneId: string): Promise<AdminState> {
  const user = await requirePermission("settings:manage");

  // Orders keep a reference to the rate they used, so a zone that has ever been
  // used is deactivated rather than deleted — otherwise past orders lose their
  // delivery line.
  const used = await db.order.count({ where: { shippingRate: { zoneId } } });

  if (used > 0) {
    await db.shippingZone.update({ where: { id: zoneId }, data: { isActive: false } });
    await db.shippingRate.updateMany({ where: { zoneId }, data: { isActive: false } });
    await recordAudit({
      actorId: user.id,
      action: "shipping.zone.deactivate",
      entity: "ShippingZone",
      entityId: zoneId,
      after: { reason: `used by ${used} orders` },
    });
    revalidateShipping();
    return {
      ok: true,
      message: `${used} order${used === 1 ? "" : "s"} used this zone, so it was switched off rather than deleted.`,
    };
  }

  await db.shippingZone.delete({ where: { id: zoneId } });
  await recordAudit({
    actorId: user.id,
    action: "shipping.zone.delete",
    entity: "ShippingZone",
    entityId: zoneId,
  });

  revalidateShipping();
  return { ok: true, message: "Zone deleted." };
}

const rateSchema = z.object({
  zoneId: z.string().min(1, "Choose a zone."),
  name: z.string().min(1, "Give the rate a name, e.g. Standard."),
  price: z.string().min(1, "Enter a price."),
  freeAboveSubtotal: z.string().optional(),
  estimatedDaysMin: z.string().optional(),
  estimatedDaysMax: z.string().optional(),
  isActive: z.boolean().default(true),
  position: z.string().optional(),
});

export async function saveRateAction(
  _prev: AdminState | null,
  formData: FormData,
): Promise<AdminState> {
  const user = await requirePermission("settings:manage");

  const id = String(formData.get("id") ?? "").trim();
  const parsed = rateSchema.safeParse({
    zoneId: formData.get("zoneId"),
    name: formData.get("name"),
    price: formData.get("price"),
    freeAboveSubtotal: formData.get("freeAboveSubtotal") || undefined,
    estimatedDaysMin: formData.get("estimatedDaysMin") || undefined,
    estimatedDaysMax: formData.get("estimatedDaysMax") || undefined,
    isActive: formData.get("isActive") === "on",
    position: formData.get("position") || undefined,
  });

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the rate." };
  }

  const data = parsed.data;

  let price: number;
  try {
    price = toMinorUnits(data.price);
  } catch {
    return { ok: false, message: "That price is not a number." };
  }
  if (price < 0) return { ok: false, message: "A delivery price cannot be negative." };

  const daysMin = data.estimatedDaysMin ? Number(data.estimatedDaysMin) : null;
  const daysMax = data.estimatedDaysMax ? Number(data.estimatedDaysMax) : null;
  if (daysMin !== null && daysMax !== null && daysMax < daysMin) {
    return { ok: false, message: "The longest estimate cannot be shorter than the shortest." };
  }

  const payload = {
    zoneId: data.zoneId,
    name: data.name,
    price,
    freeAboveSubtotal: data.freeAboveSubtotal ? toMinorUnits(data.freeAboveSubtotal) : null,
    estimatedDaysMin: daysMin,
    estimatedDaysMax: daysMax,
    isActive: data.isActive,
    position: data.position ? Number(data.position) || 0 : 0,
  };

  const rate = id
    ? await db.shippingRate.update({ where: { id }, data: payload })
    : await db.shippingRate.create({ data: payload });

  await recordAudit({
    actorId: user.id,
    action: id ? "shipping.rate.update" : "shipping.rate.create",
    entity: "ShippingRate",
    entityId: rate.id,
    after: { name: rate.name, price: rate.price, zoneId: rate.zoneId },
  });

  revalidateShipping();
  return { ok: true, message: id ? "Rate updated." : `Added ${rate.name}.` };
}

export async function deleteRateAction(rateId: string): Promise<AdminState> {
  const user = await requirePermission("settings:manage");

  const used = await db.order.count({ where: { shippingRateId: rateId } });
  if (used > 0) {
    await db.shippingRate.update({ where: { id: rateId }, data: { isActive: false } });
    await recordAudit({
      actorId: user.id,
      action: "shipping.rate.deactivate",
      entity: "ShippingRate",
      entityId: rateId,
      after: { reason: `used by ${used} orders` },
    });
    revalidateShipping();
    return {
      ok: true,
      message: `${used} order${used === 1 ? "" : "s"} used this rate, so it was switched off rather than deleted.`,
    };
  }

  await db.shippingRate.delete({ where: { id: rateId } });
  await recordAudit({
    actorId: user.id,
    action: "shipping.rate.delete",
    entity: "ShippingRate",
    entityId: rateId,
  });

  revalidateShipping();
  return { ok: true, message: "Rate deleted." };
}
