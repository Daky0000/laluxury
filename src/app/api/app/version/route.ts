import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    latestVersion: "1.2.0",
    versionCode: 2,
    appName: "LaLuxury Atelier & Living",
    downloadUrl: "https://pub-1a69b11766fc4280aadbd18a8e923f34.r2.dev/downloads/LaLuxury-Management.apk",
    directUrl: "/api/app/download",
    releaseNotes: "Full luxury storefront, customer cart & checkout with Paystack (GH₵), unified customer & store owner login, live dashboard.",
    minSupportedVersion: "1.0.0",
    publishedAt: new Date().toISOString(),
  });
}
