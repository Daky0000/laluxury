export const FALLBACK_APK_URL =
  "https://pub-1a69b11766fc4280aadbd18a8e923f34.r2.dev/downloads/NobleEnclave-v1.2.7.apk";

export const APP_BASE_RELEASE = {
  version: "1.2.7",
  versionCode: 9,
  appName: "Noble Enclave Atelier & Living",
  publishedAt: "2026-10-03T14:30:00.000Z",
  minSupportedVersion: "1.0.0",
  releaseNotes:
    "Noble Enclave v1.2.7 release: Official Noble Enclave branding, royal gold NE monogram & app launcher icon, status bar system notifications for updates, and cross-platform synchronization.",
};

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

export type AppReleaseInfo = {
  version: string;
  versionCode: number;
  appName: string;
  downloadUrl: string;
  fileName: string;
  releaseNotes: string;
  publishedAt: string;
  minSupportedVersion: string;
};

/**
 * Resolves current release info dynamically from the configured APK download URL
 * or falls back to the canonical APP_BASE_RELEASE metadata.
 */
export function getAppReleaseInfo(): AppReleaseInfo {
  const downloadUrl = appDownloadUrl();
  let fileName = "NobleEnclave-v1.2.7.apk";
  try {
    const u = new URL(downloadUrl);
    const parts = u.pathname.split("/");
    const last = parts[parts.length - 1];
    if (last && last.toLowerCase().endsWith(".apk")) {
      fileName = last;
    }
  } catch {
    // keep default
  }

  // Extract version from file name if pattern matches e.g. -v1.2.7.apk or -1.2.7.apk
  const versionMatch = fileName.match(/(?:v|-v)?(\d+\.\d+\.\d+)(?:[._-]apk|\.apk)?$/i);
  const version = versionMatch ? versionMatch[1] : APP_BASE_RELEASE.version;

  return {
    ...APP_BASE_RELEASE,
    version,
    downloadUrl,
    fileName,
  };
}
