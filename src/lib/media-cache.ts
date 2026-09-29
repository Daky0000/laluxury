export type MediaMeta = {
  id: string;
  source: string;
  mimeType: string;
  url: string | null;
  updatedAt: Date;
};

// Bounded in-memory metadata cache to eliminate redundant Postgres lookups on ETag validation
const metaCache = new Map<string, MediaMeta>();
const MAX_META_CACHE = 1000;

export function getCachedMediaMeta(id: string): MediaMeta | undefined {
  return metaCache.get(id);
}

export function setCachedMediaMeta(id: string, meta: MediaMeta): void {
  if (metaCache.size >= MAX_META_CACHE) {
    const oldestKey = metaCache.keys().next().value;
    if (oldestKey) metaCache.delete(oldestKey);
  }
  metaCache.set(id, meta);
}

export function invalidateMediaMetaCache(id: string): void {
  metaCache.delete(id);
}
