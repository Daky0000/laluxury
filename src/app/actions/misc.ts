"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { postAlert } from "@/lib/agent/slack";

export type SimpleState = { ok: boolean; message?: string };

const emailSchema = z.string().email();

export async function subscribeAction(
  _prev: SimpleState | null,
  formData: FormData,
): Promise<SimpleState> {
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) return { ok: false, message: "Enter a valid email address." };

  const email = parsed.data.toLowerCase().trim();

  await db.newsletterSubscriber.upsert({
    where: { email },
    create: { email, source: String(formData.get("source") || "footer") },
    // Re-subscribing someone who previously opted out is intentional here.
    update: { isSubscribed: true, unsubscribedAt: null },
  });

  return { ok: true, message: "You are on the list." };
}

/**
 * The heart on a product page. Saving needs an account, so a signed-out
 * shopper is told to sign in rather than silently losing the tap.
 */
export async function toggleWishlistAction(
  productId: string,
): Promise<{ ok: boolean; saved: boolean; message?: string }> {
  const user = await currentUser();
  if (!user) return { ok: false, saved: false, message: "Sign in to save pieces." };

  const existing = await db.wishlistItem.findUnique({
    where: { userId_productId: { userId: user.id, productId } },
  });

  if (existing) {
    await db.wishlistItem.delete({ where: { id: existing.id } });
  } else {
    await db.wishlistItem.create({ data: { userId: user.id, productId } });
  }

  revalidatePath("/account");
  return { ok: true, saved: !existing };
}

const contactSchema = z.object({
  name: z.string().min(1, "Tell us your name."),
  email: z.string().email("Enter a valid email address."),
  phone: z.string().optional(),
  subject: z.string().optional(),
  message: z.string().min(10, "A little more detail, please."),
});

export async function contactAction(
  _prev: SimpleState | null,
  formData: FormData,
): Promise<SimpleState> {
  const parsed = contactSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone") || undefined,
    subject: formData.get("subject") || undefined,
    message: formData.get("message"),
  });

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  await db.contactMessage.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email.toLowerCase(),
      phone: parsed.data.phone ?? null,
      subject: parsed.data.subject ?? null,
      message: parsed.data.message,
    },
  });

  await postAlert(`:envelope: New message from ${parsed.data.name} <${parsed.data.email}>`);

  return { ok: true, message: "Thank you. We will reply within one business day." };
}
