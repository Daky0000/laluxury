"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { setStockLevel, restockVariant, ensureInventoryItem } from "@/lib/inventory";
import { ensureUniqueCode } from "@/lib/discounts";
import { uniqueSlug } from "@/lib/slug";
import { toMinorUnits } from "@/lib/money";
import { recordAudit } from "@/lib/audit";
import type { DiscountType, DiscountScope } from "@/generated/prisma";
import type { AdminState } from "./products";

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------

/** The storefront views that show stock, price or availability. */
function revalidateStorefront() {
  revalidatePath("/shop");
  revalidatePath("/");
  revalidatePath("/product/[slug]", "page");
}

export async function adjustStockAction(
  _prev: AdminState | null,
  formData: FormData,
): Promise<AdminState> {
  const actor = await requirePermission("inventory:write");

  const variantId = String(formData.get("variantId") || "");
  const mode = String(formData.get("mode") || "set");
  const quantity = Number(formData.get("quantity"));
  const reason = String(formData.get("reason") || "").trim() || "Manual adjustment";

  if (!variantId) return { ok: false, message: "No variant selected." };
  if (!Number.isFinite(quantity)) return { ok: false, message: "Enter a number." };

  if (mode === "add") {
    if (quantity <= 0) return { ok: false, message: "Enter a positive number to receive." };
    await restockVariant(variantId, quantity, reason, actor.id);
  } else {
    if (quantity < 0) return { ok: false, message: "Stock cannot be negative." };
    await setStockLevel(variantId, quantity, reason, actor.id);
  }

  revalidatePath("/admin/inventory");
  revalidatePath("/admin");
  // Stock decides whether the storefront offers "Add to bag" or "Sold out".
  revalidateStorefront();
  return { ok: true, message: "Stock updated." };
}

export async function updateInventorySettingsAction(
  _prev: AdminState | null,
  formData: FormData,
): Promise<AdminState> {
  await requirePermission("inventory:write");

  const variantId = String(formData.get("variantId") || "");
  if (!variantId) return { ok: false, message: "No variant selected." };

  await ensureInventoryItem(variantId);
  await db.inventoryItem.update({
    where: { variantId },
    data: {
      reorderPoint: Math.max(0, Number(formData.get("reorderPoint")) || 0),
      reorderQuantity: Math.max(0, Number(formData.get("reorderQuantity")) || 0),
      trackInventory: formData.get("trackInventory") === "on",
      allowBackorder: formData.get("allowBackorder") === "on",
      location: String(formData.get("location") || "Main"),
    },
  });

  revalidatePath("/admin/inventory");
  revalidateStorefront();
  return { ok: true, message: "Saved." };
}

// ---------------------------------------------------------------------------
// Discounts
// ---------------------------------------------------------------------------

export async function saveDiscountAction(
  discountId: string | null,
  _prev: AdminState | null,
  formData: FormData,
): Promise<AdminState> {
  const actor = await requirePermission("discounts:write");

  const rawCode = String(formData.get("code") || "").trim().toUpperCase();
  if (!rawCode) return { ok: false, message: "Give the code a name, e.g. EASTER25." };

  const type = String(formData.get("type") || "PERCENTAGE") as DiscountType;
  const scope = String(formData.get("scope") || "ENTIRE_ORDER") as DiscountScope;
  const rawValue = Number(formData.get("value")) || 0;

  if (type === "PERCENTAGE" && (rawValue <= 0 || rawValue > 100)) {
    return { ok: false, message: "A percentage must be between 1 and 100." };
  }
  if (type === "FIXED_AMOUNT" && rawValue <= 0) {
    return { ok: false, message: "Enter an amount greater than zero." };
  }

  const value =
    type === "FIXED_AMOUNT" ? toMinorUnits(rawValue) : type === "PERCENTAGE" ? rawValue : 0;

  const optional = (key: string): number | null => {
    const raw = String(formData.get(key) ?? "").trim();
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  const minSubtotalRaw = optional("minSubtotal");
  const startsAtRaw = String(formData.get("startsAt") || "").trim();
  const endsAtRaw = String(formData.get("endsAt") || "").trim();

  const data = {
    description: String(formData.get("description") || "").trim() || null,
    type,
    scope,
    value,
    minSubtotal: minSubtotalRaw !== null ? toMinorUnits(minSubtotalRaw) : null,
    minQuantity: optional("minQuantity"),
    usageLimit: optional("usageLimit"),
    usageLimitPerUser: optional("usageLimitPerUser"),
    firstOrderOnly: formData.get("firstOrderOnly") === "on",
    isActive: formData.get("isActive") === "on",
    startsAt: startsAtRaw ? new Date(startsAtRaw) : null,
    endsAt: endsAtRaw ? new Date(endsAtRaw) : null,
    productIds: formData.getAll("productIds").map(String).filter(Boolean),
    categoryIds: formData.getAll("categoryIds").map(String).filter(Boolean),
  };

  if (data.startsAt && data.endsAt && data.endsAt <= data.startsAt) {
    return { ok: false, message: "The end date must be after the start date." };
  }

  if (discountId) {
    const existing = await db.discount.findUnique({ where: { id: discountId } });
    if (!existing) return { ok: false, message: "That code no longer exists." };

    // Only re-uniquify if the code was actually renamed.
    const code = rawCode !== existing.code ? await ensureUniqueCode(rawCode) : existing.code;

    await db.discount.update({ where: { id: discountId }, data: { ...data, code } });
    await recordAudit({
      actorId: actor.id,
      action: "discount.update",
      entity: "Discount",
      entityId: discountId,
      before: { code: existing.code, value: existing.value, isActive: existing.isActive },
      after: { code, value, isActive: data.isActive },
    });
  } else {
    const code = await ensureUniqueCode(rawCode);
    const created = await db.discount.create({ data: { ...data, code } });
    await recordAudit({
      actorId: actor.id,
      action: "discount.create",
      entity: "Discount",
      entityId: created.id,
      after: { code, type, value },
    });
  }

  revalidatePath("/admin/discounts");
  return { ok: true, message: "Discount saved." };
}

export async function toggleDiscountAction(
  discountId: string,
  isActive: boolean,
): Promise<AdminState> {
  const actor = await requirePermission("discounts:write");

  await db.discount.update({ where: { id: discountId }, data: { isActive } });
  await recordAudit({
    actorId: actor.id,
    action: "discount.toggle",
    entity: "Discount",
    entityId: discountId,
    after: { isActive },
  });

  revalidatePath("/admin/discounts");
  return { ok: true, message: isActive ? "Code enabled." : "Code disabled." };
}

export async function deleteDiscountAction(discountId: string): Promise<AdminState> {
  const actor = await requirePermission("discounts:write");

  const redemptions = await db.discountRedemption.count({ where: { discountId } });
  if (redemptions > 0) {
    // Redemptions are part of order history, so keep the row and just retire it.
    await db.discount.update({ where: { id: discountId }, data: { isActive: false } });
    revalidatePath("/admin/discounts");
    return {
      ok: true,
      message: `That code has ${redemptions} redemption${redemptions === 1 ? "" : "s"}, so it was disabled rather than deleted.`,
    };
  }

  await db.discount.delete({ where: { id: discountId } });
  await recordAudit({
    actorId: actor.id,
    action: "discount.delete",
    entity: "Discount",
    entityId: discountId,
  });

  revalidatePath("/admin/discounts");
  return { ok: true, message: "Code deleted." };
}

// ---------------------------------------------------------------------------
// Categories & collections
// ---------------------------------------------------------------------------

export async function saveCategoryAction(
  categoryId: string | null,
  _prev: AdminState | null,
  formData: FormData,
): Promise<AdminState> {
  await requirePermission("products:write");

  const name = String(formData.get("name") || "").trim();
  if (!name) return { ok: false, message: "Name the category." };

  const description = String(formData.get("description") || "").trim() || null;
  const imageUrl = String(formData.get("imageUrl") || "").trim() || null;
  const isActive = formData.get("isActive") === "on";
  const position = Number(formData.get("position")) || 0;

  if (categoryId) {
    const existing = await db.category.findUnique({ where: { id: categoryId } });
    if (!existing) return { ok: false, message: "That category no longer exists." };

    const slug =
      name !== existing.name ? await uniqueSlug("category", name, categoryId) : existing.slug;

    await db.category.update({
      where: { id: categoryId },
      data: { name, slug, description, imageUrl, isActive, position },
    });
  } else {
    await db.category.create({
      data: {
        name,
        slug: await uniqueSlug("category", name),
        description,
        imageUrl,
        isActive,
        position,
      },
    });
  }

  revalidatePath("/admin/products");
  revalidatePath("/shop");
  revalidatePath("/", "layout");
  return { ok: true, message: "Category saved." };
}

export async function deleteCategoryAction(categoryId: string): Promise<AdminState> {
  await requirePermission("products:write");

  // Products keep existing; only the association goes.
  await db.category.delete({ where: { id: categoryId } });

  revalidatePath("/admin/products");
  revalidatePath("/shop");
  revalidatePath("/", "layout");
  return { ok: true, message: "Category deleted." };
}
