"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Bot, Send, Loader2, User, Trash2 } from "lucide-react";
import { askAgentAction, clearAgentThreadAction } from "@/app/actions/admin/system";
import { Card, Alert } from "@/components/ui";
import { cn } from "@/lib/utils";

type Turn = { id: string; role: "user" | "assistant"; content: string; createdAt: string };

const SUGGESTIONS = [
  "What sold best this week?",
  "Which products are low on stock?",
  "Create a 15% code called WEEKEND15 that expires in 3 days",
  "Show me orders waiting to be shipped",
];

export function AgentConsole({
  transcript,
  threadId,
  enabled,
  requiresApproval,
}: {
  transcript: Turn[];
  threadId: string | null;
  enabled: boolean;
  requiresApproval: boolean;
}) {
  const [state, action, pending] = useActionState<
    { reply?: string; error?: string } | null,
    FormData
  >(askAgentAction, null);

  const [draft, setDraft] = useState("");
  const [clearing, startClear] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Keep the newest turn in view as the conversation grows. Scrolling is a DOM
  // side effect, which is exactly what an effect is for.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [transcript.length, state?.reply]);

  /**
   * Dispatches the action with FormData built here rather than submitting the
   * form element. That lets a suggestion chip and the textarea share one path,
   * and lets the draft clear immediately without an effect.
   */
  function send(text?: string) {
    const message = (text ?? draft).trim();
    if (!message || pending) return;

    const formData = new FormData();
    formData.set("message", message);
    action(formData);
    setDraft("");
  }

  return (
    <Card className="flex h-[36rem] flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] px-5 py-3">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4" aria-hidden />
          <h2 className="text-sm font-medium">Store agent</h2>
          {requiresApproval ? (
            <span className="text-xs text-[var(--text-muted)]">
              · changes need your confirmation
            </span>
          ) : (
            <span className="text-xs text-warning">· applies changes immediately</span>
          )}
        </div>

        {threadId ? (
          <button
            type="button"
            disabled={clearing}
            onClick={() => {
              if (!confirm("Clear this conversation?")) return;
              startClear(async () => {
                await clearAgentThreadAction(threadId);
              });
            }}
            className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)] hover:text-danger"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
            Clear
          </button>
        ) : null}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4">
        {transcript.length === 0 && !state?.reply ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <Bot className="h-8 w-8 text-[var(--text-muted)]" aria-hidden />
            <p className="max-w-sm text-sm text-[var(--text-secondary)]">
              Ask about the shop, or tell it what to change. It looks things up before it acts.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  disabled={!enabled}
                  onClick={() => send(suggestion)}
                  className="rounded-full border border-[var(--border-subtle)] px-3 py-1.5 text-xs text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-40"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ol className="flex flex-col gap-4">
            {transcript.map((turn) => (
              <Turn key={turn.id} role={turn.role} content={turn.content} />
            ))}

            {/* Optimistic echo of the reply before revalidation lands. */}
            {state?.reply &&
            !transcript.some((t) => t.role === "assistant" && t.content === state.reply) ? (
              <Turn role="assistant" content={state.reply} />
            ) : null}

            {pending ? (
              <li className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                Thinking…
              </li>
            ) : null}
          </ol>
        )}
      </div>

      {state?.error ? (
        <div className="px-5 pb-3">
          <Alert tone="danger">{state.error}</Alert>
        </div>
      ) : null}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
        className="flex items-end gap-2 border-t border-[var(--border-subtle)] px-5 py-3"
      >
        <label htmlFor="message" className="sr-only">
          Message the agent
        </label>
        <textarea
          id="message"
          name="message"
          rows={1}
          value={draft}
          disabled={!enabled || pending}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              send();
            }
          }}
          placeholder={
            enabled ? "Ask or instruct… (Enter to send, Shift+Enter for a new line)" : "Add OPENROUTER_API_KEY to enable"
          }
          className="lx-field max-h-32 flex-1 resize-none py-2.5"
        />

        <button
          type="submit"
          disabled={!enabled || pending || !draft.trim()}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-(--radius-card) bg-[var(--accent)] text-[var(--accent-contrast)] disabled:opacity-40"
          aria-label="Send"
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Send className="h-4 w-4" aria-hidden />
          )}
        </button>
      </form>
    </Card>
  );
}

function Turn({ role, content }: { role: "user" | "assistant"; content: string }) {
  const isUser = role === "user";

  return (
    <li className={cn("flex gap-3", isUser && "flex-row-reverse")}>
      <span
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
          isUser ? "bg-[var(--surface-sunken)]" : "bg-ink-900 text-white",
        )}
        aria-hidden
      >
        {isUser ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
      </span>

      <div
        className={cn(
          "max-w-[85%] whitespace-pre-wrap rounded-(--radius-card) px-3.5 py-2.5 text-sm",
          isUser
            ? "bg-[var(--surface-sunken)]"
            : "border border-[var(--border-subtle)] bg-[var(--surface-raised)]",
        )}
      >
        {content}
      </div>
    </li>
  );
}
