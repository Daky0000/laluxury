import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiOptionsResponse, withApiAuth, requireBearerUser } from "@/lib/auth/bearer";
import { isStaff } from "@/lib/auth/rbac";
import {
  initiateMomoPinPushAction,
  submitMomoPushOtpAction,
  checkOrConfirmMomoPinAction,
} from "@/app/actions/admin/momo-push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = apiOptionsResponse;

/**
 * POST /api/app/orders/[id]/momo-push
 * Dispatches a live Mobile Money USSD prompt directly to the customer's phone
 * so they can enter their 4-digit PIN to pay their pending order balance.
 */
export const POST = withApiAuth(async (
  request: Request,
  context?: { params: Promise<{ id: string }> },
) => {
  const params = await context?.params;
  const id = params?.id;
  if (!id) {
    return NextResponse.json({ ok: false, error: "Order ID is required." }, { status: 400 });
  }

  const user = await requireBearerUser();
  const isStaffMember = isStaff(user.role);

  const order = await db.order.findFirst({
    where: {
      OR: [{ id }, { orderNumber: id.toUpperCase() }],
    },
    select: { id: true, orderNumber: true, total: true, depositAmount: true, phone: true, userId: true },
  });

  if (!order) {
    return NextResponse.json({ ok: false, error: "Order not found." }, { status: 404 });
  }

  if (!isStaffMember && order.userId !== user.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized access to order." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));

  // If OTP submission
  if (body.otp && body.reference) {
    const otpRes = await submitMomoPushOtpAction({
      orderId: order.id,
      reference: String(body.reference).trim(),
      otp: String(body.otp).trim(),
      actor: user,
    });
    return NextResponse.json(otpRes);
  }

  const phone = String(body.phone || order.phone || "").trim();
  const provider = body.provider || "auto";
  const chargeScope = body.chargeScope || "FULL";

  if (!phone) {
    return NextResponse.json(
      { ok: false, error: "Please enter a valid Ghana Mobile Money number." },
      { status: 400 },
    );
  }

  const result = await initiateMomoPinPushAction({
    orderId: order.id,
    phone,
    provider,
    chargeScope,
    actor: user,
  });

  return NextResponse.json(result);
});

/**
 * GET /api/app/orders/[id]/momo-push?reference=...&chargeScope=...
 * Checks if the customer has entered their 4-digit MoMo PIN on their handset.
 */
export const GET = withApiAuth(async (
  request: Request,
  context?: { params: Promise<{ id: string }> },
) => {
  const params = await context?.params;
  const id = params?.id;
  if (!id) {
    return NextResponse.json({ ok: false, error: "Order ID is required." }, { status: 400 });
  }

  const user = await requireBearerUser();
  const isStaffMember = isStaff(user.role);

  const order = await db.order.findFirst({
    where: {
      OR: [{ id }, { orderNumber: id.toUpperCase() }],
    },
    select: { id: true, userId: true },
  });

  if (!order) {
    return NextResponse.json({ ok: false, error: "Order not found." }, { status: 404 });
  }

  if (!isStaffMember && order.userId !== user.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized access to order." }, { status: 403 });
  }

  const url = new URL(request.url);
  const reference = url.searchParams.get("reference")?.trim();
  const chargeScope = (url.searchParams.get("chargeScope") as "FULL" | "DEPOSIT_50") || "FULL";

  if (!reference) {
    return NextResponse.json({ ok: false, error: "Payment reference is required." }, { status: 400 });
  }

  const check = await checkOrConfirmMomoPinAction({
    orderId: order.id,
    reference,
    chargeScope,
    simulateClientPinEntered: false,
    actor: user,
  });

  return NextResponse.json({
    ok: true,
    paid: check.paid,
    status: (check as any).status || (check.paid ? "success" : "pending"),
    message: check.message,
  });
});
