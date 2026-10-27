/**
 * Resolve static, brand, and catalog assets directly from CDN in production,
 * eliminating origin container bandwidth and CPU image processing costs.
 */
export function publicAssetUrl(path: string | null | undefined): string {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://")) return path;

  const base = (
    process.env.NEXT_PUBLIC_MEDIA_BASE_URL ||
    process.env.CATALOG_CDN_URL ||
    process.env.R2_PUBLIC_URL ||
    ""
  ).replace(/\/+$/, "");

  if (!base) return path;

  // Catalog images, secondary image folder, and static brand identities
  if (
    path.startsWith("/catalog/") ||
    path.startsWith("/images/") ||
    path === "/emblem.png" ||
    path === "/emblem-white.png" ||
    path === "/logo.png" ||
    path === "/logo-transparent.png" ||
    path === "/icon.png" ||
    path === "/apple-touch-icon.png" ||
    path === "/favicon.ico"
  ) {
    return `${base}${path.startsWith("/") ? path : `/${path}`}`;
  }

  return path;
}
