import { db } from "@/lib/db";
import { refreshPriceRange, buildSearchText } from "@/lib/catalog";
import { createCatalogProduct, uniquifySkus, type NewProductInput } from "@/lib/catalog/create-product";
import { registerExternalUrl } from "@/lib/media";
import type { Prisma } from "@/generated/prisma";
import { FIELD_AUTHORITY_DEFAULTS, type FieldAuthority, type ItemDraft } from "./schema";

/**
 * Writes one inbox item to the live catalog — a new draft product, or an
 * update to the product it matched. One product per transaction; a batch is
 * never one giant transaction, so one bad item cannot sink the rest.
 */

export type WriteOutcome = { action: "CREATED" | "UPDATED"; productId: string; changes: string[] };

export function draftToProductInput(draft: ItemDraft, status: "DRAFT" | "ACTIVE" = "DRAFT"): NewProductInput {
  const enabledKeys = new Set(draft.variants.filter((v) => v.enabled).map((v) => v.key));
  // Option values that no enabled version uses are dropped from the product.
  const used = draft.options.map((_, i) => new Set(draft.variants.filter((v) => enabledKeys.has(v.key)).map((v) => v.values[i])));
  const options = draft.options.map((o, i) => ({ name: o.name, values: o.values.filter((v) => used[i].has(v)) }));

  return {
    title: draft.title?.value ?? "",
    status,
    shortDescription: draft.shortDescription?.value ?? null,
    description: draft.description?.value ?? null,
    brand: draft.brand?.value ?? null,
    material: draft.material?.value ?? null,
    care: draft.care?.value ?? null,
    tags: draft.tags?.value ?? [],
    metaTitle: draft.metaTitle?.value ?? null,
    metaDescription: draft.metaDescription?.value ?? null,
    options,
    // Disabled combinations never become sellable versions.
    variants: draft.variants
      .filter((v) => v.enabled)
      .map((v) => ({
        values: v.values,
        sku: v.sku!,
        barcode: v.barcode,
        price: v.price ?? 0,
        compareAtPrice: v.compareAtPrice,
        costPrice: v.costPrice,
        weightGrams: v.weightGrams,
        stock: v.stock,
        trackInventory: v.trackInventory,
      })),
    images: draft.images.map((img) => ({
      url: img.url,
      alt: img.alt ?? draft.title?.value ?? null,
      mediaId: img.mediaId,
      option: img.option,
      optionValue: img.optionValue,
    })),
    categoryIds: draft.categoryIds?.value ?? [],
    collectionIds: draft.collectionIds?.value ?? [],
  };
}

export async function createFromDraft(draft: ItemDraft, actorId: string | null): Promise<WriteOutcome> {
  // Pasted image URLs go through the media library like any other picture.
  for (const img of draft.images) {
    if (!img.mediaId && /^https?:\/\//i.test(img.url)) {
      const asset = await registerExternalUrl(img.url, { folder: "products", uploadedById: actorId }).catch(() => null);
      if (asset) {
        img.mediaId = asset.id;
        img.url = asset.url;
      }
    }
  }
  const product = await createCatalogProduct(await uniquifySkus(draftToProductInput(draft)));
  return { action: "CREATED", productId: product.id, changes: ["created"] };
}

/**
 * Updates a matched product, respecting field authority: by default the
 * supplier owns stock and cost, Noble Enclave owns price, title, copy and SEO.
 * New photos are added; existing ones are left alone.
 */
export async function updateFromDraft(
  productId: string,
  draft: ItemDraft,
  authority: Partial<FieldAuthority> | undefined,
  actorId: string | null,
  reference: string,
): Promise<WriteOutcome> {
  const auth: FieldAuthority = { ...FIELD_AUTHORITY_DEFAULTS, ...(authority ?? {}) };
  const product = await db.product.findUnique({
    where: { id: productId },
    include: {
      variants: { include: { inventory: true } },
      images: { select: { url: true, mediaId: true } },
    },
  });
  if (!product) throw new Error("The matched product no longer exists.");

  const changes: string[] = [];
  await db.$transaction(async (tx) => {
    const data: Prisma.ProductUpdateInput = {};
    const fromSource = (f: keyof FieldAuthority) => auth[f] === "SOURCE";
    const nonAi = <T,>(field?: { value: T; source: string }) => (field && field.source !== "AI" ? field.value : undefined);

    if (fromSource("title") && nonAi(draft.title)) data.title = nonAi(draft.title);
    if (fromSource("description")) {
      if (draft.description) data.description = draft.description.value;
      if (draft.shortDescription) data.shortDescription = draft.shortDescription.value;
    }
    if (fromSource("seo")) {
      if (draft.metaTitle) data.metaTitle = draft.metaTitle.value;
      if (draft.metaDescription) data.metaDescription = draft.metaDescription.value;
    }
    if (Object.keys(data).length) {
      data.searchText = buildSearchText({
        title: (data.title as string) ?? product.title,
        tags: product.tags,
        brand: product.brand,
        material: product.material,
        shortDescription: (data.shortDescription as string) ?? product.shortDescription,
      });
      await tx.product.update({ where: { id: productId }, data });
      changes.push(...Object.keys(data).filter((k) => k !== "searchText"));
    }

    for (const v of draft.variants.filter((x) => x.enabled)) {
      const live =
        product.variants.find((pv) => v.sku && pv.sku === v.sku) ??
        product.variants.find((pv) => pv.title.toLowerCase() === v.key.toLowerCase()) ??
        (product.variants.length === 1 && draft.variants.length === 1 ? product.variants[0] : undefined);
      if (!live) continue;

      const vdata: Prisma.VariantUpdateInput = {};
      if (fromSource("price") && v.price != null && v.priceSource !== "AI" && v.price !== live.price) {
        vdata.price = v.price;
        changes.push("price");
      }
      if (fromSource("cost") && v.costPrice != null && v.costPrice !== live.costPrice) {
        vdata.costPrice = v.costPrice;
        changes.push("cost");
      }
      if (Object.keys(vdata).length) await tx.variant.update({ where: { id: live.id }, data: vdata });

      if (fromSource("stock") && v.stock != null && v.stockSource === "SOURCE") {
        const inv = live.inventory ?? (await tx.inventoryItem.create({ data: { variantId: live.id } }));
        if (inv.onHand !== v.stock) {
          await tx.inventoryItem.update({ where: { id: inv.id }, data: { onHand: v.stock } });
          await tx.inventoryMovement.create({
            data: {
              inventoryItemId: inv.id,
              type: "ADJUSTMENT",
              quantity: v.stock - inv.onHand,
              onHandAfter: v.stock,
              reason: "Bulk Product Add supplier update",
              reference,
              actorId,
            },
          });
          changes.push("stock");
        }
      }
    }

    if (auth.images !== "OWNER") {
      const have = new Set(product.images.map((i) => i.mediaId ?? i.url));
      let position = product.images.length;
      for (const img of draft.images) {
        if (have.has(img.mediaId ?? img.url) || !img.mediaId) continue;
        await tx.productImage.create({
          data: { productId, url: img.url, alt: img.alt, mediaId: img.mediaId, position: position++ },
        });
        changes.push("image");
      }
    }
  });

  await refreshPriceRange(productId);
  return { action: "UPDATED", productId, changes: [...new Set(changes)] };
}
