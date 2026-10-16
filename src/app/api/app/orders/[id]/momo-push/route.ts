import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiOptionsResponse, withApiAuth, getOptionalBearerUser } from "@/lib/auth/bearer";
import { can, isStaff } from "@/lib/auth/rbac";
import { orderAccessTokenMatches } from "@/lib/order-access";
import { checkDirectCharge, checkMomoPin, initiateMomoPinPush, submitMomoPushOtp } from "@/lib/momo-push";
import { isPaymentSettled } from "@/lib/orders";
import { getCommerceSettings } from "@/lib/settings";
import { isMomoNetworkId } from "@/lib/momo-networks";
import { detectGhanaMomoProvider, normaliseGhanaMomoPhone } from "@/lib/paystack";
import { rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = apiOptionsResponse;

type Access =
  | { kind: "staff"; actor: { id: string; email?: string | null; role?: string | null } }
  | { kind: "customer"; actorId: string | null };

/**
 * Who may prompt or check payment on this order: staff with order access,
 * the signed-in owner, or anyone holding the order's access token (the link a
 * guest gets with their order). Nobody else, and the same answer for a missing
 * and a foreign order.
 */
async function resolveAccess(
  request: Request,
  id: string,
  user: Awaited<ReturnType<typeof getOptionalBearerUser>>,
  bodyToken?: unknown,
): Promise<{ order: { id: string; orderNumber: string; userId: string | null; phone: string | null; paymentStatus: string; depositAmount: number | null; total: number }; access: Access } | null> {
  const order = await db.order.findFirst({
    where: { OR: [{ id }, { orderNumber: id.toUpperCase() }] },
    select: { id: true, orderNumber: true, userId: true, phone: true, paymentStatus: true, depositAmount: true, total: true },
  });
  if (!order) return null;

  if (user && isStaff(user.role) && can(user.role, "orders:write")) {
    return { order, access: { kind: "staff", actor: user } };
  }
  if (user && order.userId === user.id) return { order, access: { kind: "customer", actorId: user.id } };

  const token = new URL(request.url).searchParams.get("t") ?? (typeof bodyToken === "string" ? bodyToken : "");
  if (token && orderAccessTokenMatches(order.orderNumber, token)) {
    return { order, access: { kind: "customer", actorId: user?.id ?? null } };
  }
  return null;
}

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

  const body = await request.json().catch(() => ({}));
  const user = await getOptionalBearerUser();
  const resolved = await resolveAccess(request, id, user, body.accessToken);
  if (!resolved) {
    return NextResponse.json({ ok: false, error: "Order not found." }, { status: 404 });
  }
  const { order, access } = resolved;

  // If OTP submission
  if (body.otp && body.reference) {
    const limited = rateLimitResponse([{ key: `momo-otp:${String(body.reference)}`, limit: 8, windowMs: 15 * 60 * 1000 }]);
    if (limited) return limited;
    const otpRes = await submitMomoPushOtp({
      orderId: order.id,
      reference: String(body.reference).trim(),
      otp: String(body.otp).trim(),
    });
    return NextResponse.json(otpRes);
  }

  const phone = String(body.phone || order.phone || "").trim();
  if (!phone) {
    return NextResponse.json(
      { ok: false, error: "Please enter a valid Ghana Mobile Money number." },
      { status: 400 },
    );
  }

  if (access.kind === "staff") {
    const result = await initiateMomoPinPush({
      orderId: order.id,
      phone,
      provider: body.provider || "auto",
      chargeScope: body.chargeScope || "FULL",
      actor: access.actor,
      allowDepositChange: true,
    });
    return NextResponse.json(result);
  }

  // A customer pays what is due, on a network that takes the direct prompt,
  // a few times at most: never a scope or network of their own choosing.
  const cleanPhone = normaliseGhanaMomoPhone(phone);
  const limited = rateLimitResponse([
    { key: `pay-attempt:${order.id}`, limit: 6, windowMs: 15 * 60 * 1000 },
    { key: `pay-phone:${cleanPhone}`, limit: 6, windowMs: 15 * 60 * 1000 },
  ]);
  if (limited) return limited;

  const provider = isMomoNetworkId(body.provider) ? body.provider : detectGhanaMomoProvider(cleanPhone);
  const { momoDirectNetworks } = await getCommerceSettings();
  if (!momoDirectNetworks.includes(provider)) {
    return NextResponse.json(
      { ok: false, error: "This network pays on the secure payment page. Choose card or MoMo online." },
      { status: 400 },
    );
  }

  const settled = isPaymentSettled(order.paymentStatus as Parameters<typeof isPaymentSettled>[0]);
  const chargeScope = settled ? "REMAINING_BALANCE" : order.depositAmount && order.depositAmount < order.total ? "DEPOSIT_50" : "FULL";

  const result = await initiateMomoPinPush({
    orderId: order.id,
    phone: cleanPhone,
    provider,
    chargeScope,
    // Not staff: the order timeline records customer prompts as the system's.
    actor: { id: "" },
    allowDepositChange: false,
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

  const user = await getOptionalBearerUser();
  const resolved = await resolveAccess(request, id, user);
  if (!resolved) {
    return NextResponse.json({ ok: false, error: "Order not found." }, { status: 404 });
  }
  const { order, access } = resolved;

  const url = new URL(request.url);
  const reference = url.searchParams.get("reference")?.trim();
  if (!reference) {
    return NextResponse.json({ ok: false, error: "Payment reference is required." }, { status: 400 });
  }
  const limited = rateLimitResponse([{ key: `momo-check:${reference}`, limit: 240, windowMs: 10 * 60 * 1000 }]);
  if (limited) return limited;

  const check =
    access.kind === "staff"
      ? await checkMomoPin({ orderId: order.id, reference, actor: access.actor })
      : await checkDirectCharge({ orderId: order.id, reference });

  return NextResponse.json({
    ok: true,
    paid: check.paid,
    status: check.paid ? "success" : "pending",
    // Paystack's own charge state: "send_otp" means show the code field.
    chargeStatus: check.paid ? "success" : (check.chargeStatus ?? null),
    displayText: check.displayText ?? null,
    message: check.message,
  });
});
