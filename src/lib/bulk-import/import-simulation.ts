import { db } from "@/lib/db";
import { FIELD_AUTHORITY_DEFAULTS, type FieldAuthority, type ItemDraft } from "./schema";
import { readSetup } from "./pipeline";

/**
 * "If you continue: …" — what an import would do, computed without writing.
 */
export type Simulation = {
  newProducts: number;
  updatedProducts: number;
  stockChanges: number;
  priceChanges: number;
  newImages: number;
  possibleDuplicates: number;
  blocked: number;
  needsReview: number;
};

export async function simulateImport(batchId: string): Promise<Simulation> {
  const batch = await db.productImportBatch.findUniqueOrThrow({ where: { id: batchId }, select: { setup: true } });
  const authority: FieldAuthority = { ...FIELD_AUTHORITY_DEFAULTS, ...((readSetup(batch.setup).fieldAuthority ?? {}) as Partial<FieldAuthority>) };

  const [byStatus, dupes, imagesForNew] = await Promise.all([
    db.productImportItem.groupBy({ by: ["status", "action"], where: { batchId }, _count: true }),
    db.productImportItem.count({ where: { batchId, issueCodes: { has: "POSSIBLE_DUPLICATE" } } }),
    db.$queryRaw<{ n: bigint | null }[]>`
      SELECT sum(jsonb_array_length(COALESCE(data->'draft'->'images', '[]'::jsonb))) AS n
        FROM "ProductImportItem" WHERE "batchId" = ${batchId} AND status = 'READY' AND action = 'CREATE'`,
  ]);
  const count = (status: string, action?: string) =>
    byStatus.filter((r) => r.status === status && (!action || r.action === action)).reduce((n, r) => n + r._count, 0);

  // Stock and price changes need the live values: walk the updates in pages.
  let stockChanges = 0;
  let priceChanges = 0;
  let newImages = Number(imagesForNew[0]?.n ?? 0);
  let cursor: string | undefined;
  for (;;) {
    const page = await db.productImportItem.findMany({
      where: { batchId, status: "READY", action: "UPDATE" },
      select: { id: true, data: true, matchProductId: true },
      orderBy: { id: "asc" },
      take: 200,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (!page.length) break;
    cursor = page[page.length - 1].id;
    const products = await db.product.findMany({
      where: { id: { in: page.map((p) => p.matchProductId!).filter(Boolean) } },
      select: {
        id: true,
        variants: { select: { sku: true, title: true, price: true, inventory: { select: { onHand: true } } } },
        images: { select: { mediaId: true, url: true } },
      },
    });
    const byId = new Map(products.map((p) => [p.id, p]));
    for (const item of page) {
      const draft = (item.data as { draft?: ItemDraft }).draft;
      const live = byId.get(item.matchProductId ?? "");
      if (!draft || !live) continue;
      for (const v of draft.variants.filter((x) => x.enabled)) {
        const lv = live.variants.find((x) => (v.sku && x.sku === v.sku) || x.title.toLowerCase() === v.key.toLowerCase());
        if (!lv) continue;
        if (authority.stock === "SOURCE" && v.stockSource === "SOURCE" && v.stock != null && v.stock !== lv.inventory?.onHand) stockChanges++;
        if (authority.price === "SOURCE" && v.price != null && v.price !== lv.price) priceChanges++;
      }
      if (authority.images !== "OWNER") {
        const have = new Set(live.images.map((i) => i.mediaId ?? i.url));
        newImages += draft.images.filter((i) => i.mediaId && !have.has(i.mediaId)).length;
      }
    }
  }

  return {
    newProducts: count("READY", "CREATE"),
    updatedProducts: count("READY", "UPDATE"),
    stockChanges,
    priceChanges,
    newImages,
    possibleDuplicates: dupes,
    blocked: count("BLOCKED"),
    needsReview: count("NEEDS_REVIEW"),
  };
}
