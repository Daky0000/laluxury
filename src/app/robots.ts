import type { MetadataRoute } from "next";
import { env } from "@/lib/env";
import { BULK_CRAWLER_AGENTS } from "@/lib/public-traffic";

/**
 * What crawlers may index. The storefront is open; anything personal, in
 * progress or behind a sign-in is not — an indexed checkout or account page is
 * a page that turns up in search results with somebody's name on it.
 */
export default function robots(): MetadataRoute.Robots {
  const base = env.siteUrl();

  return {
    rules: [{
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
        "/downloads/",
        "/*.apk$",
        "/shop?",
        "/search?",
      ],
    }, { userAgent: BULK_CRAWLER_AGENTS, disallow: "/" }],
    sitemap: `${base}/sitemap.xml`,
  };
}
