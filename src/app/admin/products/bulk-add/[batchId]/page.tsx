import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/auth/rbac";
import { formatMoney } from "@/lib/money";
import { Badge, Card, SectionHeading } from "@/components/ui";
import { BulkAddNav, DesktopOnly } from "@/components/admin/bulk-add/desktop-only";
import { BatchProgress, ImportPanel, ReviewGrid, type ReviewRow } from "@/components/admin/bulk-add/review-client";
import { refreshSummary, readSetup } from "@/lib/bulk-import/pipeline";
import { itemWhere } from "@/lib/bulk-import/review-query";
import { ISSUE_CODES, type Issue, type ItemDraft } from "@/lib/bulk-import/schema";
import { modelLabel } from "@/lib/bulk-ai/default-models";

export const metadata: Metadata = { title: "Review import" };
export const dynamic = "force-dynamic";

const PER_PAGE = 50;

type Summary = {
  total: number;
  status: Record<string, number>;
  issues: Record<string, number>;
  actions: Record<string, number>;
  unmatchedMedia: number;
};

export default async function BatchReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ batchId: string }>;
  searchParams: Promise<{ status?: string; issue?: string; q?: string; page?: string }>;
}) {
  const user = await requirePermission("products:read");
  const { batchId } = await params;
  const sp = await searchParams;
  const batch = await db.productImportBatch.findUnique({
    where: { id: batchId },
    select: { id: true, name: true, status: true, sourceKind: true, summary: true, setup: true, createdAt: true, aiCalls: true, aiFailures: true, rowCount: true, fileName: true, error: true },
  });
  if (!batch) notFound();
  const editable = can(user.role, "products:write") && !["CANCELLED"].includes(batch.status);

  const summary = ((batch.summary as Summary | null) ?? (await refreshSummary(batchId))) as Summary;
  const filter = { status: sp.status, issue: sp.issue, q: sp.q };
  const where = itemWhere(batchId, filter);
  const page = Math.max(1, Number(sp.page) || 1);

  const [items, filteredCount, categories, collections, recipes, aiByModel] = await Promise.all([
    db.productImportItem.findMany({
      where,
      orderBy: [{ rowNumber: "asc" }, { createdAt: "asc" }],
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
      include: {
        media: {
          orderBy: { position: "asc" },
          select: { id: true, url: true, filename: true, optionName: true, optionValue: true, optionSource: true, duplicateKind: true },
        },
      },
    }),
    db.productImportItem.count({ where }),
    db.category.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.collection.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.productRecipe.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.productImportAiAttempt.groupBy({ by: ["model", "success"], where: { batchId }, _count: true }),
  ]);

  const setup = readSetup(batch.setup);
  const rows: ReviewRow[] = items.map((it) => {
    const draft = (it.data as { draft?: ItemDraft }).draft;
    const enabled = draft?.variants.filter((v) => v.enabled) ?? [];
    const prices = enabled.map((v) => v.price).filter((p): p is number => p != null);
    const stocks = enabled.map((v) => v.stock).filter((s): s is number => s != null);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    return {
      id: it.id,
      status: it.status,
      rowNumber: it.rowNumber,
      title: draft?.title?.value ?? null,
      titleSource: draft?.title?.source ?? null,
      priceLabel: prices.length ? (min === max ? formatMoney(min) : `${formatMoney(min)}–${formatMoney(max)}`) : "—",
      stockLabel: !enabled.length ? "—" : enabled.every((v) => !v.trackInventory) ? "Not tracked" : String(stocks.reduce((a, b) => a + b, 0)),
      versions: draft?.variants.length ?? 0,
      enabledVersions: enabled.length,
      issues: (it.issues ?? []) as Issue[],
      action: it.action,
      matchMethod: it.matchMethod,
      productId: it.productId,
      aiStatus: it.aiStatus,
      error: it.error,
      options: draft?.options ?? [],
      variants: (draft?.variants ?? []).slice(0, 120).map((v) => ({ key: v.key, enabled: v.enabled, price: v.price, stock: v.stock, sku: v.sku })),
      media: it.media,
      imageOption: setup.imageRole.mode === "OPTION" ? (setup.imageRole.option ?? null) : null,
      description: draft?.description?.value ?? null,
      material: draft?.material?.value ?? null,
    };
  });

  const s = summary.status ?? {};
  const attention = (s.NEEDS_REVIEW ?? 0) + (s.BLOCKED ?? 0);
  const cards: { label: string; value: number; href: string; tone?: string }[] = [
    { label: "Ready", value: s.READY ?? 0, href: "?status=READY", tone: "text-success" },
    { label: "Need attention", value: attention, href: "?status=ATTENTION", tone: "text-warning" },
    ...Object.entries(summary.issues ?? {})
      .filter(([code]) => code in ISSUE_CODES)
      .sort((a, b) => b[1] - a[1])
      .map(([code, n]) => ({ label: ISSUE_CODES[code as keyof typeof ISSUE_CODES], value: n, href: `?issue=${code}`, tone: "text-[var(--text-primary)]" })),
    { label: "Imported", value: (s.IMPORTED ?? 0) + (s.UPDATED ?? 0), href: "?status=IMPORTED" },
    { label: "Failed", value: s.FAILED ?? 0, href: "?status=FAILED", tone: "text-danger" },
    { label: "Skipped", value: s.SKIPPED ?? 0, href: "?status=SKIPPED" },
  ].filter((c) => c.value > 0 || c.label === "Ready" || c.label === "Need attention");

  const pages = Math.max(1, Math.ceil(filteredCount / PER_PAGE));
  const qs = (p: number) => {
    const u = new URLSearchParams();
    if (sp.status) u.set("status", sp.status);
    if (sp.issue) u.set("issue", sp.issue);
    if (sp.q) u.set("q", sp.q);
    u.set("page", String(p));
    return `?${u.toString()}`;
  };
  const activeLabel = sp.issue ? ISSUE_CODES[sp.issue as keyof typeof ISSUE_CODES] : sp.status ? sp.status.replace(/_/g, " ").toLowerCase() : "all items";

  return (
    <div className="flex flex-col gap-6">
      <Link href="/admin/products/bulk-add/history" className="flex w-fit items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Import history
      </Link>
      <SectionHeading
        title={batch.name}
        description={`${batch.sourceKind.replace(/_/g, " + ").toLowerCase()}${batch.fileName ? ` · ${batch.fileName}` : ""} · started ${batch.createdAt.toLocaleString("en-GB")}`}
        action={<Badge tone="accent">{batch.status.replace(/_/g, " ").toLowerCase()}</Badge>}
      />
      <BulkAddNav active="history" />
      <DesktopOnly>
        <div className="flex flex-col gap-6">
          <BatchProgress batchId={batchId} status={batch.status} total={summary.total ?? 0} />

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
            <Link href="?" className="rounded-(--radius-card) border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4 hover:border-[var(--accent)]">
              <div className="text-2xl font-medium">{(summary.total ?? 0).toLocaleString()}</div>
              <div className="text-xs text-[var(--text-secondary)]">Processed</div>
            </Link>
            {cards.map((c) => (
              <Link key={c.label} href={c.href} className="rounded-(--radius-card) border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4 hover:border-[var(--accent)]">
                <div className={`text-2xl font-medium ${c.tone ?? ""}`}>{c.value.toLocaleString()}</div>
                <div className="text-xs text-[var(--text-secondary)]">{c.label}</div>
              </Link>
            ))}
          </div>
          {summary.unmatchedMedia > 0 && (
            <p className="text-sm text-warning">{summary.unmatchedMedia} photo(s) did not match any spreadsheet row. Rename them to include the SKU, or map an image-file column.</p>
          )}

          <div className="grid gap-6 xl:grid-cols-[1fr_20rem]">
            <div className="space-y-3">
              <form className="flex items-center gap-2 text-sm">
                {sp.status && <input type="hidden" name="status" value={sp.status} />}
                {sp.issue && <input type="hidden" name="issue" value={sp.issue} />}
                <span className="text-[var(--text-secondary)]">Showing {activeLabel} ({filteredCount.toLocaleString()})</span>
                <input name="q" defaultValue={sp.q ?? ""} placeholder="Search key or title" className="lx-field ml-auto w-56 py-1 text-sm" />
              </form>
              <ReviewGrid
                batchId={batchId}
                rows={rows}
                filter={filter}
                filteredCount={filteredCount}
                categories={categories}
                collections={collections}
                recipes={recipes}
                editable={editable}
              />
              {pages > 1 && (
                <div className="flex items-center justify-between text-sm">
                  {page > 1 ? <Link href={qs(page - 1)} className="underline">Previous</Link> : <span />}
                  <span className="text-[var(--text-secondary)]">Page {page} of {pages.toLocaleString()}</span>
                  {page < pages ? <Link href={qs(page + 1)} className="underline">Next</Link> : <span />}
                </div>
              )}
            </div>

            <div className="space-y-4">
              <ImportPanel
                batchId={batchId}
                status={batch.status}
                ready={s.READY ?? 0}
                imported={(s.IMPORTED ?? 0) + (s.UPDATED ?? 0)}
                failed={(s.FAILED ?? 0) + (summary.issues?.AI_FAILED ?? 0)}
                canImport={editable}
              />
              <Card className="p-5 text-sm">
                <h3 className="text-base font-medium">AI usage</h3>
                <p className="mt-1 text-[var(--text-secondary)]">
                  {batch.aiCalls.toLocaleString()} task(s), {batch.aiFailures.toLocaleString()} failed attempt(s).
                </p>
                <ul className="mt-2 space-y-0.5 text-xs">
                  {[...new Set(aiByModel.map((a) => a.model))].map((m) => {
                    const ok = aiByModel.find((a) => a.model === m && a.success)?._count ?? 0;
                    const bad = aiByModel.find((a) => a.model === m && !a.success)?._count ?? 0;
                    return (
                      <li key={m}>
                        {modelLabel(m)}: {ok} ok, {bad} failed
                      </li>
                    );
                  })}
                </ul>
              </Card>
            </div>
          </div>
        </div>
      </DesktopOnly>
    </div>
  );
}
