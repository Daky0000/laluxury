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
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  const order = await db.order.findFirst({
    where: {
      OR: [{ id }, { orderNumber: id.toUpperCase() }],
    },
    select: { id: true, orderNumber: true, email: true, phone: true },
  });

  if (!order) {
    return NextResponse.json({ ok: false, error: "Order not found." }, { status: 404 });
  }

  // Allow updating or providing recipient phone if missing or explicitly provided
  if (body?.phone && typeof body.phone === "string" && body.phone.trim() !== order.phone) {
    await db.order.update({
      where: { id: order.id },
      data: { phone: body.phone.trim() },
    });
  }

  try {
    const res = await notifyOrder(order.id, { kind: "order.receipt" });
    return NextResponse.json({
      ok: res.ok,
      message: `Receipt dispatched: ${res.outcomes.join(", ")}.`,
      outcomes: res.outcomes,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to send receipt." },
      { status: 500 },
    );
  }
}
