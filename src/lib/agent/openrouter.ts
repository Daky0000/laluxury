import { env } from "@/lib/env";

/**
 * Minimal OpenRouter chat-completions client.
 *
 * Model choice is entirely env-driven: set OPENROUTER_MODEL and the agent uses
 * it. OPENROUTER_FALLBACK_MODEL is passed in the `models` array so OpenRouter
 * transparently retries on another model if the primary is down or rate
 * limited, which matters for alpha/preview slugs that come and go.
 */

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

export type ToolSchema = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type ChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; content: string; tool_call_id: string };

export type CompletionResult = {
  content: string | null;
  toolCalls: ToolCall[];
  finishReason: string;
  model: string;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
};

export class OpenRouterError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "OpenRouterError";
  }
}

export function isAgentConfigured(): boolean {
  return env.openrouter.isConfigured();
}

export async function chatCompletion(args: {
  messages: ChatMessage[];
  tools?: ToolSchema[];
  temperature?: number;
  maxTokens?: number;
  /** Overrides OPENROUTER_MODEL for a single call. */
  model?: string;
}): Promise<CompletionResult> {
  const apiKey = env.openrouter.apiKey();
  if (!apiKey) {
    throw new OpenRouterError(
      "The AI agent is not configured. Add OPENROUTER_API_KEY to your environment.",
    );
  }

  const primary = args.model ?? env.openrouter.model();
  const fallback = env.openrouter.fallbackModel();
  const models = fallback && fallback !== primary ? [primary, fallback] : undefined;

  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      // OpenRouter uses these for attribution on its dashboard.
      "HTTP-Referer": env.siteUrl(),
      "X-Title": "LaLuxury Store Agent",
    },
    body: JSON.stringify({
      model: primary,
      ...(models ? { models } : {}),
      messages: args.messages,
      ...(args.tools?.length ? { tools: args.tools, tool_choice: "auto" } : {}),
      temperature: args.temperature ?? 0.2,
      max_tokens: args.maxTokens ?? 2000,
    }),
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as {
    choices?: {
      message?: { content?: string | null; tool_calls?: ToolCall[] };
      finish_reason?: string;
    }[];
    model?: string;
    usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    error?: { message?: string };
  } | null;

  if (!response.ok) {
    throw new OpenRouterError(
      payload?.error?.message ?? `OpenRouter request failed (${response.status}).`,
      response.status,
    );
  }

  const choice = payload?.choices?.[0];
  if (!choice?.message) {
    throw new OpenRouterError("OpenRouter returned no message.");
  }

  return {
    content: choice.message.content ?? null,
    toolCalls: choice.message.tool_calls ?? [],
    finishReason: choice.finish_reason ?? "stop",
    model: payload?.model ?? primary,
    usage: payload?.usage,
  };
}

/** Cheap connectivity probe for the admin integrations panel. */
export async function pingOpenRouter(): Promise<{ ok: boolean; model?: string; error?: string }> {
  try {
    const result = await chatCompletion({
      messages: [{ role: "user", content: "Reply with the single word: ready" }],
      maxTokens: 10,
    });
    return { ok: true, model: result.model };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
