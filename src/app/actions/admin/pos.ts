"use server";

import { assertMinimumOrderQuantity } from "@/lib/minimum-order";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/auth/rbac";
import { logAudit } from "@/lib/audit";
import { markOrderPaid, uniqueOrderNumber } from "@/lib/orders";
import { newPaymentReference } from "@/lib/payment-reference";
import { DEFAULT_DEPOSIT_PERCENT, depositAmountFor } from "@/lib/deposits";

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
      .toLowerCase() || `showroom.${Date.now()}@nobleenclave.com`;
  // No made-up number: receipts and the account SMS must not go to a stranger.
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const addressLine1 = String(formData.get("addressLine1") ?? "").trim() || "Noble Enclave Showroom Pickup / Accra Delivery";
  const city = String(formData.get("city") ?? "").trim() || "Accra";
  const region = String(formData.get("region") ?? "").trim() || "Greater Accra";
  const customerNote = String(formData.get("customerNote") ?? "").trim() || null;

  const paymentMode = String(formData.get("paymentMode") ?? "FULL_100"); // FULL_100 | DEPOSIT_50
  const settlementChannel = String(formData.get("settlementChannel") ?? "PAID_POS"); // PAID_POS | PAID_MOMO_BANK | PENDING_INVOICE
  const shippingMajor = Number(formData.get("shippingGhs") ?? 0) || 0;
  const discountMajor = Number(formData.get("discountGhs") ?? 0) || 0;

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
      assertMinimumOrderQuantity(v.product.title, input.quantity, v.product.minimumOrderQuantity);
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
  const discountTotal = Math.min(subtotal, Math.max(0, Math.round(discountMajor * 100)));
  const total = Math.max(0, subtotal - discountTotal + shippingTotal);

  // A showroom discount gives money away: managers only.
  if (discountTotal > 0 && !can(staff.role, "discounts:write")) {
    throw new Error("Only a manager can give a showroom discount.");
  }

  const isDeposit50 = paymentMode === "DEPOSIT_50";
  const depositAmount = isDeposit50 ? depositAmountFor(total, DEFAULT_DEPOSIT_PERCENT) : null;
  if (isDeposit50) {
    hasPreorderItems = true;
  }

  const isPaidNow =
    settlementChannel !== "PENDING_INVOICE" && settlementChannel !== "PUSH_MOMO_PIN";
  const amountCollectedNow = depositAmount ?? total;

  // Recording money taken at the desk is a payments permission, as in the
  // order page's "mark paid".
  if (isPaidNow && !can(staff.role, "payments:record")) {
    throw new Error("Only a manager can record a showroom payment. Use \"pending invoice\" or the MoMo prompt.");
  }

  const orderNumber = await uniqueOrderNumber();

  const createdOrder = await db.$transaction(async (tx) => {
    const match = await tx.user.findUnique({ where: { email }, select: { id: true, role: true } });
    const existingCustomer = match?.role === "CUSTOMER" ? match : null;

    const address = await tx.address.create({
      data: {
        userId: existingCustomer?.id ?? null,
        firstName,
        lastName,
        phone: phone ?? "",
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
        // Settled below through markOrderPaid, like every other payment.
        status: "PENDING",
        paymentStatus: "PENDING",
        source: "pos",
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

    return order;
  });

  // Money taken at the desk: recorded like any payment, so the stock leaves
  // the shelf, a payment row exists to refund against, and receipts go out.
  if (isPaidNow) {
    await markOrderPaid({
      orderId: createdOrder.id,
      reference: newPaymentReference(createdOrder.orderNumber, "POS"),
      amount: amountCollectedNow,
      channel: settlementChannel === "PAID_POS" ? "pos_card_momo" : "bank_transfer",
      provider: "pos",
      purpose: depositAmount ? "DEPOSIT" : "FULL",
      raw: { recordedBy: staff.id, settlementChannel },
    });
  }

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
