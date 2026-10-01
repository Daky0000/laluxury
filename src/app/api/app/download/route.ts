import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET() {
  const localApk = path.join(process.cwd(), "LaLuxury-Management.apk");
  if (fs.existsSync(localApk)) {
    const stat = fs.statSync(localApk);
    const fileBuffer = fs.readFileSync(localApk);
    return new Response(fileBuffer, {
      headers: {
        "Content-Type": "application/vnd.android.package-archive",
        "Content-Length": stat.size.toString(),
        "Content-Disposition": 'attachment; filename="LaLuxury-Management.apk"',
        "Cache-Control": "public, max-age=3600",
      },
    });
  }
  return NextResponse.redirect(
    "https://pub-1a69b11766fc4280aadbd18a8e923f34.r2.dev/downloads/LaLuxury-Management.apk"
  );
}
