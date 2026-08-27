import type { Metadata } from "next";
import Link from "next/link";
import { Images, Search } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/auth/rbac";
import { countBrokenUploadLinks, listMedia } from "@/lib/media";
import { MEDIA_FOLDERS } from "@/lib/media-format";
import { isCdnConfigured } from "@/lib/cdn";
import { buildQuery } from "@/lib/utils";
import { Card, EmptyState, SectionHeading } from "@/components/ui";
import {
  BrokenLinksNotice,
  MediaGrid,
  MediaLinkForm,
  MediaUploader,
} from "@/components/admin/media-library";

export const metadata: Metadata = { title: "Media" };
export const dynamic = "force-dynamic";

const PER_PAGE = 48;

/**
 * Every picture the store owns, in one place.
 *
 * Uploads land here whether they came from a product editor or from this page,
 * and any of them can be put on a product from the editor's library picker.
 */
export default async function AdminMediaPage({ searchParams }: PageProps<"/admin/media">) {
  const user = await requirePermission("products:read");
  const params = await searchParams;

  const q = typeof params.q === "string" ? params.q : "";
  const folder = typeof params.folder === "string" ? params.folder : "all";
  const page = Math.max(1, Number(params.page) || 1);

  const [{ items, total }, broken, cdn] = await Promise.all([
    listMedia({ query: q, folder, take: PER_PAGE, skip: (page - 1) * PER_PAGE }),
    countBrokenUploadLinks(),
    isCdnConfigured(),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / PER_PAGE));
  const canWrite = can(user.role, "products:write");

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading
        title="Media"
        description={`${total} picture${total === 1 ? "" : "s"} · new uploads go to ${
          cdn ? "Cloudinary" : "the database, so they survive every deploy"
        }.`}
      />

      <BrokenLinksNotice count={canWrite ? broken : 0} />

      {canWrite ? (
        <Card className="flex flex-col gap-5 p-5">
          <h2 className="lx-eyebrow">Upload</h2>
          <MediaUploader folders={MEDIA_FOLDERS} />

          <div className="border-t border-[var(--border-subtle)] pt-5">
            <h2 className="lx-eyebrow mb-3">Or add a link</h2>
            <MediaLinkForm folders={MEDIA_FOLDERS} />
          </div>
        </Card>
      ) : null}

      <Card className="p-4">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <div className="min-w-48 flex-1">
            <label htmlFor="q" className="lx-eyebrow mb-1.5 block">
              Search
            </label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
                aria-hidden
              />
              <input
                id="q"
                name="q"
                defaultValue={q}
                placeholder="File name, alt text or URL"
                className="lx-field pl-9"
              />
            </div>
          </div>

          <div>
            <label htmlFor="folder" className="lx-eyebrow mb-1.5 block">
              Folder
            </label>
            <select id="folder" name="folder" defaultValue={folder} className="lx-field w-40">
              <option value="all">All folders</option>
              {MEDIA_FOLDERS.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            className="rounded-(--radius-card) bg-[var(--accent)] px-4 py-2.5 text-sm text-[var(--accent-contrast)]"
          >
            Filter
          </button>

          {q || folder !== "all" ? (
            <Link
              href="/admin/media"
              className="px-2 py-2.5 text-sm text-[var(--text-secondary)] underline-offset-4 hover:underline"
            >
              Reset
            </Link>
          ) : null}
        </form>
      </Card>

      {items.length === 0 ? (
        <EmptyState
          icon={<Images className="h-6 w-6" aria-hidden />}
          title={q || folder !== "all" ? "Nothing matches" : "The library is empty"}
          description={
            q || folder !== "all"
              ? "Try widening the search."
              : "Upload a picture above and it is available to every product."
          }
        />
      ) : (
        <MediaGrid items={items} />
      )}

      {pageCount > 1 ? (
        <nav aria-label="Pagination" className="flex items-center justify-center gap-3 text-sm">
          {page > 1 ? (
            <Link
              href={`/admin/media${buildQuery({ q, folder, page: page - 1 })}`}
              className="rounded-(--radius-card) border border-[var(--border-subtle)] px-3 py-1.5"
            >
              Previous
            </Link>
          ) : null}
          <span className="text-[var(--text-secondary)] tabular-nums">
            Page {page} of {pageCount}
          </span>
          {page < pageCount ? (
            <Link
              href={`/admin/media${buildQuery({ q, folder, page: page + 1 })}`}
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
