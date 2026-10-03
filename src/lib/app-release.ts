import fs from "node:fs";
import path from "node:path";

export const APP_BASE_RELEASE = {
  version: "1.3.0",
  versionCode: 12,
  appName: "Noble Enclave",
  publishedAt: "2026-10-03T20:10:00.000Z",
  minSupportedVersion: "1.0.0",
  releaseNotes:
    "Noble Enclave v1.3.0 release: Adaptive multi-column responsive grid layout across catalog, storefront home, and product detail complementary pieces (1-col compact, 2-col mobile, 3-col tablet, 4-col wide), and instant bag dispatch.",
};

export const FALLBACK_APK_URL =
  "https://pub-1a69b11766fc4280aadbd18a8e923f34.r2.dev/downloads/NobleEnclave-v1.3.0.apk";

/**
 * Resolves the latest version and build number directly from mobile/app.json,
 * ensuring the download link always matches the newest built version automatically.
 */
export function resolveAppVersion(): { version: string; versionCode: number } {
  try {
    const candidates = [
      path.join(process.cwd(), "mobile", "app.json"),
      path.join(process.cwd(), "..", "mobile", "app.json"),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, "utf-8");
        const json = JSON.parse(raw);
        if (json?.expo?.version) {
          const version = String(json.expo.version);
          const versionCode = Number(json.expo?.android?.versionCode) || APP_BASE_RELEASE.versionCode;
          return { version, versionCode };
        }
      }
    }
  } catch {
    // fallback if file cannot be read
  }

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

/**
 * Returns complete release info dynamically aligned with the latest app version.
 */
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
