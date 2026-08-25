import { db } from "./db";
import type { Prisma } from "@/generated/prisma";

/**
 * Every mutation that a human or the AI agent makes to the catalog, pricing,
 * discounts or users lands here. The agent writes with source "agent", so the
 * owner can always see what it changed on her behalf.
 */
export async function recordAudit(args: {
  actorId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  source?: "admin" | "agent" | "system";
  ip?: string | null;
}): Promise<void> {
  await db.auditLog.create({
    data: {
      actorId: args.actorId ?? null,
      action: args.action,
      entity: args.entity,
      entityId: args.entityId ?? null,
      before: args.before,
      after: args.after,
      source: args.source ?? "admin",
      ip: args.ip ?? null,
    },
  });
}

export async function recentAudit(limit = 50) {
  return db.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      actor: { select: { id: true, email: true, firstName: true, lastName: true } },
    },
  });
}
