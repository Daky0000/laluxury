import { NextResponse } from "next/server";
import { appDownloadUrl } from "@/lib/app-release";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.redirect(appDownloadUrl(), {
    status: 307,
    headers: { "Cache-Control": "no-store" },
  });
}

export const HEAD = GET;
