"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { normalisePhone } from "@/lib/phone";
import { rateLimit, requestAddress, retryMessage } from "@/lib/rate-limit";
import { toMinorUnits } from "@/lib/money";
import { postAlert } from "@/lib/agent/slack";
import { recordAudit } from "@/lib/audit";
import type { PreorderRequestStatus } from "@/generated/prisma";

export type PreorderActionState = {
  ok: boolean;
  message?: string;
  requestId?: string;
  fieldErrors?: Record<string, string>;
};

const requestSchema = z.object({
  name: z.string().trim().min(2, "Enter your name."),
  email: z.string().trim().email("Enter a valid email address."),
  phone: z
    .string()
    .min(1, "Enter your phone number.")
    .refine((v) => normalisePhone(v) !== null, {
      message: "Enter a valid Ghana phone number (e.g. 024 000 0000) or international number.",
    }),
  productTitle: z.string().trim().min(2, "Tell us what piece you would like us to order for you."),
  productId: z.string().optional(),
  variantTitle: z.string().optional(),
  quantity: z.coerce.number().int().min(1).max(200).default(1),
  targetBudgetMajor: z.string().optional(),
  notes: z.string().trim().max(2000).optional(),
});

export async function submitPreorderRequestAction(
  _prev: PreorderActionState | null,
  formData: FormData,
): Promise<PreorderActionState> {
  const ip = await requestAddress();
  const limit = rateLimit(`preorder-req:${ip}`, { limit: 12, windowMs: 60 * 60 * 1000 });
  if (!limit.ok) {
    return { ok: false, message: retryMessage(limit.retryAfterSeconds) };
  }

  const parsed = requestSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    productTitle: formData.get("productTitle"),
    productId: formData.get("productId") || undefined,
    variantTitle: formData.get("variantTitle") || undefined,
    quantity: formData.get("quantity") || 1,
    targetBudgetMajor: formData.get("targetBudgetMajor") || undefined,
    notes: formData.get("notes") || undefined,
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !fieldErrors[key]) {
        fieldErrors[key] = issue.message;
      }
    }
    return { ok: false, fieldErrors };
  }

  const data = parsed.data;
  const phone = normalisePhone(data.phone)!;
  const budgetNumber = data.targetBudgetMajor ? Number(data.targetBudgetMajor) : NaN;
  const targetBudget =
    Number.isFinite(budgetNumber) && budgetNumber > 0 ? toMinorUnits(budgetNumber) : null;

  const swatches = formData
    .getAll("swatchRequest")
    .map(String)
    .filter(Boolean)
    .join(", ");

  // Handle optional direct photo upload from phone/computer into MediaAsset
  let imageUrl: string | null = null;
  const photoFile = formData.get("photoFile");
  if (photoFile instanceof File && photoFile.size > 0 && photoFile.size <= 8 * 1024 * 1024) {
    const buffer = Buffer.from(await photoFile.arrayBuffer());
    const asset = await db.mediaAsset.create({
      data: {
        source: "DATABASE",
        url: "/api/media/pending",
        filename: photoFile.name || "preorder-reference.jpg",
        mimeType: photoFile.type || "image/jpeg",
        folder: "preorders",
        size: buffer.length,
        data: buffer,
      },
    });
    imageUrl = `/api/media/${asset.id}`;
    await db.mediaAsset.update({
      where: { id: asset.id },
      data: { url: imageUrl },
    });
  }

  const created = await db.preorderRequest.create({
    data: {
      name: data.name,
      email: data.email.toLowerCase(),
      phone,
      productTitle: data.productTitle,
      productId: data.productId ?? null,
      variantTitle: data.variantTitle ?? null,
      quantity: data.quantity,
      targetBudget,
      notes: data.notes ?? null,
      imageUrl,
      swatchRequest: swatches || null,
      status: "NEW",
    },
  });

  await postAlert(
    `:sparkles: *New Pre-Order Sourcing Request* from *${data.name}* (${phone}):\n` +
      `• Piece: *${data.productTitle}*${data.variantTitle ? ` (${data.variantTitle})` : ""} × ${data.quantity}\n` +
      (swatches ? `• Swatches requested: ${swatches}\n` : "") +
      (data.notes ? `• Notes: ${data.notes}` : ""),
  ).catch(() => {});

  revalidatePath("/admin/preorders");
  revalidatePath("/admin");

  return {
    ok: true,
    requestId: created.id,
    message:
      "Your Pre-Order sourcing request has been received! Our concierge team will confirm availability, exact timeline, and any requested material swatches with you via WhatsApp/phone.",
  };
}

export async function updatePreorderRequestStatusAction(
  id: string,
  status: PreorderRequestStatus,
  staffNote?: string,
): Promise<{ ok: boolean; message: string }> {
  const actor = await requirePermission("orders:write");

  const updated = await db.preorderRequest.update({
    where: { id },
    data: {
      status,
      ...(staffNote !== undefined ? { staffNote } : {}),
    },
  });

  await recordAudit({
    actorId: actor.id,
    action: "preorder_request.update",
    entity: "PreorderRequest",
    entityId: id,
    after: { status: updated.status, staffNote: updated.staffNote },
  });

  revalidatePath("/admin/preorders");
  revalidatePath("/admin");

  return { ok: true, message: `Pre-order request updated to ${status}.` };
}
