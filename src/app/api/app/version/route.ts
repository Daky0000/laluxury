import { NextResponse } from "next/server";
import { appDownloadUrl } from "@/lib/app-release";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      latestVersion: "1.2.4",
      versionCode: 6,
      appName: "LaLuxury Atelier & Living",
      downloadUrl: appDownloadUrl(),
      directUrl: "/api/app/download",
      releaseNotes: "Swipeable product image carousel, Cloudflare CDN resolution for all catalog imagery, bulk order assistant with Evenly & Randomize distribution, user profile order details with official PDF receipt downloader & resend SMS/email, tap/close-to-dismiss update modal, and top status bar safe area clearance.",
      minSupportedVersion: "1.0.0",
      publishedAt: "2026-10-02T20:00:00.000Z",
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

