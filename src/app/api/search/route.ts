import { NextResponse } from "next/server";
import { quickSearch } from "@/lib/catalog";

export const runtime = "nodejs";

/** Type-ahead endpoint for the header search dialog. */
export async function GET(request: Request) {
  const term = new URL(request.url).searchParams.get("q") ?? "";
  if (term.trim().length < 2) return NextResponse.json({ results: [] });

  const results = await quickSearch(term, 6);
  return NextResponse.json({ results });
}
