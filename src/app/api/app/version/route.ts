import { NextResponse } from "next/server";
import { appDownloadUrl } from "@/lib/app-release";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      latestVersion: "1.2.5",
      versionCode: 7,
      appName: "Noble Enclave Atelier & Living",
      downloadUrl: appDownloadUrl(),
      directUrl: "/api/app/download",
      releaseNotes: "Noble Enclave official release: SMS OTP phone login/registration with automatic SMS detection, clean production launch, and refined brand aesthetic.",
      minSupportedVersion: "1.0.0",
      publishedAt: "2026-10-02T21:00:00.000Z",
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

