"use client";

import { useActionState, useState, useTransition } from "react";
import { Loader2, Trash2, Check, X, Copy } from "lucide-react";
import {
  linkAgentIdentityAction,
  removeAgentIdentityAction,
  resolveAgentActionAction,
  testAgentAction,
} from "@/app/actions/admin/system";
import type { AdminState } from "@/app/actions/admin/products";
import { Card, Field, Alert, Badge } from "@/components/ui";
import { relativeTime, cn } from "@/lib/utils";

type Identity = {
  id: string;
  channel: "SLACK" | "WHATSAPP" | "WEB";
  externalId: string;
  label: string | null;
  isActive: boolean;
};

type Staff = { id: string; email: string; name: string; role: string };

/**
 * Changes the agent parked for approval, with the exact call it wants to make
 * so the owner is never approving something vague.
 */
export function PendingActionsList({
  actions,
}: {
  actions: { id: string; tool: string; args: Record<string, unknown>; channel: string; createdAt: string }[];
}) {
  const [busy, startBusy] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <div className="flex flex-col gap-3">
      {message ? <Alert tone={message.ok ? "success" : "danger"}>{message.text}</Alert> : null}

      <ul className="flex flex-col gap-2">
        {actions.map((action) => (
          <li
            key={action.id}
            className="flex flex-wrap items-center gap-3 rounded-(--radius-card) border border-[var(--border-subtle)] px-4 py-3"
          >
            <div className="min-w-0 flex-1">
              <p className="font-mono text-xs">{action.tool}</p>
              <p className="mt-0.5 truncate text-xs text-[var(--text-secondary)]">
                {Object.entries(action.args)
                  .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
                  .join(", ")}
              </p>
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                via {action.channel.toLowerCase()} · {relativeTime(action.createdAt)}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  startBusy(async () => {
                    const result = await resolveAgentActionAction(action.id, true);
                    setMessage({ ok: result.ok, text: result.message ?? "" });
                  })
                }
                className="flex items-center gap-1.5 rounded-(--radius-card) bg-success px-3 py-1.5 text-xs text-white disabled:opacity-50"
              >
                <Check className="h-3.5 w-3.5" aria-hidden />
                Approve
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  startBusy(async () => {
                    const result = await resolveAgentActionAction(action.id, false);
                    setMessage({ ok: result.ok, text: result.message ?? "" });
                  })
                }
                className="flex items-center gap-1.5 rounded-(--radius-card) border border-[var(--border-subtle)] px-3 py-1.5 text-xs disabled:opacity-50"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
                Reject
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AgentIdentityManager({
  identities,
  staff,
  slackReady,
  whatsappReady,
  siteUrl,
}: {
  identities: Identity[];
  staff: Staff[];
  slackReady: boolean;
  whatsappReady: boolean;
  siteUrl: string;
}) {
  const [state, action, pending] = useActionState<AdminState | null, FormData>(
    linkAgentIdentityAction,
    null,
  );
  const [channel, setChannel] = useState<"SLACK" | "WHATSAPP">("SLACK");
  const [busy, startBusy] = useTransition();
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const webhooks = [
    { label: "Slack events", url: `${siteUrl}/api/webhooks/slack`, ready: slackReady },
    { label: "WhatsApp callback", url: `${siteUrl}/api/webhooks/whatsapp`, ready: whatsappReady },
    { label: "Paystack webhook", url: `${siteUrl}/api/webhooks/paystack`, ready: true },
  ];

  function copy(url: string) {
    navigator.clipboard?.writeText(url).then(
      () => {
        setCopied(url);
        setTimeout(() => setCopied(null), 1500);
      },
      () => {},
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Linked identities */}
      <Card className="p-5">
        <h2 className="lx-eyebrow mb-1">Who the agent trusts</h2>
        <p className="mb-4 text-sm text-[var(--text-secondary)]">
          Link a Slack member ID or WhatsApp number to a staff account. Messages from anyone
          unlinked are answered politely but cannot change anything.
        </p>

        {identities.length > 0 ? (
          <ul className="mb-5 flex flex-col gap-2">
            {identities.map((identity) => (
              <li
                key={identity.id}
                className="flex items-center gap-3 rounded-(--radius-card) border border-[var(--border-subtle)] px-3 py-2.5"
              >
                <Badge tone={identity.channel === "SLACK" ? "info" : "success"}>
                  {identity.channel.toLowerCase()}
                </Badge>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-xs">{identity.externalId}</p>
                  <p className="truncate text-xs text-[var(--text-muted)]">{identity.label}</p>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (!confirm(`Unlink ${identity.externalId}?`)) return;
                    startBusy(async () => {
                      await removeAgentIdentityAction(identity.id);
                    });
                  }}
                  className="text-[var(--text-secondary)] hover:text-danger"
                  aria-label={`Unlink ${identity.externalId}`}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-5 text-sm text-[var(--text-muted)]">Nobody linked yet.</p>
        )}

        <form action={action} className="flex flex-col gap-3">
          {state?.message ? (
            <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Channel" htmlFor="channel">
              <select
                id="channel"
                name="channel"
                value={channel}
                onChange={(event) => setChannel(event.target.value as "SLACK" | "WHATSAPP")}
                className="lx-field"
              >
                <option value="SLACK">Slack</option>
                <option value="WHATSAPP">WhatsApp</option>
              </select>
            </Field>

            <Field
              label={channel === "SLACK" ? "Slack member ID" : "WhatsApp number"}
              htmlFor="externalId"
              hint={
                channel === "SLACK"
                  ? "Profile → More → Copy member ID"
                  : "With country code, e.g. 233241234567"
              }
            >
              <input
                id="externalId"
                name="externalId"
                placeholder={channel === "SLACK" ? "U01ABCDEFGH" : "233241234567"}
                className="lx-field font-mono text-xs"
              />
            </Field>
          </div>

          <Field label="Acts as" htmlFor="userId">
            <select id="userId" name="userId" className="lx-field">
              <option value="">Choose a staff account</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.role.toLowerCase()})
                </option>
              ))}
            </select>
          </Field>

          <button
            type="submit"
            disabled={pending}
            className="flex items-center justify-center gap-2 rounded-(--radius-card) bg-[var(--accent)] px-4 py-2.5 text-sm text-[var(--accent-contrast)] disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Link identity
          </button>
        </form>
      </Card>

      {/* Setup */}
      <Card className="p-5">
        <h2 className="lx-eyebrow mb-1">Connect the channels</h2>
        <p className="mb-4 text-sm text-[var(--text-secondary)]">
          Paste these URLs into each provider, then add the keys to your environment.
        </p>

        <ul className="mb-5 flex flex-col gap-2">
          {webhooks.map((hook) => (
            <li key={hook.url} className="rounded-(--radius-card) border border-[var(--border-subtle)] p-3">
              <div className="flex items-center gap-2">
                <span className="text-sm">{hook.label}</span>
                <Badge tone={hook.ready ? "success" : "neutral"}>
                  {hook.ready ? "keys set" : "keys missing"}
                </Badge>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded bg-[var(--surface-sunken)] px-2 py-1 text-xs">
                  {hook.url}
                </code>
                <button
                  type="button"
                  onClick={() => copy(hook.url)}
                  className={cn(
                    "shrink-0 rounded p-1.5 text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]",
                    copied === hook.url && "text-success",
                  )}
                  aria-label={`Copy ${hook.label} URL`}
                >
                  {copied === hook.url ? (
                    <Check className="h-3.5 w-3.5" aria-hidden />
                  ) : (
                    <Copy className="h-3.5 w-3.5" aria-hidden />
                  )}
                </button>
              </div>
            </li>
          ))}
        </ul>

        <div className="rounded-(--radius-card) bg-[var(--surface-sunken)] p-3 text-xs text-[var(--text-secondary)]">
          <p className="mb-1.5 font-medium text-[var(--text-primary)]">Slack scopes needed</p>
          <p className="font-mono">
            app_mentions:read, chat:write, im:history, im:read, im:write, users:read
          </p>
          <p className="mt-2 mb-1.5 font-medium text-[var(--text-primary)]">Subscribe to events</p>
          <p className="font-mono">app_mention, message.im</p>
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={() =>
            startBusy(async () => {
              const result = await testAgentAction();
              setTestResult({ ok: result.ok, text: result.message ?? "" });
            })
          }
          className="mt-4 w-full rounded-(--radius-card) border border-[var(--border-subtle)] px-4 py-2.5 text-sm disabled:opacity-50"
        >
          {busy ? "Testing…" : "Test the OpenRouter connection"}
        </button>

        {testResult ? (
          <div className="mt-3">
            <Alert tone={testResult.ok ? "success" : "danger"}>{testResult.text}</Alert>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
