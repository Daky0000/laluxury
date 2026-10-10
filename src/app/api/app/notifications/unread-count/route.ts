import { requireBearerUser, withApiAuth, apiOptionsResponse } from "@/lib/auth/bearer";
import { unreadCount } from "@/lib/notifications/inbox";

export const dynamic = "force-dynamic";
export const OPTIONS = apiOptionsResponse;
export const GET = withApiAuth(async () => {
  const user = await requireBearerUser();
  return Response.json({ count: await unreadCount(user.id) }, { headers: { "Cache-Control": "private, no-store" } });
});
