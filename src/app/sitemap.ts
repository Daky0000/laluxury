import type { MetadataRoute } from "next";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

/**
 * Everything a search engine should find: the storefront pages, every room,
 * and every product that is on sale. Accounts, the bag, checkout and the
 * console are left out on purpose, and `robots.ts` says so too.
 *
 * Read from the database on each request rather than baked at build time, so a
 * product published from the console is in the sitemap the moment it goes live.
 */
export const revalidate = 86400;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = env.siteUrl();

  const [products, categories] = await Promise.all([
    db.product.findMany({
      where: { status: "ACTIVE" },
      select: { slug: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
    }),
    db.category.findMany({
      where: { isActive: true },
      select: { slug: true, updatedAt: true },
    }),
  ]);

  const fixed: MetadataRoute.Sitemap = [
    { url: base, lastModified: new Date(), changeFrequency: "daily", priority: 1 },
    { url: `${base}/shop`, lastModified: new Date(), changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/contact`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${base}/orders/track`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${base}/privacy`, changeFrequency: "yearly", priority: 0.1 },
    { url: `${base}/terms`, changeFrequency: "yearly", priority: 0.1 },
    { url: `${base}/cookies`, changeFrequency: "yearly", priority: 0.1 },
  ];

  return [
    ...fixed,
    ...categories.map((category) => ({
      url: `${base}/shop?category=${encodeURIComponent(category.slug)}`,
      lastModified: category.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
    ...products.map((product) => ({
      url: `${base}/product/${product.slug}`,
      lastModified: product.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ];
}
