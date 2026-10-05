/**
 * Deterministic photo grouping and matching. AI only suggests when these
 * rules have no answer, and the owner confirms.
 */

/** "rug-01-a.jpg", "rug-01 (2).jpg", "RUG_01_back.JPG" → "rug-01" */
export function filenameStem(filename: string): string {
  const base = filename.replace(/\.[a-z0-9]+$/i, "").toLowerCase();
  // "(2)" is the copy counter — the only suffix to drop when present.
  const counted = base.replace(/\s*\(\d+\)$/, "");
  const stem = counted !== base ? counted : base.replace(/[\s_-](?:[a-z]|\d{1,2}|front|back|side|detail|alt|main|closeup|close-up)$/i, "");
  return stem.replace(/[\s_]+/g, "-").replace(/-+$/, "");
}

export function normKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Matches a photo to a spreadsheet item by filename: the mapped image file
 * name, or a SKU / external key / parent code contained in the filename.
 */
export function matchPhotoToRow(
  filename: string,
  candidates: { itemId: string; imageFiles: string[]; keys: string[] }[],
): string | null {
  const name = filename.toLowerCase();
  const bare = normKey(name.replace(/\.[a-z0-9]+$/i, ""));
  for (const c of candidates) {
    if (c.imageFiles.some((f) => f.toLowerCase() === name || normKey(f.replace(/\.[a-z0-9]+$/i, "")) === bare)) {
      return c.itemId;
    }
  }
  // Longest key first, so "DUB-93852" wins over "DUB-9".
  const keyed = candidates
    .flatMap((c) => c.keys.map((k) => ({ itemId: c.itemId, key: normKey(k) })))
    .filter((k) => k.key.length >= 3)
    .sort((a, b) => b.key.length - a.key.length);
  return keyed.find((k) => bare.includes(k.key))?.itemId ?? null;
}

/** "curtain-black.jpg" with values [Black, Wine] → "Black". Ambiguity → null. */
export function matchFilenameToOptionValue(filename: string, values: string[]): string | null {
  const bare = normKey(filename.replace(/\.[a-z0-9]+$/i, ""));
  const hits = values.filter((v) => normKey(v).length >= 2 && bare.includes(normKey(v)));
  if (hits.length === 1) return hits[0];
  // "Black and White" vs "Black": prefer the longest when one contains the others.
  const longest = hits.sort((a, b) => b.length - a.length)[0];
  return longest && hits.every((h) => normKey(longest).includes(normKey(h))) ? longest : null;
}
