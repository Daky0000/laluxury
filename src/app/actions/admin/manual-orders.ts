"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { uniqueOrderNumber, logOrderEvent } from "@/lib/orders";
import { commitStock } from "@/lib/inventory";
import { GHANA_REGIONS } from "@/lib/constants";
import type { AdminState } from "./products";

/**
 * Orders raised in the console rather than through checkout.
 *
 * Ghanaian shops take a lot of business over WhatsApp and in the showroom, and
 * those orders still need to exist here — for stock, for the customer's
 * history, and so the day's revenue is the real number. This writes the same
 * order shape checkout produces, so nothing downstream can tell them apart.
 *
 * Orders raised here attach to the customer account automatically when one
 * already has that email, so their purchase history stays complete.
 */

function revalidateOrders() {
  revalidatePath("/admin/orders");
  revalidatePath("/admin");
  revalidatePath("/admin/inventory");
}

type LineInput = { variantId: string; quantity: number };

/** Builds the order, its address and its lines from real catalog rows. */
async function writeOrder(args: {
  lines: LineInput[];
  email: string;
  phone: string;
  firstName: string;
  lastName: string;
  line1: string;
  city: string;
  region: string;
  shippingTotal: number;
  markPaid: boolean;
  staffNote?: string | null;
  actorId: string;
  channel: string;
}) {
  const variants = await db.variant.findMany({
    where: { id: { in: args.lines.map((line) => line.variantId) } },
    include: { product: { include: { images: { orderBy: { position: "asc" }, take: 1 } } } },
  });

  if (variants.length === 0) throw new Error("None of those products exist any more.");

  const items = args.lines.flatMap((line) => {
    const variant = variants.find((v) => v.id === line.variantId);
    if (!variant) return [];
    const quantity = Math.max(1, Math.floor(line.quantity));
    return [
      {
        variantId: variant.id,
        productId: variant.productId,
        productTitle: variant.product.title,
        variantTitle: variant.title,
        sku: variant.sku,
        imageUrl: variant.product.images[0]?.url ?? null,
        quantity,
        unitPrice: variant.price,
        discountAllocated: 0,
        total: variant.price * quantity,
      },
    ];
  });

  if (items.length === 0) throw new Error("Add at least one line to the order.");

  const subtotal = items.reduce((sum, item) => sum + item.total, 0);
  const total = subtotal + args.shippingTotal;
  const orderNumber = await uniqueOrderNumber();

  // Attach to the customer record when one already has this email, so the
  // order shows up in their history rather than sitting as a guest order.
  const customer = await db.user.findUnique({
    where: { email: args.email },
    select: { id: true },
  });

  const order = await db.$transaction(async (tx) => {
    const address = await tx.address.create({
      data: {
        userId: customer?.id ?? null,
        firstName: args.firstName,
        lastName: args.lastName,
        phone: args.phone,
        line1: args.line1,
        city: args.city,
        region: args.region,
        country: "GH",
      },
    });

    return tx.order.create({
      data: {
        orderNumber,
        userId: customer?.id ?? null,
        email: args.email,
        phone: args.phone,
        status: args.markPaid ? "PAID" : "PENDING",
        paymentStatus: args.markPaid ? "SUCCESS" : "PENDING",
        subtotal,
        discountTotal: 0,
        shippingTotal: args.shippingTotal,
        taxTotal: 0,
        total,
        shippingAddressId: address.id,
        billingAddressId: address.id,
        staffNote: args.staffNote ?? null,
        paidAt: args.markPaid ? new Date() : null,
        items: { create: items },
      },
      include: { items: true },
    });
  });

  // A paid order has left the shelf, so take the stock now. Unpaid ones are
  // left alone — the stock moves when they are marked paid, exactly as a
  // checkout order behaves.
  if (args.markPaid) {
    try {
      await commitStock(
        order.items.flatMap((item) =>
          item.variantId ? [{ variantId: item.variantId, quantity: item.quantity }] : [],
        ),
        order.orderNumber,
        args.actorId,
      );
      await db.order.update({
        where: { id: order.id },
        data: { inventoryAppliedAt: new Date() },
      });
    } catch (error) {
      // The order is real either way; flag the stock problem rather than lose it.
      await logOrderEvent({
        orderId: order.id,
        type: "note",
        message: `Stock was not deducted: ${error instanceof Error ? error.message : "unknown error"}`,
      });
    }
  }

  await logOrderEvent({
    orderId: order.id,
    type: "note",
    message: `Created in the console (${args.channel}).`,
  });

  await recordAudit({
    actorId: args.actorId,
    action: "order.create.manual",
    entity: "Order",
    entityId: order.id,
    after: { orderNumber, total, channel: args.channel },
  });

  return order;
}

export async function createManualOrderAction(
  _prev: AdminState | null,
  formData: FormData,
): Promise<AdminState> {
  const user = await requirePermission("orders:write");

  let lines: LineInput[];
  try {
    lines = JSON.parse(String(formData.get("lines") ?? "[]")) as LineInput[];
  } catch {
    return { ok: false, message: "Could not read the order lines." };
  }

  lines = lines.filter((line) => line?.variantId && Number(line.quantity) > 0);
  if (lines.length === 0) return { ok: false, message: "Add at least one product." };

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const phone = String(formData.get("phone") ?? "").trim();
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const line1 = String(formData.get("line1") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  const region = String(formData.get("region") ?? "").trim();

  if (!email || !email.includes("@")) return { ok: false, message: "Enter the customer's email." };
  if (!phone) return { ok: false, message: "Enter a phone number." };
  if (!firstName) return { ok: false, message: "Enter a first name." };
  if (!line1 || !city) return { ok: false, message: "Enter the delivery address." };
  if (!GHANA_REGIONS.includes(region as (typeof GHANA_REGIONS)[number])) {
    return { ok: false, message: "Choose a region." };
  }

  const shippingMajor = Number(String(formData.get("shipping") ?? "0")) || 0;

  try {
    const order = await writeOrder({
      lines,
      email,
      phone,
      firstName,
      lastName: lastName || "—",
      line1,
      city,
      region,
      shippingTotal: Math.max(0, Math.round(shippingMajor * 100)),
      markPaid: formData.get("markPaid") === "on",
      staffNote: String(formData.get("staffNote") ?? "").trim() || null,
      actorId: user.id,
      channel: String(formData.get("channel") ?? "console"),
    });

    revalidateOrders();
    return { ok: true, message: `Created ${order.orderNumber}.` };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "The order could not be created.",
    };
  }
}
