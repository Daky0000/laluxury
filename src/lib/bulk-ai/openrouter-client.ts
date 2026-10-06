import { env } from "@/lib/env";
import { BulkAiError, classifyHttpStatus } from "./retry";

/**
 * One OpenRouter chat completion for one model. Server/worker only.
 *
 * Deliberately sends a single `model` and never a `models` list: OpenRouter may
 * still move the request to another *provider* of the same model (its own
 * failover), but switching to a different model is the router's decision,
 * after three attempts on this one.
 */

export const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
/** NVIDIA NIM's OpenAI-compatible endpoint (build.nvidia.com). */
export const NVIDIA_ENDPOINT = "https://integrate.api.nvidia.com/v1/chat/completions";

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type ChatMessage = { role: "system" | "user"; content: string | ContentPart[] };

export type OpenRouterResult = {
  content: string;
  model: string;
  promptTokens?: number;
  completionTokens?: number;
  cost?: number;
};

/** Models that rejected response_format once; JSON-by-prompt from then on. */
const g = globalThis as unknown as { bulkAiNoSchema?: Set<string> };
const noStructured = (g.bulkAiNoSchema ??= new Set());

export async function callOpenRouter(args: {
  /** Defaults to OpenRouter. NVIDIA gets plain JSON-by-prompt (no response_format). */
  vendor?: "OPENROUTER" | "NVIDIA";
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  jsonSchema?: { name: string; schema: Record<string, unknown> };
  maxTokens?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<OpenRouterResult> {
  const nvidia = args.vendor === "NVIDIA";
  if (!args.apiKey) throw new BulkAiError(`No ${nvidia ? "NVIDIA" : "OpenRouter"} API key is configured.`, "FATAL");

  const useSchema = !nvidia && Boolean(args.jsonSchema) && !noStructured.has(args.model);
  try {
    return await send(args, useSchema);
  } catch (error) {
    // Structured outputs are preferred, but not every free endpoint has them.
    // Fall back to JSON-by-prompt within the same attempt.
    // Free providers often reject structured outputs with only a generic
    // "Provider returned error". Try once more as plain JSON-by-prompt.
    if (
      useSchema &&
      error instanceof BulkAiError &&
      error.status !== 401 &&
      error.status !== 429 &&
      (error.status === 400 || /provider returned error|response_format|json_schema|structured/i.test(error.message))
    ) {
      const result = await send(args, false);
      noStructured.add(args.model); // only remembered once plain JSON is proven to work
      return result;
    }
    throw error;
  }
}

async function send(
  args: Parameters<typeof callOpenRouter>[0],
  useSchema: boolean,
): Promise<OpenRouterResult> {
  const timeout = AbortSignal.timeout(args.timeoutMs ?? 90_000);
  const signal = args.signal ? AbortSignal.any([args.signal, timeout]) : timeout;

  const nvidia = args.vendor === "NVIDIA";
  let response: Response;
  try {
    response = await fetch(nvidia ? NVIDIA_ENDPOINT : OPENROUTER_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${args.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(nvidia ? {} : { "HTTP-Referer": env.siteUrl(), "X-Title": "Noble Enclave Bulk Product Add" }),
      },
      body: JSON.stringify({
        model: args.model,
        messages: args.messages,
        temperature: 0.2,
        max_tokens: args.maxTokens ?? 1500,
        stream: false,
        ...(nvidia
          ? {}
          : {
              usage: { include: true },
              // Provider-level failover only; never another model.
              provider: { allow_fallbacks: true },
            }),
        ...(useSchema && args.jsonSchema
          ? {
              response_format: {
                type: "json_schema",
                json_schema: { name: args.jsonSchema.name, strict: true, schema: args.jsonSchema.schema },
              },
            }
          : {}),
      }),
      cache: "no-store",
      signal,
    });
  } catch (error) {
    if (args.signal?.aborted) throw new BulkAiError("Cancelled.", "FATAL");
    const timedOut = timeout.aborted;
    throw new BulkAiError(timedOut ? "Request timed out." : `Network error: ${String(error)}`, "RETRYABLE");
  }

  const payload = (await response.json().catch(() => null)) as {
    choices?: { message?: { content?: string | null } }[];
    model?: string;
    usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
    error?: { message?: string; code?: number; metadata?: { raw?: unknown; provider_name?: string } } | string;
    // NVIDIA NIM reports failures as RFC 7807 problem details.
    detail?: string;
    title?: string;
  } | null;

  const retryAfterMs = parseRetryAfter(response.headers.get("retry-after"));
  const err = typeof payload?.error === "string" ? { message: payload.error } : payload?.error;

  if (!response.ok) {
    const fallback = payload?.detail || payload?.title || `${nvidia ? "NVIDIA" : "OpenRouter"} request failed (${response.status}).`;
    const message = describeError(err, fallback);
    throw new BulkAiError(message, classifyHttpStatus(response.status, message), response.status, retryAfterMs);
  }
  // OpenRouter can answer 200 with an error body when the upstream failed mid-way.
  if (err) {
    const status = Number((err as { code?: number }).code) || 502;
    const message = describeError(err, "Provider error.");
    throw new BulkAiError(message, classifyHttpStatus(status, message), status, retryAfterMs);
  }

  const content = payload?.choices?.[0]?.message?.content?.trim() ?? "";
  if (!content) throw new BulkAiError("The model returned an empty response.", "RETRYABLE");

  return {
    content,
    model: payload?.model ?? args.model,
    promptTokens: payload?.usage?.prompt_tokens,
    completionTokens: payload?.usage?.completion_tokens,
    cost: payload?.usage?.cost,
  };
}

/** Retry-After as seconds or an HTTP date; capped at a minute. */
function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const secs = Number(value);
  const ms = Number.isFinite(secs) ? secs * 1000 : Date.parse(value) - Date.now();
  return ms > 0 ? Math.min(60_000, ms) : undefined;
}

/**
 * OpenRouter's top-level message is often just "Provider returned error";
 * the provider's own reason is in metadata.raw. Keep both, briefly.
 */
function describeError(
  error: { message?: string; metadata?: { raw?: unknown; provider_name?: string } } | undefined,
  fallback: string,
): string {
  const base = error?.message ?? fallback;
  const raw = error?.metadata?.raw;
  const detail = typeof raw === "string" ? raw : raw ? JSON.stringify(raw) : "";
  const provider = error?.metadata?.provider_name ? ` [${error.metadata.provider_name}]` : "";
  return `${base}${provider}${detail ? `: ${detail.slice(0, 300)}` : ""}`;
}

/** Pulls the first JSON object out of a reply, tolerating code fences and prose. */
export function extractJson(content: string): unknown {
  // Reasoning models may think out loud first.
  content = content.replace(/<think>[\s\S]*?<\/think>/gi, "");
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const text = (fenced ? fenced[1] : content).trim();
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        /* fall through */
      }
    }
    throw new BulkAiError("The model did not return valid JSON.", "RETRYABLE");
  }
}
