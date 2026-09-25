"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { generateOrderNumber } from "@/lib/slug";
import { logAudit } from "@/lib/audit";

export type PosItemInput = {
  variantId: string;
  quantity: number;
};

export async function createPosShowroomOrderAction(formData: FormData): Promise<void> {
  const staff = await requirePermission("orders:write");

  const firstName = String(formData.get("firstName") ?? "").trim() || "Walk-In";
  const lastName = String(formData.get("lastName") ?? "").trim() || "Client";
  const email =
    String(formData.get("email") ?? "")
      .trim()
      .toLowerCase() || `showroom.${Date.now()}@laluxury.com`;
  const phone = String(formData.get("phone") ?? "").trim() || "+233000000000";
  const addressLine1 = String(formData.get("addressLine1") ?? "").trim() || "LaLuxury Showroom Pickup / Accra Delivery";
  const city = String(formData.get("city") ?? "").trim() || "Accra";
  const region = String(formData.get("region") ?? "").trim() || "Greater Accra";
  const customerNote = String(formData.get("customerNote") ?? "").trim() || null;

  const paymentMode = String(formData.get("paymentMode") ?? "FULL_100"); // FULL_100 | DEPOSIT_50
  const settlementChannel = String(formData.get("settlementChannel") ?? "PAID_POS"); // PAID_POS | PAID_MOMO_BANK | PENDING_INVOICE
  const shippingMajor = Number(formData.get("shippingGhs") ?? 0);
  const discountMajor = Number(formData.get("discountGhs") ?? 0);

  const itemsJson = String(formData.get("itemsJson") ?? "[]");
  let parsedItems: PosItemInput[] = [];
  try {
    parsedItems = JSON.parse(itemsJson);
  } catch {
    parsedItems = [];
  }

  const validItems = parsedItems.filter((i) => i.variantId && i.quantity > 0);
  if (validItems.length === 0) {
    throw new Error("Please add at least one product to the showroom order.");
  }

  const variants = await db.variant.findMany({
    where: { id: { in: validItems.map((i) => i.variantId) } },
    include: {
      product: {
        include: {
          images: { orderBy: { position: "asc" }, take: 1 },
        },
      },
    },
  });

  const variantMap = new Map(variants.map((v) => [v.id, v]));

  let subtotal = 0;
  let hasPreorderItems = false;

  const orderItemsData = validItems
    .map((input) => {
      const v = variantMap.get(input.variantId);
      if (!v) return null;
      const lineTotal = v.price * input.quantity;
      subtotal += lineTotal;
      if (v.product.isPreorder) hasPreorderItems = true;
      return {
        variantId: v.id,
        productId: v.productId,
        productTitle: v.product.title,
        variantTitle: v.title,
        sku: v.sku,
        imageUrl: v.product.images[0]?.url ?? null,
        isPreorder: v.product.isPreorder,
        preorderLeadTime: v.product.preorderLeadTime ?? "4–6 weeks",
        quantity: input.quantity,
        unitPrice: v.price,
        discountAllocated: 0,
        total: lineTotal,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const shippingTotal = Math.max(0, Math.round(shippingMajor * 100));
  const discountTotal = Math.max(0, Math.round(discountMajor * 100));
  const total = Math.max(0, subtotal - discountTotal + shippingTotal);

  const isDeposit50 = paymentMode === "DEPOSIT_50";
  const depositAmount = isDeposit50 ? Math.round(total * 0.5) : null;
  if (isDeposit50) {
    hasPreorderItems = true;
  }

  const isPaidNow =
    settlementChannel !== "PENDING_INVOICE" && settlementChannel !== "PUSH_MOMO_PIN";
  const amountCollectedNow = isDeposit50 ? (depositAmount ?? total) : total;

  const orderNumber = await generateOrderNumber();

  const createdOrder = await db.$transaction(async (tx) => {
    const existingCustomer = await tx.user.findUnique({ where: { email } });

    const address = await tx.address.create({
      data: {
        userId: existingCustomer?.id ?? null,
        firstName,
        lastName,
        phone,
        line1: addressLine1,
        city,
        region,
        country: "GH",
      },
    });

    const order = await tx.order.create({
      data: {
        orderNumber,
        userId: existingCustomer?.id ?? null,
        email,
        phone,
        status: isPaidNow ? "PAID" : "PENDING",
        paymentStatus: isPaidNow ? "SUCCESS" : "PENDING",
        fulfillmentStatus: "UNFULFILLED",
        subtotal,
        discountTotal,
        shippingTotal,
        taxTotal: 0,
        total,
        shippingAddressId: address.id,
        billingAddressId: address.id,
        customerNote,
        staffNote: `Created via Admin POS / Showroom Desk by ${staff.email} (${settlementChannel})`,
        hasPreorderItems,
        paymentMethod:
          settlementChannel === "PUSH_MOMO_PIN"
            ? "mobile_money_push"
            : settlementChannel === "PAID_POS"
              ? "pos_terminal"
              : settlementChannel === "PAID_MOMO_BANK"
                ? "bank_transfer"
                : "paystack",
        depositAmount,
        preorderStage: "DEPOSIT_CONFIRMED",
        preorderNote: isDeposit50
          ? "50% Showroom Deposit recorded. Remaining 50% balance due upon arrival & white-glove inspection."
          : null,
        paidAt: isPaidNow ? new Date() : null,
        items: {
          create: orderItemsData,
        },
        events: {
          create: {
            type: "order.placed",
            message: `Showroom / POS Order created by staff (${isDeposit50 ? "50% Deposit Split" : "100% Full Invoice"} · ${settlementChannel}).`,
            actorId: staff.id,
          },
        },
      },
    });

    if (isPaidNow) {
      await tx.payment.create({
        data: {
          orderId: order.id,
          provider: settlementChannel === "PAID_POS" ? "pos_terminal" : "bank_transfer",
          reference: `POS-${order.orderNumber}-${Date.now()}`,
          amount: amountCollectedNow,
          currency: "GHS",
          status: "SUCCESS",
          channel: settlementChannel === "PAID_POS" ? "pos_card_momo" : "bank_transfer",
          paidAt: new Date(),
        },
      });
    }

    return order;
  });

  await logAudit({
    actorId: staff.id,
    action: "order.pos_create",
    entity: "Order",
    entityId: createdOrder.id,
    after: { orderNumber: createdOrder.orderNumber, total, depositAmount, settlementChannel },
  });

  revalidatePath("/admin/orders");
  revalidatePath("/admin/preorders");
  redirect(
    settlementChannel === "PUSH_MOMO_PIN"
      ? `/admin/orders/${createdOrder.id}?momoPush=1`
      : `/admin/orders/${createdOrder.id}`,
  );
}
