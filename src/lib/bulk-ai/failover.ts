import { extractJson, type OpenRouterResult } from "./openrouter-client";
import { BulkAiExhaustedError, errorMessage, isFatal, isRetryable, waitWithBackoff } from "./retry";
import type { AiTask } from "./task-registry";

/**
 * The retry/failover loop on its own, free of the database and the network,
 * so it can be tested directly:
 *
 *   MODEL A: attempt 1, 2, 3 → MODEL B: attempt 1, 2, 3 → MODEL C: 1, 2, 3
 */

export type AttemptLog = {
  task: AiTask;
  model: string;
  attempt: number;
  success: boolean;
  error?: string;
  latencyMs: number;
  promptTokens?: number;
  completionTokens?: number;
  cost?: number;
};

export type FailoverDeps = {
  models: string[];
  attemptsPerModel: number;
  call: (model: string) => Promise<OpenRouterResult>;
  log: (entry: Omit<AttemptLog, "task">) => Promise<void> | void;
  wait?: (attempt: number) => Promise<void>;
  skipModel?: (model: string) => boolean;
  onModelFailure?: (model: string) => void;
  onModelSuccess?: (model: string) => void;
};

export async function runWithFailover<T>(
  deps: FailoverDeps,
  parse: (raw: unknown) => T,
): Promise<{ value: T; model: string }> {
  const wait = deps.wait ?? ((n: number) => waitWithBackoff(n));
  const usable = deps.models.filter((m) => !deps.skipModel?.(m));
  // If every model is tripped, probe them anyway rather than fail outright.
  const chain = usable.length ? usable : deps.models;

  let lastError = "";
  for (const model of chain) {
    for (let attempt = 1; attempt <= deps.attemptsPerModel; attempt++) {
      const started = Date.now();
      try {
        const result = await deps.call(model);
        const value = parse(extractJson(result.content));
        await deps.log({
          model,
          attempt,
          success: true,
          latencyMs: Date.now() - started,
          promptTokens: result.promptTokens,
          completionTokens: result.completionTokens,
          cost: result.cost,
        });
        deps.onModelSuccess?.(model);
        return { value, model };
      } catch (error) {
        await deps.log({
          model,
          attempt,
          success: false,
          error: errorMessage(error),
          latencyMs: Date.now() - started,
        });
        lastError = `${model}: ${errorMessage(error)}`;
        if (isFatal(error)) throw error;
        if (!isRetryable(error)) break; // SKIP_MODEL: go straight to the next model
        deps.onModelFailure?.(model);
        if (attempt < deps.attemptsPerModel) await wait(attempt);
      }
    }
  }
  throw new BulkAiExhaustedError(
    `AI could not complete this task; the item was kept for retry.${lastError ? ` Last error — ${lastError}` : ""}`,
  );
}
