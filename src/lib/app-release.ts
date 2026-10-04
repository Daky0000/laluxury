export const APP_BASE_RELEASE = {
  version: "1.3.4",
  versionCode: 16,
  appName: "Noble Enclave",
  publishedAt: "2026-10-04T15:15:00.000Z",
  minSupportedVersion: "1.0.0",
  releaseNotes:
    "Noble Enclave v1.3.4 release: Interactive MoMo direct payment prompts, responsive in-app order management, delivery fees & zones customization, and instant SMS receipts.",
};

export const FALLBACK_APK_URL =
  "https://pub-1a69b11766fc4280aadbd18a8e923f34.r2.dev/downloads/NobleEnclave-v1.3.4.apk";

/** Release metadata is compile-time data so server tracing stays bounded. */
export function resolveAppVersion(): { version: string; versionCode: number } {
  return {
    version: APP_BASE_RELEASE.version,
    versionCode: APP_BASE_RELEASE.versionCode,
  };
}

/**
 * Dynamic download URL. Resolves to the current versioned APK on the verified R2 CDN.
 * If an APK_DOWNLOAD_URL environment variable is provided, it is only accepted if it
 * matches the current version (preventing stale env vars from serving old APKs).
 */
export function appDownloadUrl(): string {
  const { version } = resolveAppVersion();
  const cdnBase = (
    process.env.R2_PUBLIC_URL ||
    process.env.NEXT_PUBLIC_MEDIA_BASE_URL ||
    "https://pub-1a69b11766fc4280aadbd18a8e923f34.r2.dev"
  ).replace(/\/+$/, "");

  const versionedUrl = `${cdnBase}/downloads/NobleEnclave-v${version}.apk`;

  const envUrl = process.env.APK_DOWNLOAD_URL;
  if (envUrl) {
    try {
      const u = new URL(envUrl);
      if (u.protocol === "https:" && !u.username && !u.password) {
        const match = u.pathname.match(/(?:v|-v)?(\d+\.\d+\.\d+)(?:[._-]apk|\.apk)?$/i);
        // Only accept the env var if it matches the current app version
        if (match && match[1] === version) {
          return u.toString();
        }
      }
    } catch {
      // ignore invalid URL
    }
  }

  return versionedUrl;
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

/** Returns complete release information from the compile-time release manifest. */
export function getAppReleaseInfo(): AppReleaseInfo {
  const { version, versionCode } = resolveAppVersion();
  const downloadUrl = appDownloadUrl();
  const fileName = `NobleEnclave-v${version}.apk`;

  return {
    ...APP_BASE_RELEASE,
    version,
    versionCode,
    downloadUrl,
    fileName,
  };
}
