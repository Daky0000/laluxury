import { NextResponse } from "next/server";
import { appDownloadUrl } from "@/lib/app-release";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  let releaseUrl = "https://nobleenclave.com/app";
  try {
    releaseUrl = appDownloadUrl();
  } catch {
    // keep fallback
  }
  return NextResponse.json(
    {
      latestVersion: "1.2.7",
      versionCode: 9,
      appName: "Noble Enclave Atelier & Living",
      downloadUrl: releaseUrl,
      directUrl: releaseUrl,
      releaseNotes: "Noble Enclave v1.2.7 release: Official Noble Enclave branding, royal gold NE monogram & app launcher icon, status bar system notifications for updates, and cross-platform synchronization.",
      minSupportedVersion: "1.0.0",
      publishedAt: "2026-10-03T14:30:00.000Z",
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

