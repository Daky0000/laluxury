import { NextResponse } from "next/server";
import { quickSearch } from "@/lib/catalog";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

type SearchCacheEntry = {
  results: Awaited<ReturnType<typeof quickSearch>>;
  expiresAt: number;
};

// In-memory cache for recent quick searches to eliminate repeated LIKE queries
const searchCache = new Map<string, SearchCacheEntry>();
const MAX_SEARCH_CACHE = 100;
const SEARCH_CACHE_TTL_MS = 60 * 1000; // 60 seconds

/** Type-ahead endpoint for the header search dialog. */
export async function GET(request: Request) {
  const term = (new URL(request.url).searchParams.get("q") ?? "").slice(0, 200);
  const cleanTerm = term.trim().toLowerCase();
  if (cleanTerm.length < 2) {
    return NextResponse.json(
      { results: [] },
      { headers: { "Cache-Control": "public, max-age=300" } },
    );
  }

  // Rate limit searches by client IP: 40 requests per minute
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = (forwarded ? forwarded.split(",")[0].trim() : request.headers.get("x-real-ip")) || "unknown";
  const limitCheck = rateLimit(`search:${ip}`, { limit: 40, windowMs: 60_000 });
  if (!limitCheck.ok) {
    return NextResponse.json(
      { error: "Too many search requests. Please slow down." },
      {
        status: 429,
        headers: {
          "Retry-After": String(limitCheck.retryAfterSeconds),
          "Cache-Control": "no-store",
        },
      },
    );
  }

  const now = Date.now();
  const cached = searchCache.get(cleanTerm);
  if (cached && cached.expiresAt > now) {
    return NextResponse.json(
      { results: cached.results },
      {
        headers: {
          "Cache-Control": "public, max-age=120, stale-while-revalidate=600",
        },
      },
    );
  }

  const results = await quickSearch(cleanTerm, 6);

  if (searchCache.size >= MAX_SEARCH_CACHE) {
    const oldestKey = searchCache.keys().next().value;
    if (oldestKey) searchCache.delete(oldestKey);
  }
  searchCache.set(cleanTerm, { results, expiresAt: now + SEARCH_CACHE_TTL_MS });

  return NextResponse.json(
    { results },
    {
      headers: {
        "Cache-Control": "public, max-age=120, stale-while-revalidate=600",
      },
    },
  );
}
