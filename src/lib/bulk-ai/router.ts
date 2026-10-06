import { createHash } from "node:crypto";
import type { z } from "zod";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma";
import { callOpenRouter, type ChatMessage } from "./openrouter-client";
import { runWithFailover } from "./failover";
import {
  concurrencyFor,
  getBulkAiConfig,
  modelsFor,
  vendorKey,
} from "./model-registry";
import { isDegraded, recordFailure, recordSuccess, withSlot } from "./health";
import { BulkAiDisabledError, BulkAiError, BulkAiExhaustedError, waitWithBackoff } from "./retry";
import { AI_TASKS, resolveTaskProfile, type AiTask } from "./task-registry";
import { toJsonSchema } from "./schemas";
import { shapeHint } from "./prompts";

/**
 * Task-aware AI routing for Bulk Product Add.
 *
 *   MODEL A: attempt 1, 2, 3 → MODEL B: attempt 1, 2, 3 → MODEL C: 1, 2, 3
 *   → BulkAiExhaustedError (the caller keeps the item for retry).
 *
 * At most 9 application attempts per task. Fatal errors (bad key, invalid
 * request) stop immediately; a model that is withdrawn or wants credits is
 * skipped without spending its attempts.
 */

export type RunBulkAiTaskArgs<S extends z.ZodType> = {
  task: AiTask;
  schema: S;
  system: string;
  user: string;
  /** data: URLs of prepared images, for vision tasks. */
  images?: string[];
  batchId?: string | null;
  itemId?: string | null;
  /** Stable identity of the input (e.g. image checksum + facts). Enables caching. */
  cacheKey?: string;
  /** Recipe version, part of the cache key so a recipe change re-runs. */
  recipeVersion?: number;
  maxTokens?: number;
  signal?: AbortSignal;
};

export { runWithFailover };

export async function runBulkAiTask<S extends z.ZodType>(
  args: RunBulkAiTaskArgs<S>,
): Promise<{ value: z.infer<S>; model: string; cached: boolean }> {
  const config = await getBulkAiConfig();
  if (!config.bulkAiEnabled) throw new BulkAiDisabledError();

  const meta = AI_TASKS[args.task];
  const key = args.cacheKey
    ? createHash("sha256")
        .update(`${args.task}|v${meta.promptVersion}|r${args.recipeVersion ?? 0}|${args.cacheKey}`)
        .digest("hex")
    : null;

  if (key) {
    const hit = await db.bulkAiCache.findUnique({ where: { key } });
    if (hit) {
      const parsed = args.schema.safeParse(hit.result);
      if (parsed.success) return { value: parsed.data, model: hit.model, cached: true };
    }
  }

  const vendor = config.bulkAiVendor;
  const apiKey = await vendorKey(config);
  if (!apiKey) {
    throw new BulkAiError(
      `Add ${vendor === "NVIDIA" ? "an NVIDIA" : "an OpenRouter"} API key under Settings → Integrations.`,
      "FATAL",
    );
  }

  const profile = resolveTaskProfile(args.task);
  const models = modelsFor(config, profile);
  if (!models.length) throw new BulkAiExhaustedError("No model is allowed under the current AI policy.");

  const jsonSchema = toJsonSchema(args.schema);
  const userContent: ChatMessage["content"] = args.images?.length
    ? [
        { type: "text", text: `${args.user}\n\n${shapeHint(jsonSchema)}` },
        ...args.images.map((url) => ({ type: "image_url" as const, image_url: { url } })),
      ]
    : `${args.user}\n\n${shapeHint(jsonSchema)}`;
  const messages: ChatMessage[] = [
    { role: "system", content: args.system },
    { role: "user", content: userContent },
  ];

  const limit = concurrencyFor(config, profile);
  let failures = 0;

  try {
    const { value, model } = await runWithFailover(
      {
        models,
        attemptsPerModel: config.bulkAiAttemptsPerModel,
        skipModel: isDegraded,
        onModelFailure: recordFailure,
        onModelSuccess: recordSuccess,
        wait: (n, ms) => waitWithBackoff(n, args.signal, ms),
        call: (model) =>
          withSlot(profile, limit, () =>
            callOpenRouter({
              vendor,
              apiKey,
              model,
              messages,
              jsonSchema: { name: args.task.toLowerCase(), schema: jsonSchema },
              maxTokens: args.maxTokens,
              signal: args.signal,
            }),
          ),
        log: async (entry) => {
          if (!entry.success) failures++;
          await db.productImportAiAttempt
            .create({
              data: {
                task: args.task,
                batchId: args.batchId ?? null,
                itemId: args.itemId ?? null,
                ...entry,
              },
            })
            .catch(() => undefined);
        },
      },
      (raw) => args.schema.parse(raw) as z.infer<S>,
    );

    if (key) {
      await db.bulkAiCache
        .upsert({
          where: { key },
          create: { key, task: args.task, model, result: value as Prisma.InputJsonValue },
          update: { model, result: value as Prisma.InputJsonValue },
        })
        .catch(() => undefined);
    }
    return { value, model, cached: false };
  } finally {
    if (args.batchId) {
      await db.productImportBatch
        .update({
          where: { id: args.batchId },
          data: { aiCalls: { increment: 1 }, aiFailures: { increment: failures } },
        })
        .catch(() => undefined);
    }
  }
}
