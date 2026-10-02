import { NextResponse } from "next/server";
import { appDownloadUrl } from "@/lib/app-release";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      latestVersion: "1.2.6",
      versionCode: 8,
      appName: "Nobel Enclave Atelier & Living",
      downloadUrl: appDownloadUrl(),
      directUrl: "/api/app/download",
      releaseNotes: "Nobel Enclave v1.2.6 release: New regal app launcher icon, high-reliability 3-stage SMS OTP retry with USSD (*928*01#) instant lookup fallback, and friction-free sign-in.",
      minSupportedVersion: "1.0.0",
      publishedAt: "2026-10-02T23:20:00.000Z",
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

