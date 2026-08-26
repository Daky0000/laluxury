import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { chatCompletion, type ChatMessage, type ToolCall } from "./provider";
import {
  executeTool,
  isMutating,
  summariseCall,
  toolSchemasFor,
  type AgentContext,
} from "./tools";
import type { AgentChannel, Role } from "@/generated/prisma";

/**
 * The store agent.
 *
 * One conversation per Slack thread / WhatsApp number. The loop is:
 *   user message -> model -> tool calls -> results -> model -> reply.
 *
 * Anything that mutates the live store is held behind a confirmation when
 * `agentRequiresApproval` is on: the agent describes what it is about to do,
 * parks the calls as AgentActions, and executes them only after the owner says
 * yes. That keeps a mistyped WhatsApp message from repricing the catalog.
 */

const MAX_TOOL_ROUNDS = 5;
const HISTORY_LIMIT = 24;

const CONFIRM = /^\s*(yes|y|yeah|yep|ok|okay|confirm|approved?|do it|go ahead|proceed|sure|please do)\b/i;
const REJECT = /^\s*(no|n|nope|cancel|stop|don'?t|abort|nevermind|never mind|reject)\b/i;

export type AgentReply = {
  text: string;
  threadId: string;
  executed: string[];
  pending: string[];
};

/** Resolves who is talking to the agent, and what they may do. */
export async function resolveIdentity(
  channel: AgentChannel,
  externalId: string,
): Promise<{ userId: string | null; role: Role; label: string | null }> {
  const identity = await db.agentIdentity.findUnique({
    where: { channel_externalId: { channel, externalId } },
  });

  if (!identity || !identity.isActive) {
    return { userId: null, role: "CUSTOMER", label: null };
  }

  const user = await db.user.findUnique({ where: { id: identity.userId } });
  if (!user || !user.isActive) return { userId: null, role: "CUSTOMER", label: null };

  return { userId: user.id, role: user.role, label: identity.label ?? user.email };
}

async function getOrCreateThread(channel: AgentChannel, externalId: string, userId: string | null) {
  return db.agentThread.upsert({
    where: { channel_externalId: { channel, externalId } },
    create: { channel, externalId, userId },
    update: { lastMessageAt: new Date(), ...(userId ? { userId } : {}) },
  });
}

async function loadHistory(threadId: string): Promise<ChatMessage[]> {
  const rows = await db.agentMessage.findMany({
    where: { threadId },
    orderBy: { createdAt: "desc" },
    take: HISTORY_LIMIT,
  });

  const messages: ChatMessage[] = [];
  for (const row of rows.reverse()) {
    if (row.role === "user") {
      messages.push({ role: "user", content: row.content });
    } else if (row.role === "assistant") {
      messages.push({
        role: "assistant",
        content: row.content || null,
        ...(row.toolCalls ? { tool_calls: row.toolCalls as unknown as ToolCall[] } : {}),
      });
    } else if (row.role === "tool" && row.toolCallId) {
      messages.push({ role: "tool", content: row.content, tool_call_id: row.toolCallId });
    }
  }

  // A tool message with no preceding assistant tool_calls breaks the API
  // contract, which can happen if a turn was interrupted mid-flight.
  return messages.filter((m, i) => !(m.role === "tool" && i === 0));
}

async function persist(
  threadId: string,
  role: string,
  content: string,
  extra?: { toolCalls?: unknown; toolCallId?: string },
) {
  await db.agentMessage.create({
    data: {
      threadId,
      role,
      content,
      toolCalls: extra?.toolCalls as never,
      toolCallId: extra?.toolCallId,
    },
  });
}

async function systemPrompt(ctx: {
  role: Role;
  label: string | null;
  channel: AgentChannel;
  requiresApproval: boolean;
}): Promise<string> {
  const settings = await getSettings();

  const [productCount, pendingOrders, lowStock] = await Promise.all([
    db.product.count({ where: { status: "ACTIVE" } }),
    db.order.count({ where: { status: { in: ["PAID", "PROCESSING"] } } }),
    db.inventoryItem.count({ where: { trackInventory: true, onHand: { lte: 5 } } }),
  ]);

  const isStaff = ctx.role !== "CUSTOMER";

  return [
    `You are the operations agent for ${settings.storeName}, an online homeware store in Ghana.`,
    `You are talking to ${ctx.label ?? "an unrecognised person"} over ${ctx.channel.toLowerCase()}. Their role is ${ctx.role}.`,
    "",
    "Store snapshot right now:",
    `- ${productCount} active products`,
    `- ${pendingOrders} orders waiting to be fulfilled`,
    `- ${lowStock} variants low on stock`,
    `- Prices are in Ghana cedis (GHS). Always talk in cedis, never pesewas.`,
    "",
    isStaff
      ? "This person is staff. Help them run the store: look things up, change prices, manage stock, create discounts, move orders along."
      : "This person is NOT a recognised staff member. Answer general questions about the store politely, but refuse any request to change data and tell them to contact the owner.",
    "",
    "How to work:",
    "- Look things up before you change them. Never guess a SKU or an order number.",
    "- Be concise. These are chat messages, not reports. A few short lines, no headings.",
    "- When you change something, say plainly what changed, including the before and after.",
    "- If a request is ambiguous, ask one clarifying question instead of guessing.",
    "- If a tool returns an error, explain it in plain language and suggest the fix.",
    ctx.requiresApproval
      ? "- Changes need the owner's confirmation. Propose the change, and it will be held until they reply yes."
      : "- You may apply changes directly, but still report exactly what you did.",
  ].join("\n");
}

/** Executes AgentActions that were parked awaiting a yes. */
async function runPendingActions(threadId: string, ctx: AgentContext): Promise<string[]> {
  const pending = await db.agentAction.findMany({
    where: { threadId, status: "AWAITING_APPROVAL" },
    orderBy: { createdAt: "asc" },
  });

  const done: string[] = [];

  for (const action of pending) {
    const result = await executeTool(
      action.tool,
      action.args as Record<string, unknown>,
      ctx,
    );
    const failed = "error" in result;

    await db.agentAction.update({
      where: { id: action.id },
      data: {
        status: failed ? "FAILED" : "EXECUTED",
        result: result as never,
        error: failed ? String((result as { error: string }).error) : null,
        actorId: ctx.userId,
        executedAt: new Date(),
      },
    });

    done.push(
      failed
        ? `${summariseCall(action.tool, action.args as Record<string, unknown>)} - failed: ${(result as { error: string }).error}`
        : `${summariseCall(action.tool, action.args as Record<string, unknown>)} - done`,
    );
  }

  return done;
}

async function rejectPendingActions(threadId: string): Promise<number> {
  const { count } = await db.agentAction.updateMany({
    where: { threadId, status: "AWAITING_APPROVAL" },
    data: { status: "REJECTED" },
  });
  return count;
}

/**
 * Handles one inbound message end to end and returns the text to send back.
 */
export async function runAgentTurn(args: {
  channel: AgentChannel;
  externalId: string;
  message: string;
  /** Slack user id or WhatsApp phone, used to resolve permissions. */
  senderId: string;
}): Promise<AgentReply> {
  const identity = await resolveIdentity(args.channel, args.senderId);
  const thread = await getOrCreateThread(args.channel, args.externalId, identity.userId);
  const settings = await getSettings();

  const ctx: AgentContext = {
    userId: identity.userId,
    role: identity.role,
    threadId: thread.id,
    source: args.channel === "SLACK" ? "slack" : args.channel === "WHATSAPP" ? "whatsapp" : "web",
  };

  await persist(thread.id, "user", args.message);

  // --- Confirmation shortcut ------------------------------------------------
  const hasPending =
    (await db.agentAction.count({ where: { threadId: thread.id, status: "AWAITING_APPROVAL" } })) > 0;

  if (hasPending && CONFIRM.test(args.message)) {
    const done = await runPendingActions(thread.id, ctx);
    const text = done.length ? `Done:\n${done.map((d) => `- ${d}`).join("\n")}` : "Nothing was pending.";
    await persist(thread.id, "assistant", text);
    return { text, threadId: thread.id, executed: done, pending: [] };
  }

  if (hasPending && REJECT.test(args.message)) {
    const count = await rejectPendingActions(thread.id);
    const text = `Cancelled ${count} pending change${count === 1 ? "" : "s"}. Nothing was applied.`;
    await persist(thread.id, "assistant", text);
    return { text, threadId: thread.id, executed: [], pending: [] };
  }

  // Any other message supersedes stale proposals.
  if (hasPending) await rejectPendingActions(thread.id);

  // --- Model loop -----------------------------------------------------------
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: await systemPrompt({
        role: identity.role,
        label: identity.label,
        channel: args.channel,
        requiresApproval: settings.agentRequiresApproval,
      }),
    },
    ...(await loadHistory(thread.id)),
  ];

  const tools = toolSchemasFor(identity.role);
  const executed: string[] = [];
  const pending: string[] = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const completion = await chatCompletion({ messages, tools });

    if (completion.toolCalls.length === 0) {
      const text = completion.content?.trim() || "I did not have a reply for that.";
      await persist(thread.id, "assistant", text);
      return { text, threadId: thread.id, executed, pending };
    }

    messages.push({
      role: "assistant",
      content: completion.content,
      tool_calls: completion.toolCalls,
    });
    await persist(thread.id, "assistant", completion.content ?? "", {
      toolCalls: completion.toolCalls,
    });

    let parkedThisRound = false;

    for (const call of completion.toolCalls) {
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(call.function.arguments || "{}");
      } catch {
        parsed = {};
      }

      const needsApproval = settings.agentRequiresApproval && isMutating(call.function.name);

      if (needsApproval) {
        await db.agentAction.create({
          data: {
            threadId: thread.id,
            tool: call.function.name,
            args: parsed as never,
            status: "AWAITING_APPROVAL",
            actorId: identity.userId,
          },
        });

        const summary = summariseCall(call.function.name, parsed);
        pending.push(summary);
        parkedThisRound = true;

        const note = `Waiting for confirmation: ${summary}`;
        messages.push({ role: "tool", content: note, tool_call_id: call.id });
        await persist(thread.id, "tool", note, { toolCallId: call.id });
        continue;
      }

      const result = await executeTool(call.function.name, parsed, ctx);
      const serialised = JSON.stringify(result);

      if (isMutating(call.function.name) && !("error" in result)) {
        executed.push(summariseCall(call.function.name, parsed));
        await db.agentAction.create({
          data: {
            threadId: thread.id,
            tool: call.function.name,
            args: parsed as never,
            status: "EXECUTED",
            result: result as never,
            actorId: identity.userId,
            executedAt: new Date(),
          },
        });
      }

      messages.push({ role: "tool", content: serialised, tool_call_id: call.id });
      await persist(thread.id, "tool", serialised, { toolCallId: call.id });
    }

    // Ask for the yes rather than burning another model round on it.
    if (parkedThisRound) {
      const text = [
        pending.length === 1 ? "I am about to:" : "I am about to:",
        ...pending.map((p) => `- ${p}`),
        "",
        "Reply *yes* to apply, or *no* to cancel.",
      ].join("\n");

      await persist(thread.id, "assistant", text);
      return { text, threadId: thread.id, executed, pending };
    }
  }

  const text = "That needed more steps than I am allowed in one go. Try narrowing the request.";
  await persist(thread.id, "assistant", text);
  return { text, threadId: thread.id, executed, pending };
}
