import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth, getBearerSession, apiOptionsResponse } from "@/lib/auth/bearer";
import { isStaff } from "@/lib/auth/rbac";
import { db } from "@/lib/db";
import { sendSms } from "@/lib/sms";
import { sendOrderCustomMessage } from "@/lib/notify";
import { getSettings, updateSettings } from "@/lib/settings";
import { recordAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = apiOptionsResponse;

const customNotificationSchema = z.object({
  target: z.enum(["phone", "announcement", "order"]),
  message: z.string().trim().min(2, "Message must be at least 2 characters."),
  phone: z.string().trim().optional(),
  orderId: z.string().trim().optional(),
  title: z.string().trim().optional(),
});

export const POST = withApiAuth(async (request: Request) => {
  const session = await getBearerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized. Staff login required." }, { status: 401 });
  }

  const staffUser = await db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, role: true, firstName: true, lastName: true },
  });

  if (!staffUser || !isStaff(staffUser.role)) {
    return NextResponse.json(
      { error: "Forbidden. Only store owners and staff can broadcast custom notifications." },
      { status: 403 },
    );
  }

  const json = await request.json().catch(() => null);
  const parsed = customNotificationSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid notification request." },
      { status: 400 },
    );
  }

  const { target, message, phone, orderId, title } = parsed.data;

  // 1. Direct Customer SMS Dispatch
  if (target === "phone") {
    if (!phone) {
      return NextResponse.json({ error: "Recipient phone number is required." }, { status: 400 });
    }

    const settings = await getSettings();
    const formattedMessage = title
      ? `${settings.storeName} - ${title}: ${message}`
      : `${settings.storeName}: ${message}`;

    const sent = await sendSms(phone, formattedMessage);

    await recordAudit({
      actorId: staffUser.id,
      action: "NOTIFICATION_CUSTOM_SMS",
      entity: "CustomerPhone",
      entityId: phone,
      after: {
        phone,
        title,
        messagePreview: message.slice(0, 100),
        outcome: sent.ok ? "sent" : `failed (${sent.code})`,
      },
    }).catch(() => null);

    if (!sent.ok && sent.fatal) {
      return NextResponse.json(
        { error: `Could not send SMS: ${sent.message}` },
        { status: 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      message: `SMS notification dispatched to ${phone}.`,
      deliveryStatus: sent.ok ? "delivered" : "queued",
    });
  }

  // 2. Storewide Announcement Bar / Marquee Update
  if (target === "announcement") {
    const announcementText = title ? `${title.toUpperCase()}: ${message}` : message;

    await updateSettings({
      announcementBar: announcementText,
    });

    await recordAudit({
      actorId: staffUser.id,
      action: "ANNOUNCEMENT_UPDATED",
      entity: "StoreSettings",
      after: {
        title,
        announcementText,
      },
    }).catch(() => null);

    return NextResponse.json({
      ok: true,
      message: "Storewide in-app announcement banner updated successfully.",
      announcementBar: announcementText,
    });
  }

  // 3. Order-Specific Customer Notification
  if (target === "order") {
    if (!orderId) {
      return NextResponse.json({ error: "Order ID is required." }, { status: 400 });
    }

    const res = await sendOrderCustomMessage({
      orderId,
      customText: message,
      actorId: staffUser.id,
    });

    if (!res.ok) {
      return NextResponse.json({ error: res.message }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      message: res.message,
    });
  }

  return NextResponse.json({ error: "Unknown notification target." }, { status: 400 });
});

export const GET = withApiAuth(async () => {
  const session = await getBearerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const settings = await getSettings();
  return NextResponse.json({
    ok: true,
    currentAnnouncement: settings.announcementBar,
    storeName: settings.storeName,
  });
});
