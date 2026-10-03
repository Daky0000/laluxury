import { NextResponse, type NextRequest } from "next/server";
import { createPublicTrafficLimiter, isBulkCrawler } from "@/lib/public-traffic";

const allowRead = createPublicTrafficLimiter();

/** Reject expensive bulk reads before catalog rendering or database access. */
export function proxy(request: NextRequest) {
  if (request.method !== "GET" && request.method !== "HEAD") return NextResponse.next();
  if (process.env.BULK_CRAWLER_BLOCK_ENABLED !== "false" && isBulkCrawler(request.headers.get("user-agent") ?? "")) {
    return new NextResponse("Crawling disabled.", { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  // Railway supplies the forwarded address. This is per instance and resets on
  // restart; Cloudflare WAF should enforce distributed limits at the edge.
  const address = (request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip") || "unknown").slice(0, 100);
  if (!allowRead(address)) {
    return new NextResponse("Too many requests.", { status: 429, headers: {
      "Cache-Control": "no-store", "Retry-After": "60",
    } });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/shop/:path*", "/search/:path*", "/product/:path*", "/category/:path*",
    "/collection/:path*", "/api/store/products/:path*", "/api/search"],
};
