/** Resolve catalog assets directly, while retaining local development assets. */
export function publicAssetUrl(path: string): string {
  const base = (process.env.NEXT_PUBLIC_MEDIA_BASE_URL || process.env.CATALOG_CDN_URL || process.env.R2_PUBLIC_URL || "").replace(/\/+$/, "");
  return base && path.startsWith("/catalog/") ? `${base}${path}` : path;
}
