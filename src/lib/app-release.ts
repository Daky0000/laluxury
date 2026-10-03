const FALLBACK_APK_URL =
  "https://pub-1a69b11766fc4280aadbd18a8e923f34.r2.dev/downloads/NobleEnclave-v1.2.7.apk";

/** Shared server-side destination. Prefer a versioned R2 object in production. */
export function appDownloadUrl(): string {
  const raw = process.env.APK_DOWNLOAD_URL || FALLBACK_APK_URL;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return FALLBACK_APK_URL;
    if (url.username || url.password) {
      return FALLBACK_APK_URL;
    }
    return url.toString();
  } catch {
    return FALLBACK_APK_URL;
  }
}
