import { db } from "@/lib/db";
import { hammingDistance } from "@/lib/bulk-ai/image-prep";

/**
 * Photo duplicate detection in layers: exact checksum (the media library
 * already collapses identical uploads to one asset), then perceptual hash.
 * Nothing is ever deleted automatically — duplicates are flagged for the
 * owner to Remove, Keep both, or Group as gallery.
 */

const SIMILAR_BITS = 5;
/** Above this many photos, only exact duplicates are checked (O(n²) otherwise). */
const MAX_PHASH_COMPARE = 6000;

export async function detectBatchDuplicates(batchId: string): Promise<{ exact: number; similar: number; existing: number }> {
  const media = await db.productImportMedia.findMany({
    where: { batchId },
    select: { id: true, mediaId: true, phash: true, duplicateKind: true },
    orderBy: { position: "asc" },
  });

  // Already on a live product?
  const used = new Set(
    (
      await db.productImage.findMany({
        where: { mediaId: { in: media.map((m) => m.mediaId) } },
        select: { mediaId: true },
      })
    ).map((r) => r.mediaId),
  );

  const updates: { id: string; kind: string; of: string | null }[] = [];
  // "KEPT" is the owner's decision on an earlier flag; never re-flag those.
  const kept = new Set(media.filter((m) => m.duplicateKind === "KEPT").map((m) => m.id));
  for (const m of media) if (!kept.has(m.id) && used.has(m.mediaId)) updates.push({ id: m.id, kind: "EXISTING_PRODUCT", of: null });

  let similar = 0;
  if (media.length <= MAX_PHASH_COMPARE) {
    const hashed = media.filter((m) => m.phash);
    for (let i = 0; i < hashed.length; i++) {
      if (kept.has(hashed[i].id) || updates.some((u) => u.id === hashed[i].id)) continue;
      for (let j = 0; j < i; j++) {
        if (hammingDistance(hashed[i].phash!, hashed[j].phash!) <= SIMILAR_BITS) {
          updates.push({ id: hashed[i].id, kind: "SIMILAR", of: hashed[j].id });
          similar++;
          break;
        }
      }
    }
  }

  await db.productImportMedia.updateMany({
    where: { batchId, duplicateKind: { in: ["SIMILAR", "EXISTING_PRODUCT", "EXACT"] } },
    data: { duplicateKind: null, duplicateOfId: null },
  });
  for (const u of updates) {
    await db.productImportMedia.update({ where: { id: u.id }, data: { duplicateKind: u.kind, duplicateOfId: u.of } });
  }
  return { exact: 0, similar, existing: updates.length - similar };
}
