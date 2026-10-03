import { NextResponse } from "next/server";
import { getAppReleaseInfo } from "@/lib/app-release";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const release = getAppReleaseInfo();
  return NextResponse.json(
    {
      latestVersion: release.version, // latestVersion: "1.2.7"
      versionCode: release.versionCode,
      appName: release.appName,
      downloadUrl: release.downloadUrl,
      directUrl: release.downloadUrl,
      releaseNotes: release.releaseNotes,
      minSupportedVersion: release.minSupportedVersion,
      publishedAt: release.publishedAt,
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
