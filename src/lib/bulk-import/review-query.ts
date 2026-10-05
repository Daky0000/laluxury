import type { Prisma, ProductImportItemStatus } from "@/generated/prisma";

/** Server-side filters for the exception review grid. */
export type ReviewFilter = { status?: string; issue?: string; q?: string };

const STATUSES = new Set<string>([
  "PENDING", "PROCESSING", "READY", "NEEDS_REVIEW", "BLOCKED", "IMPORTING", "IMPORTED", "UPDATED", "FAILED", "SKIPPED",
]);

export function itemWhere(batchId: string, filter: ReviewFilter | undefined): Prisma.ProductImportItemWhereInput {
  const where: Prisma.ProductImportItemWhereInput = { batchId };
  const f = filter ?? {};
  if (f.status === "ATTENTION") where.status = { in: ["NEEDS_REVIEW", "BLOCKED"] };
  else if (f.status && STATUSES.has(f.status)) where.status = f.status as ProductImportItemStatus;
  if (f.issue) where.issueCodes = { has: f.issue };
  const q = f.q?.trim();
  if (q) {
    where.OR = [
      { groupKey: { contains: q, mode: "insensitive" } },
      { externalKey: { contains: q, mode: "insensitive" } },
      { data: { path: ["draft", "title", "value"], string_contains: q } },
    ];
  }
  return where;
}
