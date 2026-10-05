import { db } from "@/lib/db";
import type { ItemDraft } from "./schema";

/**
 * Finds the live product an inbox item refers to, strongest evidence first:
 *
 *   1 source + external key   2 exact SKU   3 parent/style code
 *   4 barcode                 5 exact title (suggestion only)
 *
 * Only 1–4 may turn an item into an update. A title match is a "possible
 * duplicate" for the owner to decide; similarity alone never overwrites a
 * live product.
 */

export type MatchResult = {
  productId: string | null;
  method: "SOURCE_KEY" | "SKU" | "PARENT_SKU" | "BARCODE" | "TITLE" | null;
  /** True when the evidence is strong enough to update without asking. */
  confident: boolean;
};

const NONE: MatchResult = { productId: null, method: null, confident: false };

export async function matchExisting(args: {
  sourceId: string | null;
  externalKey: string | null;
  draft: ItemDraft;
  hasSourceSkus: boolean;
}): Promise<MatchResult> {
  const { draft } = args;

  if (args.sourceId && args.externalKey) {
    const link = await db.catalogSourceProduct.findUnique({
      where: { sourceId_externalKey: { sourceId: args.sourceId, externalKey: args.externalKey } },
      select: { productId: true },
    });
    if (link?.productId && (await exists(link.productId))) {
      return { productId: link.productId, method: "SOURCE_KEY", confident: true };
    }
  }

  // Generated SKUs say nothing about identity; only supplier SKUs count.
  if (args.hasSourceSkus) {
    const skus = draft.variants.map((v) => v.sku).filter((s): s is string => Boolean(s));
    if (skus.length) {
      const hit = await db.variant.findFirst({ where: { sku: { in: skus } }, select: { productId: true } });
      if (hit) return { productId: hit.productId, method: "SKU", confident: true };
    }
  }

  const parent = draft.parentSku?.source === "SOURCE" ? draft.parentSku.value : null;
  if (parent) {
    const hit = await db.variant.findFirst({
      where: { OR: [{ sku: parent }, { sku: { startsWith: `${parent}-` } }] },
      select: { productId: true },
    });
    if (hit) return { productId: hit.productId, method: "PARENT_SKU", confident: true };
  }

  const barcodes = draft.variants.map((v) => v.barcode).filter((b): b is string => Boolean(b));
  if (barcodes.length) {
    const hit = await db.variant.findFirst({ where: { barcode: { in: barcodes } }, select: { productId: true } });
    if (hit) return { productId: hit.productId, method: "BARCODE", confident: true };
  }

  const title = draft.title?.value?.trim();
  if (title) {
    const hit = await db.product.findFirst({
      where: { title: { equals: title, mode: "insensitive" }, status: { not: "ARCHIVED" } },
      select: { id: true },
    });
    if (hit) return { productId: hit.id, method: "TITLE", confident: false };
  }

  return NONE;
}

async function exists(id: string): Promise<boolean> {
  return Boolean(await db.product.findUnique({ where: { id }, select: { id: true } }));
}
