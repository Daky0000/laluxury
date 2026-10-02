import { NextResponse } from "next/server";
import { appDownloadUrl } from "@/lib/app-release";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      latestVersion: "1.2.3",
      versionCode: 5,
      appName: "LaLuxury Atelier & Living",
      downloadUrl: appDownloadUrl(),
      directUrl: "/api/app/download",
      releaseNotes: "Keyboard auto-resize on modals, clean address placeholders, reordered checkout (delivery -> total -> payment), bulk add assistant, and phone navigation safe-area padding.",
      minSupportedVersion: "1.0.0",
      publishedAt: "2026-10-02T15:30:00.000Z",
    },
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    },
  );
}

