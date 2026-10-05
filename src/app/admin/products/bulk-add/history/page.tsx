import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission, displayName } from "@/lib/auth";
import { Badge, Card, EmptyState, SectionHeading } from "@/components/ui";
import { BulkAddNav } from "@/components/admin/bulk-add/desktop-only";

export const metadata: Metadata = { title: "Import history" };
export const dynamic = "force-dynamic";

type Summary = { total?: number; status?: Record<string, number> };

export default async function ImportHistoryPage() {
  await requirePermission("products:read");
  const batches = await db.productImportBatch.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      name: true,
      sourceKind: true,
      status: true,
      summary: true,
      aiCalls: true,
      aiFailures: true,
      createdAt: true,
      createdById: true,
      sourceId: true,
    },
  });
  const [users, sources] = await Promise.all([
    db.user.findMany({
      where: { id: { in: [...new Set(batches.map((b) => b.createdById).filter((x): x is string => Boolean(x)))] } },
      select: { id: true, firstName: true, lastName: true, email: true, phone: true },
    }),
    db.catalogSource.findMany({ where: { id: { in: batches.map((b) => b.sourceId).filter((x): x is string => Boolean(x)) } }, select: { id: true, name: true } }),
  ]);
  const userName = new Map(users.map((u) => [u.id, displayName(u)]));
  const sourceName = new Map(sources.map((s) => [s.id, s.name]));

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading title="Import history" description="Every bulk import, what it created and updated, and what is still waiting." />
      <BulkAddNav active="history" />
      {batches.length === 0 ? (
        <EmptyState title="No imports yet" description="Start one from Bulk Product Add." />
      ) : (
        <Card className="lx-table-scroll">
          <table className="w-full text-sm">
            <thead className="bg-[var(--surface-sunken)] text-left text-xs text-[var(--text-secondary)]">
              <tr>
                {["Batch", "Date", "Source", "Count", "Created", "Updated", "Failed", "Skipped", "AI", "By", "Status"].map((h) => (
                  <th key={h} className="p-2 font-normal">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => {
                const s = (b.summary as Summary | null)?.status ?? {};
                return (
                  <tr key={b.id} className="border-t border-[var(--border-subtle)]">
                    <td className="p-2">
                      <Link href={`/admin/products/bulk-add/${b.id}`} className="font-medium hover:underline">{b.name}</Link>
                    </td>
                    <td className="p-2 text-xs">{b.createdAt.toLocaleString("en-GB")}</td>
                    <td className="p-2 text-xs">
                      {b.sourceKind.replace(/_/g, " + ").toLowerCase()}
                      {b.sourceId && sourceName.get(b.sourceId) ? ` · ${sourceName.get(b.sourceId)}` : ""}
                    </td>
                    <td className="p-2">{((b.summary as Summary | null)?.total ?? 0).toLocaleString()}</td>
                    <td className="p-2">{(s.IMPORTED ?? 0).toLocaleString()}</td>
                    <td className="p-2">{(s.UPDATED ?? 0).toLocaleString()}</td>
                    <td className="p-2">{(s.FAILED ?? 0).toLocaleString()}</td>
                    <td className="p-2">{(s.SKIPPED ?? 0).toLocaleString()}</td>
                    <td className="p-2 text-xs">{b.aiCalls} ({b.aiFailures} failed tries)</td>
                    <td className="p-2 text-xs">{b.createdById ? (userName.get(b.createdById) ?? "—") : "—"}</td>
                    <td className="p-2"><Badge>{b.status.replace(/_/g, " ").toLowerCase()}</Badge></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
