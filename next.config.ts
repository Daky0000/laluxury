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

  // The response headers every page carries. None of them changes what the
  // shop does; each closes a door a browser would otherwise leave open — being
  // framed by another site, sniffing a download into a script, sending the
  // full referring URL to third parties, or a page asking for the camera.
  // No Content-Security-Policy yet: Paystack and the image hosts the owner
  // pastes make a correct one a project of its own.
  async headers() {
    return [
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

  images: {
    // The owner pastes picture addresses into the admin, and they come from
    // wherever their photographer put them, so any https host is fair game —
    // the optimiser only ever fetches images, and refuses anything else.
    remotePatterns: [{ protocol: "https", hostname: "**" }],
    // Catalogue pictures never change behind their address: an edit uploads a
    // new asset with a new id. So the optimised copies are worth keeping for a
    // month rather than re-encoding them every hour.
    minimumCacheTTL: 2678400,
  },
};

export default nextConfig;
