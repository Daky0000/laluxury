import { db } from "@/lib/db";

/**
 * Saved pieces ("the heart"), shared by the web and the app. One list per
 * account, so a piece saved on the phone is waiting on the website too.
 */

export async function toggleWishlist(
  userId: string,
  productId: string,
): Promise<{ saved: boolean }> {
  const existing = await db.wishlistItem.findUnique({
    where: { userId_productId: { userId, productId } },
  });
  if (existing) {
    await db.wishlistItem.delete({ where: { id: existing.id } });
    return { saved: false };
  }
  const product = await db.product.findFirst({
    where: { id: productId, status: "ACTIVE" },
    select: { id: true },
  });
  if (!product) throw new Error("That product is no longer on sale.");
  await db.wishlistItem.upsert({
    where: { userId_productId: { userId, productId } },
    create: { userId, productId },
    update: {},
  });
  return { saved: true };
}

/** The account's saved pieces that are still on sale, newest first. */
export async function listWishlist(userId: string) {
  const items = await db.wishlistItem.findMany({
    where: { userId, product: { status: "ACTIVE" } },
    orderBy: { createdAt: "desc" },
    include: {
      product: {
        select: {
          id: true,
          slug: true,
          title: true,
          brand: true,
          isPreorder: true,
          images: { take: 1, orderBy: { position: "asc" }, select: { url: true, alt: true } },
          variants: {
            where: { isActive: true },
            orderBy: { position: "asc" },
            take: 1,
            select: { id: true, price: true, compareAtPrice: true },
          },
        },
      },
    },
  });
  return items.map((item) => ({
    productId: item.product.id,
    slug: item.product.slug,
    title: item.product.title,
    brand: item.product.brand,
    isPreorder: item.product.isPreorder,
    imageUrl: item.product.images[0]?.url ?? null,
    price: item.product.variants[0]?.price ?? null,
    compareAtPrice: item.product.variants[0]?.compareAtPrice ?? null,
    variantId: item.product.variants[0]?.id ?? null,
    savedAt: item.createdAt.toISOString(),
  }));
}
