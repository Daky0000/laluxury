import { db } from "@/lib/db";
import { can, isStaff, type Permission } from "@/lib/auth/rbac";
import type { Role } from "@/generated/prisma";

/**
 * Push notifications to the mobile app through Expo's push service.
 *
 * Push is a courtesy on top of SMS and email, never the only channel, so every
 * failure here is logged and swallowed. Tokens Expo reports as gone are
 * switched off so they are not tried again.
 */

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const BATCH = 100;

export type PushMessage = {
  title: string;
  body: string;
  /** Read by the app to open the right screen, e.g. { type: "order", orderNumber }. */
  data?: Record<string, string | number | boolean | null>;
};

type ExpoTicket = { status: "ok" | "error"; details?: { error?: string } };

export function isExpoPushToken(token: string): boolean {
  return /^Expo(nent)?PushToken\[[^\]]+\]$/.test(token);
}

async function sendToTokens(tokens: string[], message: PushMessage): Promise<number> {
  let delivered = 0;
  for (let i = 0; i < tokens.length; i += BATCH) {
    const chunk = tokens.slice(i, i + BATCH);
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(
          chunk.map((to) => ({
            to,
            title: message.title,
            body: message.body,
            data: message.data ?? {},
            sound: "default",
            channelId: "noble_updates",
            priority: "high",
          })),
        ),
        signal: AbortSignal.timeout(10_000),
      });
      const json = (await res.json().catch(() => null)) as { data?: ExpoTicket[] } | null;
      const tickets = json?.data ?? [];
      const gone: string[] = [];
      tickets.forEach((ticket, idx) => {
        if (ticket.status === "ok") delivered += 1;
        else if (ticket.details?.error === "DeviceNotRegistered") gone.push(chunk[idx]);
      });
      if (gone.length > 0) {
        await db.pushDevice.updateMany({ where: { token: { in: gone } }, data: { isActive: false } });
      }
    } catch (error) {
      console.error("[push] send failed", error);
    }
  }
  return delivered;
}

/** Pushes to every active device of one account. */
export async function pushToUser(userId: string, message: PushMessage): Promise<number> {
  const devices = await db.pushDevice.findMany({
    where: { userId, isActive: true },
    select: { token: true },
  });
  if (devices.length === 0) return 0;
  return sendToTokens(devices.map((d) => d.token), message);
}

/** Pushes to every active staff device whose role holds `permission`. */
export async function pushToStaff(permission: Permission, message: PushMessage): Promise<number> {
  const devices = await db.pushDevice.findMany({
    where: { isActive: true, user: { isActive: true, role: { not: "CUSTOMER" } } },
    select: { token: true, user: { select: { role: true } } },
  });
  const tokens = devices
    .filter((d) => d.user && isStaff(d.user.role as Role) && can(d.user.role as Role, permission))
    .map((d) => d.token);
  if (tokens.length === 0) return 0;
  return sendToTokens(tokens, message);
}

/** Registers (or re-assigns) a device token to whoever is signed in on it. */
export async function registerPushDevice(args: {
  token: string;
  userId: string | null;
  platform: string;
  appVersion?: string | null;
}): Promise<void> {
  await db.pushDevice.upsert({
    where: { token: args.token },
    create: {
      token: args.token,
      userId: args.userId,
      platform: args.platform,
      appVersion: args.appVersion ?? null,
    },
    update: {
      userId: args.userId,
      platform: args.platform,
      appVersion: args.appVersion ?? null,
      isActive: true,
      lastSeenAt: new Date(),
    },
  });
}
