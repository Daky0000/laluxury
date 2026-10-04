/**
 * Returns true only if `latest` is strictly newer than `current`.
 * e.g. isNewerVersion("1.3.3", "1.3.4") === true
 *      isNewerVersion("1.3.3", "1.3.3") === false
 *      isNewerVersion("1.3.4", "1.3.3") === false
 */
export function isNewerVersion(current: string, latest: string): boolean {
  if (!latest || !current) return false;
  if (latest === current) return false;

  const currentParts = current.split(".").map((p) => parseInt(p, 10) || 0);
  const latestParts = latest.split(".").map((p) => parseInt(p, 10) || 0);

  const len = Math.max(currentParts.length, latestParts.length);
  for (let i = 0; i < len; i++) {
    const c = currentParts[i] || 0;
    const l = latestParts[i] || 0;
    if (l > c) return true;
    if (l < c) return false;
  }
  return false;
}
