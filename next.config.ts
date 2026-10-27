import { createHash } from "node:crypto";
import type { NextConfig } from "next";

// Ensure Server Actions closure encryption keys stay consistent across rebuilds and deployments,
// preventing E1442 / E974 deployment skew crashes when users submit forms after a new release.
if (!process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY && process.env.AUTH_SECRET) {
  process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY = createHash("sha256")
    .update(process.env.AUTH_SECRET)
    .digest("base64");
}

const nextConfig: NextConfig = {
  // The Postgres driver and Prisma engine are Node-only; keep them out of the
  // bundler so `pg` never tries to resolve `util/types` for the browser.
  serverExternalPackages: ["pg", "@prisma/adapter-pg", "@prisma/client"],

  // Baked in at build time and served from /api/health, so there is one value
  // that changes on every build and can be read without authenticating. Railway
  // supplies the commit only for builds it pulls from GitHub; a `railway up`
  // deploy has no commit, hence the timestamp fallback.
  env: {
    BUILD_STAMP: process.env.RAILWAY_GIT_COMMIT_SHA ?? new Date().toISOString(),
    NEXT_PUBLIC_MEDIA_BASE_URL: (
      process.env.CATALOG_CDN_URL ||
      process.env.R2_PUBLIC_URL ||
      process.env.NEXT_PUBLIC_MEDIA_BASE_URL ||
      ""
    ).replace(/\/+$/, ""),
  },

  // Without this Turbopack walks up to the home directory looking for a lockfile.
  turbopack: {
    root: __dirname,
  },

  allowedDevOrigins: [
    "192.168.3.225",
    "192.168.3.225:3005",
    "10.0.2.2",
    "10.0.2.2:3005",
    "localhost:3005",
  ],

  // A single server action carries the whole upload, and the default cap is
  // 1 MB — less than one photo off a phone. The media library refuses anything
  // over 8 MB itself; the rest is multipart overhead.
  experimental: {
    // Railway's shared cache has contained missing Turbopack SST files.
    // Compile cleanly rather than restoring an invalid persistent build cache.
    turbopackFileSystemCacheForBuild: false,
    serverActions: { bodySizeLimit: "24mb" },
  },

  async redirects() {
    const cdnUrl = (process.env.CATALOG_CDN_URL || process.env.R2_PUBLIC_URL || "").replace(/\/+$/, "");
    return [
      ...(cdnUrl
        ? [
            { source: "/catalog/:path*", destination: `${cdnUrl}/catalog/:path*`, permanent: true },
            { source: "/images/:path*", destination: `${cdnUrl}/images/:path*`, permanent: true },
            { source: "/emblem.png", destination: `${cdnUrl}/emblem.png`, permanent: true },
            { source: "/emblem-white.png", destination: `${cdnUrl}/emblem-white.png`, permanent: true },
            { source: "/logo.png", destination: `${cdnUrl}/logo.png`, permanent: true },
            { source: "/logo-transparent.png", destination: `${cdnUrl}/logo-transparent.png`, permanent: true },
            { source: "/icon.png", destination: `${cdnUrl}/icon.png`, permanent: true },
          ]
        : []),
      ...["/downloads/:file(.*\\.apk)", "/NobleEnclave-Management.apk", "/Noble-Enclave.apk", "/NobelEnclave-Management.apk", "/download", "/app/download"].map((source) => ({
        source, destination: "/api/app/download", permanent: false,
      })),
    ];
  },

  // The response headers every page carries. None of them changes what the
  // shop does; each closes a door a browser would otherwise leave open.
  async headers() {
    return [
      {
        source: "/catalog/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        source: "/images/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        source: "/:file(.*\\.(?:png|jpg|jpeg|webp|svg|ico|woff2?))",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        source: "/api/app/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store" },
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET, POST, PATCH, DELETE, OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization" },
        ],
      },
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          // Two years, honoured only over HTTPS, so localhost is unaffected.
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
    ];
  },

  compress: true,
  poweredByHeader: false,

  images: {
    // Disables on-the-fly Sharp/WASM image re-encoding on the container CPU.
    // Catalog images are already pre-optimized WebP assets, and media library
    // uploads are compressed on save and served with 1-year immutable caching.
    // Disabling on-the-fly re-encoding slashes Railway vCPU usage and eliminates
    // out-of-memory container crashes caused by image buffer allocation.
    unoptimized: true,
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
};

export default nextConfig;
