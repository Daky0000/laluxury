"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { sendSms } from "@/lib/sms";
import { getSettings, updateSettings } from "@/lib/settings";
import { recordAudit } from "@/lib/audit";
import { normalisePhone } from "@/lib/phone";

export type NotificationActionState = {
  ok: boolean;
  message?: string;
};

export async function sendCustomSmsAction(
  _prev: NotificationActionState | null,
  formData: FormData,
): Promise<NotificationActionState> {
  const staff = await requirePermission("settings:manage");

  const phone = String(formData.get("phone") || "").trim();
  const title = String(formData.get("title") || "").trim();
  const message = String(formData.get("message") || "").trim();

  if (!phone) {
    return { ok: false, message: "Enter a recipient phone number." };
  }
  if (!message) {
    return { ok: false, message: "Enter a message to send." };
  }

  const clean = normalisePhone(phone);
  if (!clean) {
    return { ok: false, message: "Enter a valid phone number with country code (e.g. +233 24 000 0000)." };
  }

  const settings = await getSettings();
  const fullText = title ? `${settings.storeName} - ${title}: ${message}` : `${settings.storeName}: ${message}`;

  const sent = await sendSms(clean, fullText);

  await recordAudit({
    actorId: staff.id,
    action: "NOTIFICATION_CUSTOM_SMS",
    entity: "CustomerPhone",
    entityId: clean,
    after: { phone: clean, title, preview: message.slice(0, 100), ok: sent.ok },
  }).catch(() => null);

  if (!sent.ok && sent.fatal) {
    return { ok: false, message: `Failed to deliver SMS: ${sent.message}` };
  }

  return { ok: true, message: `Custom SMS successfully dispatched to ${phone}.` };
}

export async function updateStoreAnnouncementAction(
  _prev: NotificationActionState | null,
  formData: FormData,
): Promise<NotificationActionState> {
  const staff = await requirePermission("settings:manage");

  const announcement = String(formData.get("announcement") || "").trim();
  if (!announcement) {
    return { ok: false, message: "Enter announcement text." };
  }

  await updateSettings({ announcementBar: announcement });

  await recordAudit({
    actorId: staff.id,
    action: "ANNOUNCEMENT_UPDATED",
    entity: "StoreSettings",
    after: { announcement },
  }).catch(() => null);

  revalidatePath("/admin/settings");
  revalidatePath("/");

  return { ok: true, message: "Storewide announcement banner updated!" };
}
