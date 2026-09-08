import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { formatDate, buildQuery } from "@/lib/utils";
import { formatPhone, telHref } from "@/lib/phone";
import { Card, Badge, SectionHeading, EmptyState } from "@/components/ui";
import { ContactHandledButton } from "@/components/admin/contact-handled";

export const metadata: Metadata = { title: "Activity" };

const PER_PAGE = 50;

export default async function AdminActivityPage({ searchParams }: PageProps<"/admin/activity">) {
  await requirePermission("settings:manage");
  const params = await searchParams;

  const source = typeof params.source === "string" ? params.source : "";
  const page = Math.max(1, Number(params.page) || 1);
  const showHandled = params.messages === "handled";

  const where = source ? { source } : {};

  const [logs, total, contactMessages] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: PER_PAGE,
      skip: (page - 1) * PER_PAGE,
      include: {
        actor: { select: { email: true, firstName: true, lastName: true } },
      },
    }),
    db.auditLog.count({ where }),
    db.contactMessage.findMany({
      where: { isHandled: showHandled },
      orderBy: { createdAt: "desc" },
      take: showHandled ? 20 : 10,
    }),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / PER_PAGE));

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading
        title="Activity"
        description="Every change to the catalog, pricing, discounts and staff, whoever made it — including the AI agent."
      />

      {contactMessages.length > 0 || showHandled ? (
        <Card className="p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="lx-eyebrow">
              {showHandled
                ? "Handled contact messages"
                : `${contactMessages.length} unread contact message${contactMessages.length === 1 ? "" : "s"}`}
            </h2>
            <Link
              href={showHandled ? "/admin/activity" : "/admin/activity?messages=handled"}
              className="text-xs text-[var(--accent)] underline-offset-4 hover:underline"
            >
              {showHandled ? "Show unread" : "Show handled"}
            </Link>
          </div>
          {contactMessages.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">Nothing handled yet.</p>
          ) : (
            <ul className="divide-y divide-[var(--border-subtle)]">
              {contactMessages.map((message) => (
                <li key={message.id} className="py-3">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-sm font-medium">{message.name}</span>
                    <a
                      href={`mailto:${message.email}${message.subject ? `?subject=${encodeURIComponent(`Re: ${message.subject}`)}` : ""}`}
                      className="text-xs text-[var(--text-secondary)] hover:underline"
                    >
                      {message.email}
                    </a>
                    {message.phone ? (
                      <a
                        href={telHref(message.phone)}
                        className="text-xs text-[var(--text-secondary)] hover:underline"
                      >
                        {formatPhone(message.phone)}
                      </a>
                    ) : null}
                    <span className="ml-auto text-xs text-[var(--text-muted)]">
                      {formatDate(message.createdAt, true)}
                    </span>
                  </div>
                  {message.subject ? (
                    <p className="mt-0.5 text-sm">{message.subject}</p>
                  ) : null}
                  <p className="mt-1 whitespace-pre-line text-sm text-[var(--text-secondary)]">
                    {message.message}
                  </p>
                  <div className="mt-2">
                    <ContactHandledButton messageId={message.id} isHandled={message.isHandled} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}

      <Card className="p-4">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="source" className="lx-eyebrow mb-1.5 block">
              Source
            </label>
            <select id="source" name="source" defaultValue={source} className="lx-field w-40">
              <option value="">All sources</option>
              <option value="admin">Admin</option>
              <option value="agent">AI agent</option>
              <option value="system">System</option>
            </select>
          </div>
          <button
            type="submit"
            className="rounded-(--radius-card) bg-[var(--accent)] px-4 py-2.5 text-sm text-[var(--accent-contrast)]"
          >
            Filter
          </button>
          {source ? (
            <Link href="/admin/activity" className="px-2 py-2.5 text-sm underline-offset-4 hover:underline">
              Reset
            </Link>
          ) : null}
        </form>
      </Card>

      {logs.length === 0 ? (
        <EmptyState title="Nothing logged yet" description="Changes appear here as they happen." />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto overscroll-x-contain" tabIndex={0} role="region" aria-label="Scrollable table">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="border-b border-[var(--border-subtle)] bg-[var(--surface-sunken)] text-left">
                <tr>
                  <th className="px-4 py-2.5 font-medium">When</th>
                  <th className="px-4 py-2.5 font-medium">Who</th>
                  <th className="px-4 py-2.5 font-medium">Source</th>
                  <th className="px-4 py-2.5 font-medium">Action</th>
                  <th className="px-4 py-2.5 font-medium">Entity</th>
                  <th className="px-4 py-2.5 font-medium">Change</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-[var(--surface-sunken)]">
                    <td className="whitespace-nowrap px-4 py-3 text-[var(--text-secondary)]">
                      {formatDate(log.createdAt, true)}
                    </td>
                    <td className="px-4 py-3">
                      {log.actor
                        ? [log.actor.firstName, log.actor.lastName].filter(Boolean).join(" ") ||
                          log.actor.email
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        tone={
                          log.source === "agent"
                            ? "info"
                            : log.source === "system"
                              ? "neutral"
                              : "accent"
                        }
                      >
                        {log.source}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{log.action}</td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">{log.entity}</td>
                    <td className="max-w-64 truncate px-4 py-3 text-xs text-[var(--text-muted)]">
                      {log.after ? JSON.stringify(log.after) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {pageCount > 1 ? (
        <nav aria-label="Pagination" className="flex items-center justify-center gap-3 text-sm">
          {page > 1 ? (
            <Link
              href={`/admin/activity${buildQuery({ source, page: page - 1 })}`}
              className="rounded-(--radius-card) border border-[var(--border-subtle)] px-3 py-1.5"
            >
              Previous
            </Link>
          ) : null}
          <span className="tabular-nums text-[var(--text-secondary)]">
            Page {page} of {pageCount}
          </span>
          {page < pageCount ? (
            <Link
              href={`/admin/activity${buildQuery({ source, page: page + 1 })}`}
              className="rounded-(--radius-card) border border-[var(--border-subtle)] px-3 py-1.5"
            >
              Next
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
