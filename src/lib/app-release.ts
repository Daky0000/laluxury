/** Shared server-side destination. Prefer a versioned R2 object in production. */
export function appDownloadUrl(): string {
  const raw = process.env.APK_DOWNLOAD_URL;
  if (!raw) throw new Error("APK_DOWNLOAD_URL is required to download the app.");
  const url = new URL(raw);
  if (url.protocol !== "https:") throw new Error("APK_DOWNLOAD_URL must use HTTPS.");
  // An explicit R2 development URL avoids Railway egress during DNS cutover.
  // Prefer a custom media domain for production caching and higher rate limits.
  if (url.username || url.password || !url.pathname.endsWith(".apk")) {
    throw new Error("APK_DOWNLOAD_URL must point to an APK without URL credentials.");
  }
  return url.toString();
}
