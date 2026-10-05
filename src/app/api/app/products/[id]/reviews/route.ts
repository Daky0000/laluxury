import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import {
  apiOptionsResponse,
  getOptionalBearerUser,
  requireBearerUser,
  withApiAuth,
} from "@/lib/auth/bearer";
import { productReviews, reviewSchema, submitReview } from "@/lib/reviews";
import { rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = apiOptionsResponse;

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/app/products/[id]/reviews - approved reviews, plus the caller's own (any status). */
export const GET = withApiAuth(async (_request: Request, context?: Ctx) => {
  const id = (await context?.params)?.id;
  if (!id) return NextResponse.json({ ok: false, error: "Product is required." }, { status: 400 });
  const user = await getOptionalBearerUser();
  const [data, mine] = await Promise.all([
    productReviews(id),
    user
      ? db.review.findFirst({
          where: { productId: id, userId: user.id },
          select: { rating: true, title: true, body: true, isApproved: true },
        })
      : null,
  ]);
  return NextResponse.json({
    ok: true,
    average: data.average,
    count: data.count,
    reviews: data.reviews.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
    mine,
  });
});

/** POST /api/app/products/[id]/reviews - write or replace the caller's review (moderated). */
export const POST = withApiAuth(async (request: Request, context?: Ctx) => {
  const user = await requireBearerUser();
  const limited = rateLimitResponse([
    { key: `app-review:${user.id}`, limit: 10, windowMs: 60 * 60 * 1000 },
  ]);
  if (limited) return limited;

  const id = (await context?.params)?.id;
  if (!id) return NextResponse.json({ ok: false, error: "Product is required." }, { status: 400 });
  const parsed = reviewSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message }, { status: 400 });
  }
  const result = await submitReview(user, id, parsed.data);
  if (!result.ok) return NextResponse.json({ ok: false, error: result.message }, { status: 400 });
  try {
    revalidatePath(`/product/${result.slug}`);
    revalidatePath("/admin/reviews");
  } catch {
    // Outside a render context; the page refreshes on its own cache cycle.
  }
  return NextResponse.json({
    ok: true,
    message: result.updated
      ? "Your review has been updated and will show again once it has been checked."
      : "Thank you. Your review will appear once it has been checked.",
  });
});
