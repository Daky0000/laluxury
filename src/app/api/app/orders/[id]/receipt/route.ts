import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiOptionsResponse, getOptionalBearerUser } from "@/lib/auth/bearer";
import { can, isStaff } from "@/lib/auth/rbac";
import { notifyOrder } from "@/lib/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = apiOptionsResponse;

/**
 * POST /api/app/orders/[id]/receipt
 * Queues the official receipt and invoice for the customer through configured channels.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  const order = await db.order.findFirst({
    where: {
      OR: [{ id }, { orderNumber: id.toUpperCase() }],
    },
    select: { id: true, orderNumber: true, email: true, phone: true, userId: true },
  });

  // Owner or staff only. Receipts go to the contact details on file; only
  // staff may change where they are sent.
  const user = await getOptionalBearerUser();
  const staff = Boolean(user && isStaff(user.role) && can(user.role, "orders:write"));
  if (!order || !user || (!staff && order.userId !== user.id)) {
    return NextResponse.json({ ok: false, error: "Order not found." }, { status: 404 });
  }

  if (staff && body?.phone && typeof body.phone === "string" && body.phone.trim() !== order.phone) {
    await db.order.update({
      where: { id: order.id },
      data: { phone: body.phone.trim() },
    });
  }

  try {
    const res = await notifyOrder(order.id, { kind: "order.receipt" });
    return NextResponse.json({
      ok: res.ok,
      message: `Receipt notice: ${res.outcomes.join(", ")}.`,
      outcomes: res.outcomes,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to send receipt." },
      { status: 500 },
    );
  }
}
