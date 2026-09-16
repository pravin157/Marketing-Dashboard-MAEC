/**
 * Shared in-memory cache for GSC responses (5-minute TTL).
 * Mirrors the Express server cache behavior.
 */

type CacheEntry = {
  timestamp: number;
  data: unknown;
};

const gscCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000;

export function getCachedData(key: string, forceRefresh?: boolean) {
  if (forceRefresh) return null;
  const cached = gscCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }
  return null;
}

export function setCachedData(key: string, data: unknown) {
  gscCache.set(key, {
    timestamp: Date.now(),
    data,
  });
}
