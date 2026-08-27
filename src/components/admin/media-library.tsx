"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Copy,
  ExternalLink,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useActionState } from "react";
import {
  clearBrokenUploadsAction,
  deleteMediaAction,
  importMediaUrlAction,
  updateMediaAction,
  uploadMediaAction,
  type MediaUploadState,
} from "@/app/actions/admin/media";
import { UPLOAD_ACCEPT, humanSize } from "@/lib/media-format";
import type { MediaListItem } from "@/lib/media";
import type { AdminState } from "@/app/actions/admin/products";
import { Alert, Badge, Card } from "@/components/ui";
import { cn } from "@/lib/utils";

/**
 * The library, as the console sees it: a drop zone at the top and everything
 * the store owns underneath. A picture uploaded here is stored once and can be
 * put on any number of products from the product editor.
 */

type Picked = { file: File; preview: string };

export function MediaUploader({
  folder = "products",
  folders,
  onDone,
  compact = false,
}: {
  folder?: string;
  folders: readonly string[];
  onDone?: () => void;
  compact?: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<Picked[]>([]);

  const [state, action, pending] = useActionState<MediaUploadState | null, FormData>(
    async (prev, formData) => {
      // The strip below is the source of truth, not the file input: a picture
      // taken back out must not still be uploaded.
      formData.delete("files");
      for (const item of picked) formData.append("files", item.file);

      const result = await uploadMediaAction(prev, formData);

      if (result.ok) {
        for (const item of picked) URL.revokeObjectURL(item.preview);
        setPicked([]);
        if (inputRef.current) inputRef.current.value = "";
        router.refresh();
        onDone?.();
      }

      return result;
    },
    null,
  );

  function choose(files: FileList | null) {
    const incoming = Array.from(files ?? []);
    if (incoming.length === 0) return;

    setPicked((current) => [
      // Object URLs render the picture immediately, before anything is sent.
      ...current,
      ...incoming.map((file) => ({ file, preview: URL.createObjectURL(file) })),
    ]);

    // Cleared so choosing the same file again still fires a change event.
    if (inputRef.current) inputRef.current.value = "";
  }

  function remove(index: number) {
    setPicked((current) => {
      URL.revokeObjectURL(current[index].preview);
      return current.filter((_, i) => i !== index);
    });
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      {state?.message ? (
        <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        accept={UPLOAD_ACCEPT}
        multiple
        className="sr-only"
        onChange={(event) => choose(event.target.files)}
      />

      <div
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          choose(event.dataTransfer.files);
        }}
        className="flex flex-col gap-4 rounded-lg border border-dashed border-[var(--border-strong)] bg-[var(--surface-sunken)] p-4"
      >
        {picked.length > 0 ? (
          <ul className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            {picked.map((item, index) => (
              <li
                key={item.preview}
                className="group relative aspect-square overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.preview}
                  alt={item.file.name}
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => remove(index)}
                  className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-ink-900/75 text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                  aria-label={`Remove ${item.file.name}`}
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
                <span className="absolute inset-x-0 bottom-0 truncate bg-ink-900/70 px-1.5 py-0.5 text-[10px] text-white">
                  {item.file.name}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-col items-center gap-1.5 py-6 text-center">
            <Upload className="h-6 w-6 text-[var(--text-muted)]" aria-hidden />
            <p className="text-sm">Drop images here, or add them below</p>
            <p className="text-xs text-[var(--text-muted)]">
              JPEG, PNG, WebP, AVIF or GIF · up to 8 MB each
            </p>
          </div>
        )}

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="inline-flex w-fit items-center gap-2 rounded-lg border border-[var(--border-strong)] bg-[var(--surface-raised)] px-4 py-2 text-sm transition-colors hover:bg-[var(--surface-sunken)]"
        >
          <Plus className="h-4 w-4" aria-hidden />
          {picked.length > 0 ? "Add more images" : "Add images"}
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        {compact ? (
          <input type="hidden" name="folder" value={folder} />
        ) : (
          <label className="flex flex-col gap-1">
            <span className="lx-eyebrow">Folder</span>
            <select name="folder" defaultValue={folder} className="lx-field w-40">
              {folders.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="flex min-w-48 flex-1 flex-col gap-1">
          <span className="lx-eyebrow">Alt text</span>
          <input name="alt" placeholder="Ivory duvet on a made bed" className="lx-field" />
        </label>

        <button
          type="submit"
          disabled={pending || picked.length === 0}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-5 py-2.5 text-sm text-[var(--accent-contrast)] disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          {picked.length > 0
            ? `Upload ${picked.length} image${picked.length === 1 ? "" : "s"}`
            : "Upload"}
        </button>
      </div>
    </form>
  );
}


// ---------------------------------------------------------------------------

/** For a picture that already lives somewhere else on the web. */
export function MediaLinkForm({ folders }: { folders: readonly string[] }) {
  const router = useRouter();

  const [state, action, pending] = useActionState<AdminState | null, FormData>(
    async (prev, formData) => {
      const result = await importMediaUrlAction(prev, formData);
      if (result.ok) router.refresh();
      return result;
    },
    null,
  );

  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <label className="min-w-64 flex-1">
        <span className="lx-eyebrow mb-1.5 block">Image URL</span>
        <input
          name="url"
          type="url"
          placeholder="https://res.cloudinary.com/..."
          className="lx-field"
        />
      </label>

      <label>
        <span className="lx-eyebrow mb-1.5 block">Folder</span>
        <select name="folder" defaultValue="products" className="lx-field w-40">
          {folders.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>

      <label className="min-w-48 flex-1">
        <span className="lx-eyebrow mb-1.5 block">Alt text</span>
        <input name="alt" placeholder="Ivory lamp on a side table" className="lx-field" />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-strong)] bg-[var(--surface-raised)] px-5 py-2.5 text-sm disabled:opacity-50"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        Add link
      </button>

      {state?.message ? (
        <p className={cn("w-full text-sm", state.ok ? "text-success" : "text-danger")}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

// ---------------------------------------------------------------------------

const SOURCE_LABEL: Record<string, string> = {
  DATABASE: "Stored here",
  CDN: "CDN",
  EXTERNAL: "Linked",
};

export function MediaGrid({ items }: { items: MediaListItem[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
      {items.map((asset) => (
        <MediaCard key={asset.id} asset={asset} />
      ))}
    </div>
  );
}

function MediaCard({ asset }: { asset: MediaListItem }) {
  const router = useRouter();
  const [busy, startBusy] = useTransition();
  const [editing, setEditing] = useState(false);
  const [alt, setAlt] = useState(asset.alt ?? "");
  const [copied, setCopied] = useState(false);

  const dimensions = asset.width && asset.height ? `${asset.width}×${asset.height}` : null;

  async function copyUrl() {
    const absolute = asset.url.startsWith("/")
      ? `${window.location.origin}${asset.url}`
      : asset.url;

    try {
      await navigator.clipboard.writeText(absolute);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be refused; the link below is still selectable.
    }
  }

  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="lx-media bg-[var(--surface-sunken)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={asset.url} alt={asset.alt ?? ""} loading="lazy" />
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <p className="truncate text-sm font-medium" title={asset.filename}>
          {asset.filename}
        </p>

        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
          <Badge tone={asset.source === "EXTERNAL" ? "neutral" : "info"}>
            {SOURCE_LABEL[asset.source] ?? asset.source}
          </Badge>
          <span>{asset.folder}</span>
          {dimensions ? <span>· {dimensions}</span> : null}
          {asset.size ? <span>· {humanSize(asset.size)}</span> : null}
        </div>

        <p className="text-[11px] text-[var(--text-muted)]">
          {asset.usedBy === 0
            ? "Not used yet"
            : `Used on ${asset.usedBy} product image${asset.usedBy === 1 ? "" : "s"}`}
        </p>

        {editing ? (
          <div className="flex items-center gap-2">
            <input
              value={alt}
              onChange={(event) => setAlt(event.target.value)}
              placeholder="Alt text"
              className="lx-field text-xs"
              aria-label={`Alt text for ${asset.filename}`}
            />
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                startBusy(async () => {
                  await updateMediaAction(asset.id, { alt });
                  setEditing(false);
                  router.refresh();
                })
              }
              className="rounded-lg bg-[var(--accent)] px-3 py-2 text-xs text-[var(--accent-contrast)] disabled:opacity-50"
            >
              Save
            </button>
          </div>
        ) : (
          <p className="line-clamp-2 text-xs text-[var(--text-secondary)]">
            {asset.alt || <span className="text-[var(--text-muted)]">No alt text</span>}
          </p>
        )}

        <div className="mt-auto flex items-center gap-1 pt-1">
          <IconAction label="Copy link" onClick={copyUrl}>
            {copied ? (
              <Check className="h-3.5 w-3.5 text-success" aria-hidden />
            ) : (
              <Copy className="h-3.5 w-3.5" aria-hidden />
            )}
          </IconAction>

          <IconAction label="Edit alt text" onClick={() => setEditing((open) => !open)}>
            <Pencil className="h-3.5 w-3.5" aria-hidden />
          </IconAction>

          <a
            href={asset.url}
            target="_blank"
            rel="noreferrer"
            title="Open"
            aria-label={`Open ${asset.filename}`}
            className="grid h-7 w-7 place-items-center rounded-lg border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>

          <IconAction
            label="Delete"
            className="ml-auto text-danger"
            disabled={busy}
            onClick={() => {
              const warning =
                asset.usedBy > 0
                  ? `This picture is on ${asset.usedBy} product image${
                      asset.usedBy === 1 ? "" : "s"
                    }. Delete it everywhere?`
                  : "Delete this picture?";
              if (!window.confirm(warning)) return;

              startBusy(async () => {
                await deleteMediaAction(asset.id);
                router.refresh();
              });
            }}
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
            )}
          </IconAction>
        </div>
      </div>
    </Card>
  );
}

function IconAction({
  label,
  onClick,
  children,
  className,
  disabled,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={cn(
        "grid h-7 w-7 place-items-center rounded-lg border border-[var(--border-subtle)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] disabled:opacity-50",
        className,
      )}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------

/**
 * Product pictures left over from when uploads went to the container's disk.
 * The files are gone, so the rows only paint a broken box.
 */
export function BrokenLinksNotice({ count }: { count: number }) {
  const router = useRouter();
  const [busy, startBusy] = useTransition();
  // Kept after the clear so the count going to zero still says what happened.
  const [message, setMessage] = useState<string | null>(null);

  if (count === 0 && !message) return null;

  return (
    <Alert tone="warning">
      <span className="flex flex-wrap items-center gap-3">
        <span>
          {message ??
            `${count} product image${count === 1 ? "" : "s"} still point at the old /uploads path. Those files were lost on a deploy and cannot load.`}
        </span>

        {count > 0 ? (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              startBusy(async () => {
                const result = await clearBrokenUploadsAction();
                setMessage(result.message ?? null);
                router.refresh();
              })
            }
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-strong)] bg-[var(--surface-raised)] px-3 py-1.5 text-xs"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
            Clear them
          </button>
        ) : null}
      </span>
    </Alert>
  );
}
