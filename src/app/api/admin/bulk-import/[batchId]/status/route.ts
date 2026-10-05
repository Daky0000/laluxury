import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guardBatchRoute } from "@/lib/bulk-import/route-auth";
import { pendingJobCount } from "@/lib/bulk-import/jobs";
import { runCatalogWorker } from "@/lib/bulk-import/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/bulk-import/:batchId/status — progress for the review screen.
 *
 * While the page is open, each poll also gives the queue a few seconds of
 * work, so imports keep moving even without a separate worker process.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await params;
  const guard = await guardBatchRoute(batchId, "products:read");
  if ("error" in guard) return guard.error;

  let pending = await pendingJobCount(batchId);
  if (pending > 0) {
    await runCatalogWorker(8_000).catch(() => undefined);
    pending = await pendingJobCount(batchId);
  }
  const [batch, failedJobs] = await Promise.all([
    db.productImportBatch.findUnique({
      where: { id: batchId },
      select: { status: true, summary: true, aiCalls: true, aiFailures: true, updatedAt: true, error: true },
    }),
    db.productImportJob.findFirst({
      where: { batchId, status: "FAILED" },
      select: { type: true, error: true },
      orderBy: { updatedAt: "desc" },
    }),
  ]);
  return NextResponse.json({ ok: true, pending, ...batch, failedJob: failedJobs });
}
