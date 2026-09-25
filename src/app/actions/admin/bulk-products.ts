"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

async function bumpCatalogRevision() {
  await db.setting.upsert({
    where: { key: "catalog_revision" },
    update: { value: Date.now() },
    create: { key: "catalog_revision", value: Date.now() },
  });
}

export async function bulkAdjustPricesByPercentAction(formData: FormData): Promise<void> {
  const staff = await requirePermission("products:write");

  const percent = Number(formData.get("percent") ?? 0);
  const categoryId = String(formData.get("categoryId") ?? "ALL").trim();
  const roundToNearestTen = formData.get("roundToNearestTen") === "on";

  if (!percent || Number.isNaN(percent) || percent < -80 || percent > 200) {
    return;
  }

  const multiplier = 1 + percent / 100;

  const products = await db.product.findMany({
    where: categoryId !== "ALL" ? { categories: { some: { categoryId } } } : {},
    include: { variants: true },
  });

  await db.$transaction(async (tx) => {
    for (const product of products) {
      if (product.variants.length === 0) continue;
      const newPrices: number[] = [];

      for (const variant of product.variants) {
        let updatedMinor = Math.round(variant.price * multiplier);
        if (roundToNearestTen) {
          // 10 GHS = 1000 pesewas
          updatedMinor = Math.round(updatedMinor / 1000) * 1000;
        }
        updatedMinor = Math.max(100, updatedMinor);
        newPrices.push(updatedMinor);

        await tx.variant.update({
          where: { id: variant.id },
          data: { price: updatedMinor },
        });
      }

      await tx.product.update({
        where: { id: product.id },
        data: {
          minPrice: Math.min(...newPrices),
          maxPrice: Math.max(...newPrices),
        },
      });
    }
  });

  await bumpCatalogRevision();
  await logAudit({
    actorId: staff.id,
    action: "products.bulk_price_adjust",
    entity: "Product",
    after: { percent, categoryId, roundToNearestTen, affectedProducts: products.length },
  });

  revalidatePath("/admin/products");
  revalidatePath("/admin/products/bulk");
  revalidatePath("/shop");
}

export async function bulkConfigurePreorderAction(formData: FormData): Promise<void> {
  const staff = await requirePermission("products:write");

  const categoryId = String(formData.get("categoryId") ?? "ALL").trim();
  const mode = String(formData.get("mode") ?? "ENABLE"); // ENABLE | DISABLE
  const depositPercent = Math.min(100, Math.max(10, Number(formData.get("depositPercent") ?? 50)));
  const leadTime = String(formData.get("leadTime") ?? "4–6 weeks").trim() || "4–6 weeks";

  const isPreorder = mode === "ENABLE";

  const products = await db.product.findMany({
    where: categoryId !== "ALL" ? { categories: { some: { categoryId } } } : {},
    select: { id: true, variants: { select: { id: true } } },
  });

  await db.$transaction(async (tx) => {
    for (const p of products) {
      await tx.product.update({
        where: { id: p.id },
        data: {
          isPreorder,
          preorderDepositPercent: depositPercent,
          preorderLeadTime: leadTime,
        },
      });

      for (const v of p.variants) {
        await tx.inventoryItem.updateMany({
          where: { variantId: v.id },
          data: { allowBackorder: isPreorder },
        });
      }
    }
  });

  await bumpCatalogRevision();
  await logAudit({
    actorId: staff.id,
    action: "products.bulk_preorder_update",
    entity: "Product",
    after: { categoryId, isPreorder, depositPercent, leadTime, count: products.length },
  });

  revalidatePath("/admin/products");
  revalidatePath("/admin/products/bulk");
  revalidatePath("/pre-order");
}

export async function bulkInlineVariantSaveAction(formData: FormData): Promise<void> {
  const staff = await requirePermission("products:write");

  const variantId = String(formData.get("variantId") ?? "");
  const priceMajor = Number(formData.get("priceMajor") ?? 0);
  const costMajor = Number(formData.get("costMajor") ?? 0);
  const onHand = Number(formData.get("onHand") ?? 0);

  if (!variantId || priceMajor <= 0) return;

  const priceMinor = Math.round(priceMajor * 100);
  const costMinor = costMajor > 0 ? Math.round(costMajor * 100) : null;

  await db.$transaction(async (tx) => {
    const v = await tx.variant.update({
      where: { id: variantId },
      data: {
        price: priceMinor,
        costPrice: costMinor,
      },
    });

    await tx.inventoryItem.updateMany({
      where: { variantId: v.id },
      data: { onHand: Math.max(0, Math.round(onHand)) },
    });

    const siblings = await tx.variant.findMany({
      where: { productId: v.productId, isActive: true },
      select: { price: true },
    });

    if (siblings.length > 0) {
      const prices = siblings.map((s) => s.price);
      await tx.product.update({
        where: { id: v.productId },
        data: {
          minPrice: Math.min(...prices),
          maxPrice: Math.max(...prices),
        },
      });
    }
  });

  await bumpCatalogRevision();
  await logAudit({
    actorId: staff.id,
    action: "variant.inline_update",
    entity: "Variant",
    entityId: variantId,
    after: { priceMinor, costMinor, onHand },
  });

  revalidatePath("/admin/products/bulk");
  revalidatePath("/admin/products");
}
