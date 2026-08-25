"use client";

import { useActionState, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import {
  updateCustomerAction,
  addCustomerNoteAction,
  setCustomerTagsAction,
} from "@/app/actions/admin/people";
import type { AdminState } from "@/app/actions/admin/products";
import { Card, Field, Alert } from "@/components/ui";
import { cn } from "@/lib/utils";

type Tag = { id: string; name: string; color: string };

const INTERACTION_TYPES = [
  { value: "NOTE", label: "Note" },
  { value: "CALL", label: "Call" },
  { value: "EMAIL", label: "Email" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "SUPPORT_TICKET", label: "Support" },
];

export function CustomerPanel({
  userId,
  firstName,
  lastName,
  phone,
  notes,
  acceptsMarketing,
  allTags,
  selectedTagIds,
}: {
  userId: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  notes: string | null;
  acceptsMarketing: boolean;
  allTags: Tag[];
  selectedTagIds: string[];
}) {
  const [detailState, detailAction, detailPending] = useActionState<AdminState | null, FormData>(
    updateCustomerAction.bind(null, userId),
    null,
  );
  const [noteState, noteAction, notePending] = useActionState<AdminState | null, FormData>(
    addCustomerNoteAction.bind(null, userId),
    null,
  );

  const [tags, setTags] = useState<string[]>(selectedTagIds);
  const [tagBusy, startTagBusy] = useTransition();

  function toggleTag(tagId: string) {
    const next = tags.includes(tagId) ? tags.filter((t) => t !== tagId) : [...tags, tagId];
    setTags(next);
    startTagBusy(async () => {
      await setCustomerTagsAction(userId, next);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Tags */}
      <Card className="p-5">
        <h2 className="lx-eyebrow mb-3">
          Tags {tagBusy ? <span className="ml-1 text-[var(--text-muted)]">saving…</span> : null}
        </h2>

        {allTags.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">No tags defined yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {allTags.map((tag) => {
              const active = tags.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => toggleTag(tag.id)}
                  aria-pressed={active}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs transition-colors",
                    active ? "border-transparent text-white" : "border-[var(--border-subtle)]",
                  )}
                  style={active ? { backgroundColor: tag.color } : undefined}
                >
                  {tag.name}
                </button>
              );
            })}
          </div>
        )}
      </Card>

      {/* Log an interaction */}
      <Card className="p-5">
        <h2 className="lx-eyebrow mb-3">Log an interaction</h2>
        <form action={noteAction} className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type" htmlFor="type">
              <select id="type" name="type" className="lx-field">
                {INTERACTION_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Subject" htmlFor="subject">
              <input id="subject" name="subject" className="lx-field" />
            </Field>
          </div>

          <Field label="Detail" htmlFor="body" required>
            <textarea id="body" name="body" rows={3} required className="lx-field resize-y" />
          </Field>

          <button
            type="submit"
            disabled={notePending}
            className="flex items-center justify-center gap-2 rounded-[--radius-card] bg-[var(--accent)] px-4 py-2.5 text-sm text-[var(--accent-contrast)] disabled:opacity-50"
          >
            {notePending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Log it
          </button>
        </form>

        {noteState?.message ? (
          <p className={cn("mt-2 text-sm", noteState.ok ? "text-success" : "text-danger")}>
            {noteState.message}
          </p>
        ) : null}
      </Card>

      {/* Details */}
      <Card className="p-5">
        <h2 className="lx-eyebrow mb-3">Details</h2>
        <form action={detailAction} className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="First name" htmlFor="firstName">
              <input id="firstName" name="firstName" defaultValue={firstName ?? ""} className="lx-field" />
            </Field>
            <Field label="Last name" htmlFor="lastName">
              <input id="lastName" name="lastName" defaultValue={lastName ?? ""} className="lx-field" />
            </Field>
          </div>

          <Field label="Phone" htmlFor="phone">
            <input id="phone" name="phone" defaultValue={phone ?? ""} className="lx-field" />
          </Field>

          <Field label="Internal notes" htmlFor="notes" hint="Never shown to the customer.">
            <textarea
              id="notes"
              name="notes"
              rows={3}
              defaultValue={notes ?? ""}
              className="lx-field resize-y"
            />
          </Field>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="acceptsMarketing"
              defaultChecked={acceptsMarketing}
              className="accent-[var(--accent)]"
            />
            Opted into marketing
          </label>

          <button
            type="submit"
            disabled={detailPending}
            className="rounded-[--radius-card] border border-[var(--border-subtle)] px-4 py-2.5 text-sm disabled:opacity-50"
          >
            {detailPending ? "Saving…" : "Save details"}
          </button>
        </form>

        {detailState?.message ? (
          <div className="mt-3">
            <Alert tone={detailState.ok ? "success" : "danger"}>{detailState.message}</Alert>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
