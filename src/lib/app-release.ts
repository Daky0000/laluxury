/** Shared server-side destination. Prefer a versioned R2 object in production. */
export function appDownloadUrl(): string {
  const url = new URL(process.env.APK_DOWNLOAD_URL || "https://pub-1a69b11766fc4280aadbd18a8e923f34.r2.dev/downloads/LaLuxury-Management.apk");
  if (url.protocol !== "https:") throw new Error("APK_DOWNLOAD_URL must use HTTPS.");
  return url.toString();
}
