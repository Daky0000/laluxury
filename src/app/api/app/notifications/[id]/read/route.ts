import { requireBearerUser, withApiAuth, apiOptionsResponse } from "@/lib/auth/bearer";
import { markNotificationRead } from "@/lib/notifications/inbox";

export const OPTIONS = apiOptionsResponse;
export const PATCH = withApiAuth(async (_request: Request, context: { params: Promise<{ id: string }> }) => {
  const user = await requireBearerUser();
  const { id } = await context.params;
  const ok = await markNotificationRead(user.id, id);
  return Response.json(ok ? { ok: true } : { error: "Notification not found." }, {
    status: ok ? 200 : 404, headers: { "Cache-Control": "private, no-store" },
  });
});
