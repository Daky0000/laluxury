import { NextResponse } from "next/server";

export const storeHeaders = {
  "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=3600",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/** Cache only successful public responses; failures must never poison the CDN. */
export function storeResponse(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { ...storeHeaders, ...(status !== 200 ? { "Cache-Control": "no-store" } : {}) },
  });
}

export function storeOptions() {
  return new Response(null, { status: 204, headers: storeHeaders });
}
