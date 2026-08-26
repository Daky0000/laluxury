import type { Metadata } from "next";
import Link from "next/link";
import { Bot, Hash, MessageCircle, Globe } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/auth/rbac";
import { env } from "@/lib/env";
import { getIntegrations, isReady } from "@/lib/integrations";
import { getSettings } from "@/lib/settings";
import { AGENT_TOOLS, toolSchemasFor } from "@/lib/agent/tools";
import { formatDate } from "@/lib/utils";
import { Card, Badge, SectionHeading, Alert } from "@/components/ui";
import { AgentConsole } from "@/components/admin/agent-console";
import {
  AgentIdentityManager,
  PendingActionsList,
} from "@/components/admin/agent-identity-manager";

export const metadata: Metadata = { title: "AI agent" };

export default async function AdminAgentPage() {
  const user = await requirePermission("agent:use");
  const settings = await getSettings();

  const externalId = `web:${user.id}`;

  const [thread, identities, staff, pendingActions, recentActions] = await Promise.all([
    db.agentThread.findUnique({
      where: { channel_externalId: { channel: "WEB", externalId } },
      include: {
        messages: { orderBy: { createdAt: "asc" }, take: 40 },
      },
    }),
    db.agentIdentity.findMany({
      where: { channel: { in: ["SLACK", "WHATSAPP"] } },
      orderBy: { createdAt: "desc" },
    }),
    db.user.findMany({
      where: { role: { not: "CUSTOMER" }, isActive: true },
      orderBy: { email: "asc" },
      select: { id: true, email: true, firstName: true, lastName: true, role: true },
    }),
    db.agentAction.findMany({
      where: { status: "AWAITING_APPROVAL" },
      orderBy: { createdAt: "desc" },
      include: { thread: { select: { channel: true, externalId: true } } },
    }),
    db.agentAction.findMany({
      where: { status: { in: ["EXECUTED", "FAILED", "REJECTED"] } },
      orderBy: { createdAt: "desc" },
      take: 15,
      include: { thread: { select: { channel: true } } },
    }),
  ]);

  const availableTools = toolSchemasFor(user.role);
  const canConfigure = can(user.role, "agent:configure");

  // Only conversational turns belong in the console transcript.
  const transcript = (thread?.messages ?? [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && m.content.trim().length > 0)
    .map((m) => ({
      id: m.id,
      role: m.role as "user" | "assistant",
      content: m.content,
      createdAt: m.createdAt.toISOString(),
    }));

  const integrations = await getIntegrations();
  const agentReady = isReady(integrations, "ai");

  const channels = [
    { key: "WEB", label: "Admin console", icon: Globe, ready: agentReady },
    { key: "SLACK", label: "Slack", icon: Hash, ready: isReady(integrations, "slack") },
    {
      key: "WHATSAPP",
      label: "WhatsApp",
      icon: MessageCircle,
      ready: isReady(integrations, "whatsapp"),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading
        eyebrow="One agent, three doors"
        title="AI agent"
        description="Ask it to look things up or change the store. The same agent answers here, in Slack and on WhatsApp, with the permissions of whoever is talking to it."
      />

      {!agentReady ? (
        <Alert tone="warning">
          The agent is switched off. Paste a Claude or OpenRouter key under{" "}
          <Link href="/admin/settings" className="underline underline-offset-4">
            Settings → Integrations
          </Link>{" "}
          — one key is all it needs to start working here.
        </Alert>
      ) : null}

      {/* Channel status */}
      <div className="grid gap-4 sm:grid-cols-3">
        {channels.map((channel) => (
          <Card key={channel.key} className="flex items-center gap-3 p-4">
            <channel.icon
              className={channel.ready ? "h-5 w-5 text-success" : "h-5 w-5 text-[var(--text-muted)]"}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm">{channel.label}</p>
              <p className="text-xs text-[var(--text-muted)]">
                {channel.ready ? "Connected" : "Not configured"}
              </p>
            </div>
            <Badge tone={channel.ready ? "success" : "neutral"}>
              {channel.ready ? "on" : "off"}
            </Badge>
          </Card>
        ))}
      </div>

      {/* Pending approvals */}
      {pendingActions.length > 0 ? (
        <Card className="border-warning/40 p-5">
          <h2 className="lx-eyebrow mb-3">
            {pendingActions.length} change{pendingActions.length === 1 ? "" : "s"} awaiting approval
          </h2>
          <PendingActionsList
            actions={pendingActions.map((a) => ({
              id: a.id,
              tool: a.tool,
              args: a.args as Record<string, unknown>,
              channel: a.thread.channel,
              createdAt: a.createdAt.toISOString(),
            }))}
          />
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <AgentConsole
          transcript={transcript}
          threadId={thread?.id ?? null}
          enabled={agentReady}
          requiresApproval={settings.agentRequiresApproval}
        />

        <div className="flex flex-col gap-6">
          {/* Capabilities */}
          <Card className="p-5">
            <h2 className="lx-eyebrow mb-3">What it can do for you</h2>
            <p className="mb-3 text-xs text-[var(--text-secondary)]">
              {availableTools.length} of {AGENT_TOOLS.length} tools, based on your role.
            </p>
            <ul className="flex flex-col gap-2 text-sm">
              {AGENT_TOOLS.map((tool) => {
                const allowed = availableTools.some((t) => t.function.name === tool.name);
                return (
                  <li
                    key={tool.name}
                    className={allowed ? "" : "text-[var(--text-muted)] line-through"}
                  >
                    <span className="font-mono text-xs">{tool.name.replace(/_/g, " ")}</span>
                    {tool.mutating ? (
                      <span className="ml-1.5">
                        <Badge tone="warning">writes</Badge>
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </Card>

          {/* Recent actions */}
          <Card className="p-5">
            <h2 className="lx-eyebrow mb-3">Recent agent actions</h2>
            {recentActions.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">Nothing yet.</p>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {recentActions.map((action) => (
                  <li key={action.id} className="text-sm">
                    <div className="flex items-center gap-2">
                      <Badge
                        tone={
                          action.status === "EXECUTED"
                            ? "success"
                            : action.status === "FAILED"
                              ? "danger"
                              : "neutral"
                        }
                      >
                        {action.status.toLowerCase()}
                      </Badge>
                      <span className="font-mono text-xs">{action.tool}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                      {action.thread.channel.toLowerCase()} · {formatDate(action.createdAt, true)}
                    </p>
                    {action.error ? (
                      <p className="mt-0.5 text-xs text-danger">{action.error}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {/* Channel setup */}
      {canConfigure ? (
        <AgentIdentityManager
          identities={identities.map((i) => ({
            id: i.id,
            channel: i.channel,
            externalId: i.externalId,
            label: i.label,
            isActive: i.isActive,
          }))}
          staff={staff.map((s) => ({
            id: s.id,
            email: s.email,
            name: [s.firstName, s.lastName].filter(Boolean).join(" ") || s.email,
            role: s.role,
          }))}
          slackReady={isReady(integrations, "slack")}
          whatsappReady={isReady(integrations, "whatsapp")}
          siteUrl={env.siteUrl()}
        />
      ) : (
        <Card className="flex items-start gap-3 p-5">
          <Bot className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-muted)]" aria-hidden />
          <p className="text-sm text-[var(--text-secondary)]">
            Slack and WhatsApp linking is managed by an admin.
          </p>
        </Card>
      )}
    </div>
  );
}
