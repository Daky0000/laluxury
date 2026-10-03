import { NextResponse } from "next/server";
import { appDownloadUrl } from "@/lib/app-release";

export const dynamic = "force-dynamic";

export function GET() {
  try {
    return NextResponse.redirect(appDownloadUrl(), {
      status: 307, headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "The app release is temporarily unavailable." }, {
      status: 503, headers: { "Cache-Control": "no-store" },
    });
  }
}

export const HEAD = GET;
