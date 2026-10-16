"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { getCommerceSettings, updateSettings } from "@/lib/settings";
import { formatMoney } from "@/lib/money";
import { parseDeliveryFee } from "@/lib/shipping";
import type { AdminState } from "./products";

/**
 * Delivery is one fixed fee for every region (`deliveryFee` in store
 * settings). The old zones and rates no longer price anything; past orders
 * keep the rate they were placed with.
 */

function revalidateShipping() {
  revalidatePath("/admin/settings/delivery");
  revalidatePath("/checkout");
  revalidatePath("/", "layout");
}

export async function saveDeliveryFeeAction(
  _prev: AdminState | null,
  formData: FormData,
): Promise<AdminState> {
  const user = await requirePermission("settings:manage");

  const parsed = parseDeliveryFee(formData.get("deliveryFee"));
  if ("error" in parsed) return { ok: false, message: parsed.error };

  const before = (await getCommerceSettings()).deliveryFee;
  await updateSettings({ deliveryFee: parsed.fee });

  await recordAudit({
    actorId: user.id,
    action: "shipping.fee.update",
    entity: "Setting",
    entityId: "store",
    before: { deliveryFee: before },
    after: { deliveryFee: parsed.fee },
  });

  revalidateShipping();
  return {
    ok: true,
    message: `Delivery fee saved: ${parsed.fee === 0 ? "free" : formatMoney(parsed.fee)} on every delivery order.`,
  };
}
