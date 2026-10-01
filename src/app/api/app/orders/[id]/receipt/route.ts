import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiOptionsResponse } from "@/lib/auth/bearer";
import { notifyOrder } from "@/lib/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = apiOptionsResponse;

/**
 * POST /api/app/orders/[id]/receipt
 * Resends the official tax receipt & invoice to the customer via SMS and Email.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const order = await db.order.findFirst({
    where: {
      OR: [{ id }, { orderNumber: id.toUpperCase() }],
    },
    select: { id: true, orderNumber: true, email: true, phone: true },
  });

  if (!order) {
    return NextResponse.json({ ok: false, error: "Order not found." }, { status: 404 });
  }

  try {
    await notifyOrder(order.id, { kind: "order.receipt" });
    return NextResponse.json({
      ok: true,
      message: `Receipt dispatched via SMS to ${order.phone} and email to ${order.email}.`,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to send receipt." },
      { status: 500 },
    );
  }
}
