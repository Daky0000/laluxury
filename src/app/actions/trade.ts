"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { rateLimit, requestAddress, retryMessage } from "@/lib/rate-limit";

const tradeSchema = z.object({
  name: z.string().min(2, "Please enter your full name").max(120),
  company: z.string().min(2, "Please enter your studio or firm name").max(200),
  role: z.string().min(2, "Please select your role").max(100),
  email: z.string().email("Please enter a valid email address").max(254),
  phone: z.string().min(6, "Please enter a valid phone / WhatsApp number").max(32),
  portfolioUrl: z.string().max(2048).optional(),
  projectScope: z.string().max(4000).optional(),
});

export type TradeFormState = {
  ok: boolean;
  message?: string;
  discountCode?: string;
  discountPercent?: number;
};

export async function submitTradeApplicationAction(
  _prevState: TradeFormState,
  formData: FormData,
): Promise<TradeFormState> {
  const limit = rateLimit(`trade:${await requestAddress()}`, { limit: 3, windowMs: 60 * 60 * 1000 });
  if (!limit.ok) return { ok: false, message: retryMessage(limit.retryAfterSeconds) };
  const parsed = tradeSchema.safeParse({
    name: String(formData.get("name") ?? "").trim(),
    company: String(formData.get("company") ?? "").trim(),
    role: String(formData.get("role") ?? "Interior Designer").trim(),
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    phone: String(formData.get("phone") ?? "").trim(),
    portfolioUrl: String(formData.get("portfolioUrl") ?? "").trim() || undefined,
    projectScope: String(formData.get("projectScope") ?? "").trim() || undefined,
  });

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return {
      ok: false,
      message: firstIssue?.message ?? "Please check your trade application details.",
    };
  }

  try {
    const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
    const discountCode = `TRADE-${suffix}`;
    const discountPercent = 12;

    await db.$transaction(async (tx) => {
      await tx.tradeApplication.create({
        data: {
          name: parsed.data.name,
          company: parsed.data.company,
          role: parsed.data.role,
          email: parsed.data.email,
          phone: parsed.data.phone,
          portfolioUrl: parsed.data.portfolioUrl || null,
          projectScope: parsed.data.projectScope || null,
          status: "APPROVED",
          discountCode,
          discountPercent,
        },
      });

      await tx.discount.upsert({
        where: { code: discountCode },
        update: {
          isActive: true,
          value: discountPercent,
        },
        create: {
          code: discountCode,
          description: `Trade Partner 12% Privilege (${parsed.data.company})`,
          type: "PERCENTAGE",
          value: discountPercent,
          minSubtotal: 0,
          isActive: true,
        },
      });
    });

    revalidatePath("/admin/preorders");
    return {
      ok: true,
      discountCode,
      discountPercent,
      message: "Your Trade Partner membership is approved and active immediately.",
    };
  } catch (error) {
    console.error("[submitTradeApplicationAction]", error);
    return {
      ok: false,
      message: "Could not submit your Trade Application right now. Please try again.",
    };
  }
}
