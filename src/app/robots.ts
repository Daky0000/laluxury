import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

/**
 * What crawlers may index. The storefront is open; anything personal, in
 * progress or behind a sign-in is not — an indexed checkout or account page is
 * a page that turns up in search results with somebody's name on it.
 */
export default function robots(): MetadataRoute.Robots {
  const base = env.siteUrl();

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin",
        "/account",
        "/cart",
        "/checkout",
        "/login",
        "/register",
        "/forgot-password",
        "/reset-password",
        "/api/",
      ],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
