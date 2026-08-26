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
 * Demo orders use the same path and are marked in `staffNote`, so the owner can
 * see the whole flow with realistic data and then clear it in one action.
 */

const DEMO_NOTE = "DEMO ORDER — created from the console to preview the flow.";

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
        discountTotal: 0,
        total: variant.price * quantity,
      },
    ];
  });

  if (items.length === 0) throw new Error("Add at least one line to the order.");

  const subtotal = items.reduce((sum, item) => sum + item.total, 0);
  const total = subtotal + args.shippingTotal;
  const orderNumber = await uniqueOrderNumber();

  const order = await db.$transaction(async (tx) => {
    const address = await tx.address.create({
      data: {
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

/**
 * A realistic order built from whatever is actually in the catalog, so the
 * owner can walk the fulfilment flow before a real customer arrives.
 */
export async function createDemoOrderAction(): Promise<AdminState> {
  const user = await requirePermission("orders:write");

  const variants = await db.variant.findMany({
    where: { isActive: true, product: { status: "ACTIVE" } },
    orderBy: { price: "desc" },
    take: 12,
    select: { id: true },
  });

  if (variants.length === 0) {
    return { ok: false, message: "Add a product first — a demo order needs something to sell." };
  }

  // Two or three lines, from opposite ends of the price list, so the demo shows
  // a mixed basket rather than one item.
  const picks = [variants[0], variants[Math.floor(variants.length / 2)], variants.at(-1)]
    .filter((variant): variant is { id: string } => Boolean(variant))
    .filter((variant, index, all) => all.findIndex((v) => v.id === variant.id) === index);

  try {
    const order = await writeOrder({
      lines: picks.map((variant, index) => ({ variantId: variant.id, quantity: index === 0 ? 1 : 2 })),
      email: "demo.customer@example.com",
      phone: "+233 24 000 0000",
      firstName: "Demo",
      lastName: "Customer",
      line1: "12 Lagos Avenue, East Legon",
      city: "Accra",
      region: "Greater Accra",
      shippingTotal: 2500,
      // Left unpaid on purpose: it shows the whole pipeline from awaiting
      // payment onward, and it never touches real stock.
      markPaid: false,
      staffNote: DEMO_NOTE,
      actorId: user.id,
      channel: "demo",
    });

    revalidateOrders();
    return {
      ok: true,
      message: `Demo order ${order.orderNumber} created. It is unpaid, so no stock moved.`,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "The demo order could not be created.",
    };
  }
}

/** Removes every demo order in one go. */
export async function clearDemoOrdersAction(): Promise<AdminState> {
  const user = await requirePermission("orders:write");

  const demos = await db.order.findMany({
    where: { staffNote: DEMO_NOTE },
    select: { id: true, inventoryAppliedAt: true },
  });

  if (demos.length === 0) return { ok: true, message: "There are no demo orders." };

  // Only ever created unpaid, so nothing needs restocking — but check anyway
  // rather than assume, in case one was marked paid by hand afterwards.
  const applied = demos.filter((order) => order.inventoryAppliedAt !== null);
  if (applied.length > 0) {
    return {
      ok: false,
      message: `${applied.length} demo order${applied.length === 1 ? " has" : "s have"} already moved stock. Cancel ${applied.length === 1 ? "it" : "them"} first so the stock goes back.`,
    };
  }

  await db.order.deleteMany({ where: { id: { in: demos.map((order) => order.id) } } });

  await recordAudit({
    actorId: user.id,
    action: "order.demo.clear",
    entity: "Order",
    after: { removed: demos.length },
  });

  revalidateOrders();
  return { ok: true, message: `Removed ${demos.length} demo order${demos.length === 1 ? "" : "s"}.` };
}
