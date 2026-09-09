"use client";

import { useRef, useState, useTransition } from "react";
import { Loader2, Upload, X } from "lucide-react";
import { uploadSettingImageAction } from "@/app/actions/admin/media";
import { UPLOAD_ACCEPT } from "@/lib/media-format";
import { Photo } from "@/components/shop/photo";

/**
 * A picture field for anything that is not a product: a category card, a
 * collection banner, the hero. Paste an address, or upload one — the upload
 * goes into the media library and the field is filled with where it landed.
 * Either way the form posts one plain `url`, so the server never needs to know
 * which happened.
 */
export function ImageUrlField({
  name,
  defaultValue = "",
  folder = "store",
  label = "Image",
}: {
  name: string;
  defaultValue?: string;
  /** Which library folder an upload files under. */
  folder?: string;
  label?: string;
}) {
  const [url, setUrl] = useState(defaultValue);
  const [error, setError] = useState<string | null>(null);
  const [uploading, startUpload] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function upload(file: File | undefined) {
    if (!file) return;
    setError(null);
    const formData = new FormData();
    formData.set("file", file);
    formData.set("folder", folder);
    startUpload(async () => {
      const result = await uploadSettingImageAction(null, formData);
      if (result.ok && result.url) setUrl(result.url);
      else setError(result.message ?? "The upload failed.");
      if (inputRef.current) inputRef.current.value = "";
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="lx-eyebrow">{label}</span>
      <div className="flex items-start gap-3">
        <span className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-sunken)]">
          {url ? <Photo src={url} sizes="64px" /> : null}
        </span>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex gap-2">
            <input
              name={name}
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://… or /catalog/room.webp"
              className="lx-field min-w-0 flex-1 py-1.5 text-sm"
            />
            {url ? (
              <button
                type="button"
                onClick={() => setUrl("")}
                aria-label="Clear image"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-danger"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            ) : null}
          </div>

          <input
            ref={inputRef}
            type="file"
            accept={UPLOAD_ACCEPT}
            className="sr-only"
            onChange={(event) => upload(event.target.files?.[0])}
          />
          <button
            type="button"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] px-3 py-1.5 text-xs disabled:opacity-50"
          >
            {uploading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Upload className="h-3.5 w-3.5" aria-hidden />
            )}
            {uploading ? "Uploading…" : "Upload a picture"}
          </button>
          {error ? <p className="text-xs text-danger">{error}</p> : null}
        </div>
      </div>
    </div>
  );
}
