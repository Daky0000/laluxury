import { requireBearerUser, withApiAuth, apiOptionsResponse } from "@/lib/auth/bearer";
import { listNotifications } from "@/lib/notifications/inbox";

export const dynamic = "force-dynamic";
export const OPTIONS = apiOptionsResponse;
export const GET = withApiAuth(async (request: Request) => {
  const user = await requireBearerUser();
  const query = new URL(request.url).searchParams;
  return Response.json(await listNotifications(user.id, query.get("before") || undefined, Number(query.get("limit")) || 20), {
    headers: { "Cache-Control": "private, no-store" },
  });
});
