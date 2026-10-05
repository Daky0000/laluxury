import { NextResponse } from "next/server";
import { z } from "zod";
import { apiOptionsResponse, requireBearerUser, withApiAuth } from "@/lib/auth/bearer";
import { listWishlist, toggleWishlist } from "@/lib/wishlist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = apiOptionsResponse;

/** GET /api/app/wishlist - the signed-in customer's saved pieces. */
export const GET = withApiAuth(async () => {
  const user = await requireBearerUser();
  const items = await listWishlist(user.id);
  return NextResponse.json({ ok: true, items, productIds: items.map((i) => i.productId) });
});

/** POST /api/app/wishlist { productId } - saves or un-saves a piece. Same list as the web. */
export const POST = withApiAuth(async (request: Request) => {
  const user = await requireBearerUser();
  const parsed = z
    .object({ productId: z.string().trim().min(1).max(64) })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Product is required." }, { status: 400 });
  }
  try {
    const { saved } = await toggleWishlist(user.id, parsed.data.productId);
    return NextResponse.json({ ok: true, saved });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Could not save." },
      { status: 400 },
    );
  }
});
