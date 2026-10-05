import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma";

/**
 * A Postgres-backed work queue for catalog imports — no Redis needed.
 *
 * Jobs are claimed with FOR UPDATE SKIP LOCKED, so any number of runners (the
 * web process after a request, the review page's progress poll, a cron hit, or
 * a dedicated `npm run catalog:worker` process) can share the queue without
 * doing the same work twice. Every handler is idempotent: running a job again
 * after a crash converges on the same result.
 */

export const JOB_TYPES = [
  "PARSE_FILE",
  "REGISTER_MEDIA",
  "MATCH_MEDIA",
  "NORMALIZE_SOURCE",
  "MATCH_EXISTING_PRODUCT",
  "PREPARE_ITEMS",
  "AI_ANALYZE",
  "VALIDATE_ITEM",
  "CREATE_PRODUCT",
  "UPDATE_PRODUCT",
  "IMPORT_ITEMS",
  "PUBLISH_PRODUCT",
] as const;
export type JobType = (typeof JOB_TYPES)[number];

export type ClaimedJob = {
  id: string;
  type: JobType;
  batchId: string | null;
  payload: Prisma.JsonValue;
  attempts: number;
  maxAttempts: number;
};

export type JobInput = {
  type: JobType;
  batchId: string;
  payload?: Prisma.InputJsonValue;
  dedupeKey?: string;
  maxAttempts?: number;
  runAfter?: Date;
};

export async function enqueueJobs(jobs: JobInput[]): Promise<number> {
  if (!jobs.length) return 0;
  let created = 0;
  for (let i = 0; i < jobs.length; i += 1000) {
    const res = await db.productImportJob.createMany({
      data: jobs.slice(i, i + 1000).map((j) => ({
        type: j.type,
        batchId: j.batchId,
        payload: j.payload ?? {},
        dedupeKey: j.dedupeKey ?? null,
        maxAttempts: j.maxAttempts ?? 5,
        runAfter: j.runAfter ?? new Date(),
      })),
      skipDuplicates: true,
    });
    created += res.count;
  }
  return created;
}

const STALE_LOCK_MINUTES = 10;

export async function claimJobs(workerId: string, limit: number): Promise<ClaimedJob[]> {
  // Jobs whose runner died mid-way go back on the queue.
  await db.$executeRaw`
    UPDATE "ProductImportJob"
       SET status = 'QUEUED'::"ProductImportJobStatus", "lockedAt" = NULL, "lockedBy" = NULL, "updatedAt" = now()
     WHERE status = 'RUNNING'::"ProductImportJobStatus"
       AND "lockedAt" < now() - make_interval(mins => ${STALE_LOCK_MINUTES})`;

  return db.$queryRaw<ClaimedJob[]>`
    UPDATE "ProductImportJob"
       SET status = 'RUNNING'::"ProductImportJobStatus", "lockedAt" = now(), "lockedBy" = ${workerId},
           attempts = attempts + 1, "updatedAt" = now()
     WHERE id IN (
       SELECT j.id FROM "ProductImportJob" j
         LEFT JOIN "ProductImportBatch" b ON b.id = j."batchId"
        WHERE j.status = 'QUEUED'::"ProductImportJobStatus" AND j."runAfter" <= now()
          AND (b.status IS NULL OR b.status <> 'CANCELLED'::"ProductImportBatchStatus")
        ORDER BY j."createdAt"
        LIMIT ${limit}
        FOR UPDATE OF j SKIP LOCKED)
    RETURNING id, type, "batchId", payload, attempts, "maxAttempts"`;
}

export async function completeJob(id: string): Promise<void> {
  await db.productImportJob.update({
    where: { id },
    data: { status: "DONE", lockedAt: null, lockedBy: null, error: null },
  });
}

export async function failJob(job: ClaimedJob, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  const final = job.attempts >= job.maxAttempts;
  await db.productImportJob.update({
    where: { id: job.id },
    data: {
      status: final ? "FAILED" : "QUEUED",
      error: message.slice(0, 1000),
      lockedAt: null,
      lockedBy: null,
      runAfter: new Date(Date.now() + Math.min(10 * 60_000, 5_000 * 2 ** job.attempts)),
    },
  });
}

/** Queued or running jobs for a batch, optionally not counting the caller's own job. */
export async function pendingJobCount(batchId: string, excludeJobId?: string): Promise<number> {
  return db.productImportJob.count({
    where: { batchId, status: { in: ["QUEUED", "RUNNING"] }, ...(excludeJobId ? { NOT: { id: excludeJobId } } : {}) },
  });
}

export async function cancelBatchJobs(batchId: string): Promise<void> {
  await db.productImportJob.updateMany({
    where: { batchId, status: { in: ["QUEUED", "RUNNING"] } },
    data: { status: "CANCELLED" },
  });
}

// --- Runner -------------------------------------------------------------------

export type JobHandler = (job: ClaimedJob) => Promise<void>;

const g = globalThis as unknown as { catalogWorkerRunning?: boolean };

/**
 * Runs queued jobs until the time budget is spent or the queue is empty.
 * One runner per process at a time; other processes may run alongside.
 */
export async function runJobs(
  handle: JobHandler,
  opts: { budgetMs: number; parallel?: number; workerId?: string },
): Promise<{ processed: number }> {
  if (g.catalogWorkerRunning) return { processed: 0 };
  g.catalogWorkerRunning = true;
  const workerId = opts.workerId ?? `web-${process.pid}-${randomUUID().slice(0, 8)}`;
  const deadline = Date.now() + opts.budgetMs;
  let processed = 0;
  try {
    while (Date.now() < deadline) {
      const jobs = await claimJobs(workerId, opts.parallel ?? 4);
      if (!jobs.length) break;
      await Promise.all(
        jobs.map(async (job) => {
          try {
            await handle(job);
            await completeJob(job.id);
          } catch (error) {
            await failJob(job, error).catch(() => undefined);
          }
          processed++;
        }),
      );
    }
  } finally {
    g.catalogWorkerRunning = false;
  }
  return { processed };
}
