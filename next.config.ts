import type { NextConfig } from "next";

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
  },

  // Without this Turbopack walks up to the home directory looking for a lockfile.
  turbopack: {
    root: __dirname,
  },

  // A single server action carries the whole upload, and the default cap is
  // 1 MB — less than one photo off a phone. The media library refuses anything
  // over 8 MB itself; the rest is multipart overhead.
  experimental: {
    serverActions: { bodySizeLimit: "12mb" },
  },

  images: {
    remotePatterns: [
      { protocol: "https", hostname: "res.cloudinary.com" },
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },
};

export default nextConfig;
