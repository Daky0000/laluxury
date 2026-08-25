import { db } from "./db";
import type { InventoryMovementType, Prisma } from "@/generated/prisma";

/**
 * Stock model
 * -----------
 *   onHand    physical units in the building
 *   reserved  units promised to orders that have not shipped yet
 *   available onHand - reserved   <- what the storefront may sell
 *
 * Lifecycle of one unit through an order:
 *   checkout      reserve()   reserved +1
 *   payment ok    commit()    onHand -1, reserved -1   (SALE)
 *   cancelled     release()   reserved -1
 *   returned      restock()   onHand +1                (RETURN)
 */

export type StockLine = { variantId: string; quantity: number };

export type Shortage = {
  variantId: string;
  sku: string;
  requested: number;
  available: number;
};

export class InsufficientStockError extends Error {
  constructor(readonly shortages: Shortage[]) {
    super(
      `Not enough stock for ${shortages
        .map((s) => `${s.sku} (asked ${s.requested}, ${s.available} left)`)
        .join(", ")}`,
    );
    this.name = "InsufficientStockError";
  }
}

export function availableOf(item: { onHand: number; reserved: number }): number {
  return item.onHand - item.reserved;
}

/** Ensures every tracked variant has an inventory row. */
export async function ensureInventoryItem(variantId: string) {
  return db.inventoryItem.upsert({
    where: { variantId },
    create: { variantId },
    update: {},
  });
}

async function recordMovement(
  tx: Prisma.TransactionClient,
  args: {
    inventoryItemId: string;
    type: InventoryMovementType;
    quantity: number;
    onHandAfter: number;
    reason?: string;
    reference?: string;
    actorId?: string | null;
  },
) {
  await tx.inventoryMovement.create({
    data: {
      inventoryItemId: args.inventoryItemId,
      type: args.type,
      quantity: args.quantity,
      onHandAfter: args.onHandAfter,
      reason: args.reason,
      reference: args.reference,
      actorId: args.actorId ?? null,
    },
  });
}

/**
 * Checks availability for a set of lines without mutating anything.
 * Returns the shortages; an empty array means everything fits.
 */
export async function checkAvailability(lines: StockLine[]): Promise<Shortage[]> {
  if (lines.length === 0) return [];

  const items = await db.inventoryItem.findMany({
    where: { variantId: { in: lines.map((l) => l.variantId) } },
    include: { variant: { select: { sku: true } } },
  });

  const byVariant = new Map(items.map((i) => [i.variantId, i]));
  const shortages: Shortage[] = [];

  for (const line of lines) {
    const item = byVariant.get(line.variantId);
    // No inventory row means the variant is not tracked yet - treat as sellable.
    if (!item || !item.trackInventory || item.allowBackorder) continue;

    const available = availableOf(item);
    if (available < line.quantity) {
      shortages.push({
        variantId: line.variantId,
        sku: item.variant.sku,
        requested: line.quantity,
        available: Math.max(0, available),
      });
    }
  }
  return shortages;
}

/**
 * Reserves stock for an order. Each variant row is locked with SELECT ... FOR
 * UPDATE so two simultaneous checkouts cannot both claim the last unit.
 */
export async function reserveStock(
  lines: StockLine[],
  reference: string,
  actorId?: string | null,
): Promise<void> {
  if (lines.length === 0) return;

  await db.$transaction(async (tx) => {
    // Deterministic order avoids deadlocks between concurrent transactions.
    const ordered = [...lines].sort((a, b) => a.variantId.localeCompare(b.variantId));

    for (const line of ordered) {
      const locked = await tx.$queryRaw<
        {
          id: string;
          onHand: number;
          reserved: number;
          trackInventory: boolean;
          allowBackorder: boolean;
        }[]
      >`SELECT id, "onHand", reserved, "trackInventory", "allowBackorder"
          FROM "InventoryItem" WHERE "variantId" = ${line.variantId} FOR UPDATE`;

      const item = locked[0];
      if (!item || !item.trackInventory) continue;

      const available = item.onHand - item.reserved;
      if (!item.allowBackorder && available < line.quantity) {
        const variant = await tx.variant.findUnique({
          where: { id: line.variantId },
          select: { sku: true },
        });
        throw new InsufficientStockError([
          {
            variantId: line.variantId,
            sku: variant?.sku ?? line.variantId,
            requested: line.quantity,
            available: Math.max(0, available),
          },
        ]);
      }

      await tx.inventoryItem.update({
        where: { id: item.id },
        data: { reserved: { increment: line.quantity } },
      });

      await recordMovement(tx, {
        inventoryItemId: item.id,
        type: "RESERVATION",
        quantity: line.quantity,
        onHandAfter: item.onHand,
        reference,
        actorId,
      });
    }
  });
}

/** Releases a reservation without selling (order cancelled or expired). */
export async function releaseStock(
  lines: StockLine[],
  reference: string,
  actorId?: string | null,
): Promise<void> {
  if (lines.length === 0) return;

  await db.$transaction(async (tx) => {
    for (const line of lines) {
      const item = await tx.inventoryItem.findUnique({ where: { variantId: line.variantId } });
      if (!item || !item.trackInventory) continue;

      await tx.inventoryItem.update({
        where: { id: item.id },
        // Clamped so a replayed release can never push reserved negative.
        data: { reserved: Math.max(0, item.reserved - line.quantity) },
      });

      await recordMovement(tx, {
        inventoryItemId: item.id,
        type: "RELEASE",
        quantity: -line.quantity,
        onHandAfter: item.onHand,
        reference,
        actorId,
      });
    }
  });
}

/**
 * Converts a reservation into a sale: onHand down, reserved down.
 * Called once payment succeeds.
 */
export async function commitStock(
  lines: StockLine[],
  reference: string,
  actorId?: string | null,
): Promise<void> {
  if (lines.length === 0) return;

  await db.$transaction(async (tx) => {
    for (const line of lines) {
      const item = await tx.inventoryItem.findUnique({ where: { variantId: line.variantId } });
      if (!item || !item.trackInventory) continue;

      const onHandAfter = item.onHand - line.quantity;
      await tx.inventoryItem.update({
        where: { id: item.id },
        data: {
          onHand: onHandAfter,
          reserved: Math.max(0, item.reserved - line.quantity),
        },
      });

      await recordMovement(tx, {
        inventoryItemId: item.id,
        type: "SALE",
        quantity: -line.quantity,
        onHandAfter,
        reference,
        actorId,
      });
    }
  });
}

/** Puts units back on the shelf (return or refund). */
export async function restockUnits(
  lines: StockLine[],
  reference: string,
  type: InventoryMovementType = "RETURN",
  actorId?: string | null,
): Promise<void> {
  if (lines.length === 0) return;

  await db.$transaction(async (tx) => {
    for (const line of lines) {
      const item = await tx.inventoryItem.findUnique({ where: { variantId: line.variantId } });
      if (!item) continue;

      const onHandAfter = item.onHand + line.quantity;
      await tx.inventoryItem.update({
        where: { id: item.id },
        data: { onHand: onHandAfter },
      });

      await recordMovement(tx, {
        inventoryItemId: item.id,
        type,
        quantity: line.quantity,
        onHandAfter,
        reference,
        actorId,
      });
    }
  });
}

/** Manual admin edit: sets onHand to an absolute figure and logs the delta. */
export async function setStockLevel(
  variantId: string,
  newOnHand: number,
  reason: string,
  actorId?: string | null,
) {
  const item = await ensureInventoryItem(variantId);
  const delta = newOnHand - item.onHand;

  await db.$transaction(async (tx) => {
    await tx.inventoryItem.update({
      where: { id: item.id },
      data: { onHand: newOnHand },
    });
    await recordMovement(tx, {
      inventoryItemId: item.id,
      type: "ADJUSTMENT",
      quantity: delta,
      onHandAfter: newOnHand,
      reason,
      actorId,
    });
  });

  return { previous: item.onHand, current: newOnHand, delta };
}

/** Receiving a purchase order. */
export async function restockVariant(
  variantId: string,
  quantity: number,
  reason: string,
  actorId?: string | null,
): Promise<void> {
  await ensureInventoryItem(variantId);
  await restockUnits([{ variantId, quantity }], reason, "RESTOCK", actorId);
}

/** Everything at or below its reorder point - drives the dashboard alert. */
export async function lowStockItems(limit = 50) {
  const items = await db.inventoryItem.findMany({
    where: { trackInventory: true },
    include: {
      variant: {
        include: { product: { select: { id: true, title: true, slug: true } } },
      },
    },
    orderBy: { onHand: "asc" },
    take: 400,
  });

  return items
    .filter((i) => availableOf(i) <= i.reorderPoint)
    .slice(0, limit)
    .map((i) => ({
      inventoryItemId: i.id,
      variantId: i.variantId,
      sku: i.variant.sku,
      productId: i.variant.product.id,
      productTitle: i.variant.product.title,
      variantTitle: i.variant.title,
      onHand: i.onHand,
      reserved: i.reserved,
      available: availableOf(i),
      reorderPoint: i.reorderPoint,
      reorderQuantity: i.reorderQuantity,
    }));
}

/** Lines for an order, used by the payment/cancel/refund paths. */
export async function stockLinesForOrder(orderId: string): Promise<StockLine[]> {
  const items = await db.orderItem.findMany({
    where: { orderId, variantId: { not: null } },
    select: { variantId: true, quantity: true },
  });

  return items
    .filter((i): i is { variantId: string; quantity: number } => i.variantId !== null)
    .map((i) => ({ variantId: i.variantId, quantity: i.quantity }));
}
