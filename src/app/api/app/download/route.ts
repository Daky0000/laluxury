import { NextResponse } from "next/server";
import { appDownloadUrl } from "@/lib/app-release";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const file = searchParams.get("file");
  const baseCdn = (process.env.R2_PUBLIC_URL || "https://pub-1a69b11766fc4280aadbd18a8e923f34.r2.dev").replace(/\/$/, "");

  if (file && /^[a-zA-Z0-9_\-\.]+\.apk$/.test(file)) {
    return NextResponse.redirect(`${baseCdn}/downloads/${file}`, {
      status: 307,
      headers: { "Cache-Control": "public, max-age=3600" },
    });
  }

  return NextResponse.redirect(appDownloadUrl(), {
    status: 307,
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}

export const HEAD = GET;
