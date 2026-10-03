/** Known bulk AI crawlers have no storefront shopping flow. Search engines remain allowed. */
export const BULK_CRAWLER_AGENTS = ["GPTBot", "PerplexityBot", "ClaudeBot", "Bytespider", "CCBot", "Amazonbot",
  "meta-externalagent", "SERankingBacklinksBot", "Reflectionbot"];

export function isBulkCrawler(userAgent: string): boolean {
  return BULK_CRAWLER_AGENTS.some((agent) => userAgent.toLowerCase().includes(agent.toLowerCase()));
}

/** Fixed windows keep proxy memory bounded, independently of action rate limits. */
export function createPublicTrafficLimiter(maxKeys = 10_000) {
  const windows = new Map<string, { count: number; expiresAt: number }>();
  let nextSweep = 0;
  return (key: string, now = Date.now(), limit = 120): boolean => {
    if (now >= nextSweep) {
      for (const [address, value] of windows) if (value.expiresAt <= now) windows.delete(address);
      nextSweep = now + 60_000;
    }
    const existing = windows.get(key);
    if (!existing || existing.expiresAt <= now) {
      if (!existing && windows.size >= maxKeys) return false;
      windows.set(key, { count: 1, expiresAt: now + 60_000 });
      return true;
    }
    if (existing.count >= limit) return false;
    existing.count++;
    return true;
  };
}
