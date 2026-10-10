import { requireBearerUser, withApiAuth, apiOptionsResponse } from "@/lib/auth/bearer";
import { markAllNotificationsRead } from "@/lib/notifications/inbox";

export const OPTIONS = apiOptionsResponse;
export const POST = withApiAuth(async () => {
  const user = await requireBearerUser();
  return Response.json({ ok: true, updated: await markAllNotificationsRead(user.id) }, {
    headers: { "Cache-Control": "private, no-store" },
  });
});
