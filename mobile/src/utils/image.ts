/**
 * Universal Image URL Resolver for Nobel Enclave Mobile App
 * Resolves relative catalog paths, Cloudflare R2 paths, and API media URLs
 * into fully qualified HTTPS URLs that load reliably in React Native.
 */

const CLOUDFLARE_R2_PUBLIC_URL = "https://pub-1a69b11766fc4280aadbd18a8e923f34.r2.dev";
const DEFAULT_STORE_URL = "https://nobleenclave.com";

export function resolveImageUrl(
  url?: string | null,
  baseUrl: string = DEFAULT_STORE_URL
): string | null {
  if (!url) return null;
  const clean = url.trim();
  if (!clean) return null;

  // Already fully qualified remote URL
  if (clean.startsWith("http://") || clean.startsWith("https://")) {
    return clean;
  }

  // Catalog images are hosted on Cloudflare R2 CDN
  if (clean.startsWith("/catalog/")) {
    return `${CLOUDFLARE_R2_PUBLIC_URL}${clean}`;
  }

  // Media library or other relative backend paths
  if (clean.startsWith("/")) {
    const cleanBase = (baseUrl || DEFAULT_STORE_URL).replace(/\/+$/, "");
    return `${cleanBase}${clean}`;
  }

  return clean;
}
