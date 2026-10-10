"use server";

import { requireUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { markNotificationRead, markAllNotificationsRead } from "@/lib/notifications/inbox";

export async function markReadAction(form: FormData) {
  const user = await requireUser();
  const id = String(form.get("id") || "");
  await markNotificationRead(user.id, id);
  revalidatePath("/account");
}

export async function markAllReadAction() {
  const user = await requireUser();
  await markAllNotificationsRead(user.id);
  revalidatePath("/account");
}
