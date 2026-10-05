import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { can, currentUser, isStaff } from "@/lib/auth";

/**
 * Order pages (tracking, invoice, waybill) carry a name, phone number and
 * delivery address, so an order number alone is not enough to open them.
 * A viewer gets in by being the owner or staff, by typing the order email,
 * or by following a link that carries this token.
 */
export function orderAccessToken(orderNumber: string): string {
  return createHmac("sha256", env.authSecret())
    .update(`order-access:${orderNumber.toUpperCase()}`)
    .digest("base64url")
    .slice(0, 22);
}

function tokenMatches(orderNumber: string, token: string): boolean {
  const expected = Buffer.from(orderAccessToken(orderNumber));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export async function canViewOrder(
  order: { orderNumber: string; email: string; userId: string | null },
  proof: { token?: string | null; email?: string | null },
): Promise<boolean> {
  if (proof.token && tokenMatches(order.orderNumber, proof.token)) return true;
  if (proof.email && proof.email.trim().toLowerCase() === order.email.toLowerCase()) return true;

  const user = await currentUser();
  if (!user) return false;
  if (order.userId && order.userId === user.id) return true;
  return isStaff(user.role) && can(user.role, "orders:read");
}

/** A shareable path to an order page that opens without a sign-in. */
export function orderPath(
  orderNumber: string,
  page: "track" | "invoice" | "waybill",
): string {
  const t = orderAccessToken(orderNumber);
  if (page === "track") return `/orders/track?order=${encodeURIComponent(orderNumber)}&t=${t}`;
  const type = page === "waybill" ? "waybill" : "invoice";
  return `/orders/${encodeURIComponent(orderNumber)}/invoice?type=${type}&t=${t}`;
}
