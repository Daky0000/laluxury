import { currentUser } from "@/lib/auth";
import { isStaff } from "@/lib/auth/rbac";
import { cartItemCount } from "@/lib/cart";
import { reconcilePendingPaymentsSoon } from "@/lib/checkout-payment";

/** Personal controls are loaded separately so public page HTML can be cached. */
export async function GET() {
  // Every page view asks for this, which makes it the shop's heartbeat: paid
  // orders whose confirmation never arrived are caught within minutes.
  reconcilePendingPaymentsSoon();

  const [user, count] = await Promise.all([currentUser(), cartItemCount()]);
  return Response.json({
    accountHref: user ? (isStaff(user.role) ? "/admin" : "/account") : "/login",
    signedIn: Boolean(user), count,
  }, { headers: { "Cache-Control": "private, no-store" } });
}
