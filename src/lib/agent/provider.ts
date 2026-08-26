import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";
import { getIntegrations, type AiProvider } from "@/lib/integrations";

/**
 * One chat interface, two providers.
 *
 * The agent runtime speaks the OpenAI-shaped message format it was written
 * against; this module keeps that surface and translates for whichever backend
 * the owner has configured in the console — Claude directly through the
 * Anthropic SDK, or any model on OpenRouter.
 *
 * Credentials come from `getIntegrations`, so switching provider or pasting a
 * new key takes effect on the next request rather than the next deploy.
 */

const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

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

export class AgentError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "AgentError";
  }
}

export async function isAgentConfigured(): Promise<boolean> {
  const { ai } = await getIntegrations();
  return ai.provider === "anthropic" ? Boolean(ai.anthropicApiKey) : Boolean(ai.openrouterApiKey);
}

export async function activeProvider(): Promise<AiProvider> {
  const { ai } = await getIntegrations();
  return ai.provider;
}

export async function chatCompletion(args: {
  messages: ChatMessage[];
  tools?: ToolSchema[];
  temperature?: number;
  maxTokens?: number;
  /** Overrides the configured model for a single call. */
  model?: string;
}): Promise<CompletionResult> {
  const { ai } = await getIntegrations();

  return ai.provider === "anthropic"
    ? completeWithClaude(args, ai)
    : completeWithOpenRouter(args, ai);
}

// --- Claude ------------------------------------------------------------------

type AiConfig = Awaited<ReturnType<typeof getIntegrations>>["ai"];

/**
 * Rebuilds the OpenAI-shaped history as Anthropic messages.
 *
 * The shapes differ in two ways that matter: Anthropic takes the system prompt
 * as its own parameter rather than a message, and tool results are user-turn
 * content blocks rather than a `tool` role. Consecutive results are gathered
 * into one user turn, which is what the API expects for parallel tool use.
 */
function toAnthropicMessages(messages: ChatMessage[]): {
  system: string;
  turns: Anthropic.MessageParam[];
} {
  const system: string[] = [];
  const turns: Anthropic.MessageParam[] = [];

  for (const message of messages) {
    if (message.role === "system") {
      system.push(message.content);
      continue;
    }

    if (message.role === "user") {
      turns.push({ role: "user", content: message.content });
      continue;
    }

    if (message.role === "assistant") {
      const blocks: Anthropic.ContentBlockParam[] = [];
      if (message.content) blocks.push({ type: "text", text: message.content });

      for (const call of message.tool_calls ?? []) {
        blocks.push({
          type: "tool_use",
          id: call.id,
          name: call.function.name,
          input: safeParse(call.function.arguments),
        });
      }

      if (blocks.length > 0) turns.push({ role: "assistant", content: blocks });
      continue;
    }

    // A tool result. Append to the previous user turn when it is already one,
    // so parallel calls come back together rather than as separate turns.
    const block: Anthropic.ContentBlockParam = {
      type: "tool_result",
      tool_use_id: message.tool_call_id,
      content: message.content,
    };

    const last = turns[turns.length - 1];
    if (last?.role === "user" && Array.isArray(last.content)) {
      last.content.push(block);
    } else {
      turns.push({ role: "user", content: [block] });
    }
  }

  return { system: system.join("\n\n"), turns };
}

function safeParse(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

async function completeWithClaude(
  args: Parameters<typeof chatCompletion>[0],
  ai: AiConfig,
): Promise<CompletionResult> {
  if (!ai.anthropicApiKey) {
    throw new AgentError(
      "The AI agent is not configured. Add a Claude API key under Settings → Integrations.",
    );
  }

  const client = new Anthropic({ apiKey: ai.anthropicApiKey });
  const model = args.model ?? ai.anthropicModel ?? "claude-opus-5";
  const { system, turns } = toAnthropicMessages(args.messages);

  const tools: Anthropic.Tool[] | undefined = args.tools?.length
    ? args.tools.map((tool) => ({
        name: tool.function.name,
        description: tool.function.description,
        input_schema: tool.function.parameters as Anthropic.Tool.InputSchema,
      }))
    : undefined;

  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model,
      max_tokens: args.maxTokens ?? 8000,
      ...(system ? { system } : {}),
      messages: turns,
      ...(tools ? { tools } : {}),
    });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      throw new AgentError("That Claude API key was rejected.", 401);
    }
    if (error instanceof Anthropic.RateLimitError) {
      throw new AgentError("Claude is rate limiting us — try again shortly.", 429);
    }
    if (error instanceof Anthropic.APIError) {
      throw new AgentError(error.message, error.status);
    }
    throw new AgentError(error instanceof Error ? error.message : String(error));
  }

  // A safety decline arrives as a normal 200, so check before reading content.
  if (response.stop_reason === "refusal") {
    throw new AgentError(
      response.stop_details?.explanation ?? "Claude declined to answer that.",
    );
  }

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();

  const toolCalls: ToolCall[] = response.content
    .filter((block): block is Anthropic.ToolUseBlock => block.type === "tool_use")
    .map((block) => ({
      id: block.id,
      type: "function" as const,
      function: { name: block.name, arguments: JSON.stringify(block.input ?? {}) },
    }));

  return {
    content: text || null,
    toolCalls,
    finishReason: response.stop_reason ?? "end_turn",
    model: response.model,
    usage: {
      prompt_tokens: response.usage.input_tokens,
      completion_tokens: response.usage.output_tokens,
      total_tokens: response.usage.input_tokens + response.usage.output_tokens,
    },
  };
}

// --- OpenRouter --------------------------------------------------------------

async function completeWithOpenRouter(
  args: Parameters<typeof chatCompletion>[0],
  ai: AiConfig,
): Promise<CompletionResult> {
  if (!ai.openrouterApiKey) {
    throw new AgentError(
      "The AI agent is not configured. Add an OpenRouter API key under Settings → Integrations.",
    );
  }

  const primary = args.model ?? ai.openrouterModel;
  const fallback = ai.openrouterFallbackModel;
  // Passed as `models` so OpenRouter retries elsewhere when a preview slug is
  // down or rate limited, which those slugs regularly are.
  const models = fallback && fallback !== primary ? [primary, fallback] : undefined;

  const response = await fetch(OPENROUTER_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ai.openrouterApiKey}`,
      "Content-Type": "application/json",
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
    throw new AgentError(
      payload?.error?.message ?? `OpenRouter request failed (${response.status}).`,
      response.status,
    );
  }

  const choice = payload?.choices?.[0];
  if (!choice?.message) throw new AgentError("OpenRouter returned no message.");

  return {
    content: choice.message.content ?? null,
    toolCalls: choice.message.tool_calls ?? [],
    finishReason: choice.finish_reason ?? "stop",
    model: payload?.model ?? primary,
    usage: payload?.usage,
  };
}

/** Cheap connectivity probe for the admin integrations panel. */
export async function pingAgent(): Promise<{ ok: boolean; model?: string; error?: string }> {
  try {
    const result = await chatCompletion({
      messages: [{ role: "user", content: "Reply with the single word: ready" }],
      maxTokens: 32,
    });
    return { ok: true, model: result.model };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
