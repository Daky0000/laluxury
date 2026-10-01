import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      latestVersion: "1.2.2",
      versionCode: 3,
      appName: "LaLuxury Atelier & Living",
      downloadUrl: "https://pub-1a69b11766fc4280aadbd18a8e923f34.r2.dev/downloads/LaLuxury-Management.apk",
      directUrl: "/api/app/download",
      releaseNotes: "Unified business rules, real-time dynamic shipping calculation, server-side cart sync, and dynamic storefront settings.",
      minSupportedVersion: "1.0.0",
      publishedAt: "2026-10-01T19:09:00.000Z",
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

