import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(request: Request) {
  const productId = new URL(request.url).searchParams.get("productId");
  const headers = { "Cache-Control": "private, no-store" };
  if (!productId) return Response.json({ error: "Product ID is required." }, { status: 400, headers });
  const user = await currentUser();
  if (!user) return Response.json({ signedIn: false, isSaved: false, myReview: null }, { headers });
  const [saved, myReview] = await Promise.all([
    db.wishlistItem.findUnique({ where: { userId_productId: { userId: user.id, productId } }, select: { id: true } }),
    db.review.findFirst({ where: { userId: user.id, productId }, select: { rating: true, title: true, body: true, isApproved: true } }),
  ]);
  return Response.json({ signedIn: true, isSaved: Boolean(saved), myReview }, { headers });
}
