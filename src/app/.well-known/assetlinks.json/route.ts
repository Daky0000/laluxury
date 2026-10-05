import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Android App Links verification. Lets nobleenclave.com/product/* links open
 * the app directly. Set ANDROID_CERT_SHA256 to the app signing certificate
 * fingerprint(s) from `eas credentials` (comma-separated).
 */
export function GET() {
  const fingerprints = (process.env.ANDROID_CERT_SHA256 ?? "")
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);
  const body = fingerprints.length
    ? [
        {
          relation: ["delegate_permission/common.handle_all_urls"],
          target: {
            namespace: "android_app",
            package_name: "com.laluxury.management",
            sha256_cert_fingerprints: fingerprints,
          },
        },
      ]
    : [];
  return NextResponse.json(body, { headers: { "Cache-Control": "public, max-age=3600" } });
}
