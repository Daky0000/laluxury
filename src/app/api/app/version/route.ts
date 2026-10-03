import { NextResponse } from "next/server";
import { appDownloadUrl } from "@/lib/app-release";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  let releaseUrl: string;
  try {
    releaseUrl = appDownloadUrl();
  } catch {
    return NextResponse.json({ error: "The app release is temporarily unavailable." }, {
      status: 503, headers: { "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" },
    });
  }
  return NextResponse.json(
    {
      latestVersion: "1.2.6",
      versionCode: 8,
      appName: "Nobel Enclave Atelier & Living",
      downloadUrl: releaseUrl,
      directUrl: releaseUrl,
      releaseNotes: "Nobel Enclave v1.2.6 release: New regal app launcher icon, high-reliability 3-stage SMS OTP retry with USSD (*928*01#) instant lookup fallback, and friction-free sign-in.",
      minSupportedVersion: "1.0.0",
      publishedAt: "2026-10-02T23:20:00.000Z",
    },
    {
      headers: {
        "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=3600",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    },
  );
}

