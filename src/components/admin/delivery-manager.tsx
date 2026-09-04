"use client";

import { useActionState, useState, useTransition } from "react";
import { Loader2, Plus, Trash2, Pencil, X } from "lucide-react";
import {
  saveZoneAction,
  deleteZoneAction,
  saveRateAction,
  deleteRateAction,
} from "@/app/actions/admin/shipping";
import type { AdminState } from "@/app/actions/admin/products";
import { GHANA_REGIONS } from "@/lib/constants";
import { formatMoney, toMajorUnits } from "@/lib/money";
import { Card, Badge, Alert } from "@/components/ui";
import { cn } from "@/lib/utils";

/**
 * Delivery zones and their rates.
 *
 * A zone groups regions that cost the same to reach; the rates inside it are
 * what a shopper picks between at checkout. A zone with no regions ticked is
 * the catch-all, which is how "everywhere else" gets priced without listing
 * sixteen regions.
 */

export type RateView = {
  id: string;
  name: string;
  price: number;
  freeAboveSubtotal: number | null;
  estimatedDaysMin: number | null;
  estimatedDaysMax: number | null;
  isActive: boolean;
  position: number;
};

export type ZoneView = {
  id: string;
  name: string;
  regions: string[];
  isActive: boolean;
  rates: RateView[];
};

const field = "lx-field rounded-lg text-sm";
const label = "flex flex-col gap-1.5 text-xs text-[var(--text-muted)]";

export function DeliveryManager({ zones }: { zones: ZoneView[] }) {
  const [addingZone, setAddingZone] = useState(false);

  return (
    <div className="flex flex-col gap-4.5">
      {zones.length === 0 ? (
        <Alert tone="warning">
          There are no delivery zones. Until one exists, checkout has nothing to quote and no order
          can be completed.
        </Alert>
      ) : null}

      {zones.map((zone) => (
        <ZoneCard key={zone.id} zone={zone} />
      ))}

      {addingZone ? (
        <Card className="px-6 py-5.5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold">New zone</h3>
            <button type="button" onClick={() => setAddingZone(false)} aria-label="Cancel">
              <X className="h-4 w-4 text-[var(--text-muted)]" aria-hidden />
            </button>
          </div>
          <ZoneForm onDone={() => setAddingZone(false)} />
        </Card>
      ) : (
        <button
          type="button"
          onClick={() => setAddingZone(true)}
          className="inline-flex w-fit items-center gap-2 rounded-lg bg-[var(--accent)] px-5 py-2.5 text-sm text-white transition-colors hover:bg-[var(--accent-hover)]"
        >
          <Plus className="h-4 w-4" aria-hidden />
          Add zone
        </button>
      )}
    </div>
  );
}

function ZoneCard({ zone }: { zone: ZoneView }) {
  const [editing, setEditing] = useState(false);
  const [addingRate, setAddingRate] = useState(false);
  const [removing, startRemoving] = useTransition();
  const [notice, setNotice] = useState<AdminState | null>(null);

  return (
    <Card className="flex flex-col gap-4 px-6 py-5.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2.5 text-sm font-semibold">
            {zone.name}
            <Badge tone={zone.isActive ? "success" : "neutral"}>
              {zone.isActive ? "active" : "off"}
            </Badge>
          </h3>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {zone.regions.length > 0
              ? zone.regions.join(", ")
              : "Catch-all — anywhere not covered by another zone"}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setEditing((value) => !value)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-strong)] px-3 py-1.5 text-xs transition-colors hover:bg-[var(--surface-sunken)]"
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden />
            {editing ? "Close" : "Edit"}
          </button>
          <button
            type="button"
            disabled={removing}
            onClick={() =>
              startRemoving(async () => setNotice(await deleteZoneAction(zone.id)))
            }
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-strong)] px-3 py-1.5 text-xs text-danger transition-colors hover:bg-danger/5 disabled:opacity-50"
          >
            {removing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
            )}
            Remove
          </button>
        </div>
      </div>

      {notice?.message ? (
        <Alert tone={notice.ok ? "success" : "danger"}>{notice.message}</Alert>
      ) : null}

      {editing ? <ZoneForm zone={zone} onDone={() => setEditing(false)} /> : null}

      {/* Rates */}
      <div className="flex flex-col gap-2">
        {zone.rates.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">
            No rates yet — this zone will not appear at checkout until it has one.
          </p>
        ) : (
          zone.rates.map((rate) => <RateRow key={rate.id} rate={rate} zoneId={zone.id} />)
        )}

        {addingRate ? (
          <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-4">
            <RateForm zoneId={zone.id} onDone={() => setAddingRate(false)} />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAddingRate(true)}
            className="inline-flex w-fit items-center gap-1.5 text-sm text-[var(--accent)]"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Add rate
          </button>
        )}
      </div>
    </Card>
  );
}

function RateRow({ rate, zoneId }: { rate: RateView; zoneId: string }) {
  const [editing, setEditing] = useState(false);
  const [removing, startRemoving] = useTransition();
  const [notice, setNotice] = useState<AdminState | null>(null);

  if (editing) {
    return (
      <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-4">
        <RateForm zoneId={zoneId} rate={rate} onDone={() => setEditing(false)} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div
        className={cn(
          "flex flex-wrap items-center gap-3 rounded-lg border border-[var(--border-subtle)] px-3.5 py-2.5 text-sm",
          !rate.isActive && "opacity-55",
        )}
      >
        <span className="min-w-32 flex-1">{rate.name}</span>
        <span className="tabular-nums">
          {rate.price === 0 ? "Free" : formatMoney(rate.price)}
        </span>
        {rate.freeAboveSubtotal ? (
          <span className="text-xs text-sage-600">
            free over {formatMoney(rate.freeAboveSubtotal)}
          </span>
        ) : null}
        {rate.estimatedDaysMin !== null ? (
          <span className="text-xs text-[var(--text-muted)]">
            {rate.estimatedDaysMin}–{rate.estimatedDaysMax ?? rate.estimatedDaysMin} days
          </span>
        ) : null}
        {!rate.isActive ? <Badge tone="neutral">off</Badge> : null}

        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-xs text-[var(--accent)] underline underline-offset-2"
        >
          Edit
        </button>
        <button
          type="button"
          disabled={removing}
          onClick={() => startRemoving(async () => setNotice(await deleteRateAction(rate.id)))}
          className="text-xs text-danger underline underline-offset-2 disabled:opacity-50"
        >
          Remove
        </button>
      </div>

      {notice?.message ? (
        <p className={cn("text-xs", notice.ok ? "text-sage-600" : "text-danger")}>
          {notice.message}
        </p>
      ) : null}
    </div>
  );
}

function ZoneForm({ zone, onDone }: { zone?: ZoneView; onDone: () => void }) {
  const [state, action, pending] = useActionState<AdminState | null, FormData>(
    async (prev, formData) => {
      const result = await saveZoneAction(prev, formData);
      if (result.ok) onDone();
      return result;
    },
    null,
  );

  return (
    <form action={action} className="flex flex-col gap-4">
      {state?.message && !state.ok ? <Alert tone="danger">{state.message}</Alert> : null}
      {zone ? <input type="hidden" name="id" value={zone.id} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className={label}>
          Zone name
          <input
            name="name"
            required
            defaultValue={zone?.name}
            placeholder="e.g. Greater Accra"
            className={field}
          />
        </label>

        <label className="flex items-center gap-2.5 self-end pb-2 text-sm">
          <input
            type="checkbox"
            name="isActive"
            defaultChecked={zone?.isActive ?? true}
            className="accent-[var(--accent)]"
          />
          Offer this zone at checkout
        </label>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-xs text-[var(--text-muted)]">
          Regions — leave every box unticked to make this the catch-all
        </legend>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
          {GHANA_REGIONS.map((region) => (
            <label key={region} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="regions"
                value={region}
                defaultChecked={zone?.regions.includes(region)}
                className="accent-[var(--accent)]"
              />
              {region}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-5 py-2.5 text-sm text-white disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          {zone ? "Save zone" : "Create zone"}
        </button>
        <button type="button" onClick={onDone} className="text-sm text-[var(--text-secondary)]">
          Cancel
        </button>
      </div>
    </form>
  );
}

function RateForm({
  zoneId,
  rate,
  onDone,
}: {
  zoneId: string;
  rate?: RateView;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState<AdminState | null, FormData>(
    async (prev, formData) => {
      const result = await saveRateAction(prev, formData);
      if (result.ok) onDone();
      return result;
    },
    null,
  );

  return (
    <form action={action} className="flex flex-col gap-4">
      {state?.message && !state.ok ? <Alert tone="danger">{state.message}</Alert> : null}
      <input type="hidden" name="zoneId" value={zoneId} />
      {rate ? <input type="hidden" name="id" value={rate.id} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className={label}>
          Rate name
          <input
            name="name"
            required
            defaultValue={rate?.name}
            placeholder="e.g. Standard (2–4 days)"
            className={field}
          />
        </label>

        <label className={label}>
          Price (₵) — 0 for free delivery
          <input
            name="price"
            required
            inputMode="decimal"
            defaultValue={rate ? String(toMajorUnits(rate.price)) : ""}
            placeholder="25"
            className={field}
          />
        </label>

        <label className={label}>
          Free above (₵) — optional
          <input
            name="freeAboveSubtotal"
            inputMode="decimal"
            defaultValue={
              rate?.freeAboveSubtotal ? String(toMajorUnits(rate.freeAboveSubtotal)) : ""
            }
            placeholder="300"
            className={field}
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className={label}>
            Days, from
            <input
              name="estimatedDaysMin"
              inputMode="numeric"
              defaultValue={rate?.estimatedDaysMin ?? ""}
              placeholder="2"
              className={field}
            />
          </label>
          <label className={label}>
            to
            <input
              name="estimatedDaysMax"
              inputMode="numeric"
              defaultValue={rate?.estimatedDaysMax ?? ""}
              placeholder="4"
              className={field}
            />
          </label>
        </div>

        <label className={label}>
          Order in the list
          <input
            name="position"
            inputMode="numeric"
            defaultValue={rate?.position ?? 0}
            className={field}
          />
        </label>

        <label className="flex items-center gap-2.5 self-end pb-2 text-sm">
          <input
            type="checkbox"
            name="isActive"
            defaultChecked={rate?.isActive ?? true}
            className="accent-[var(--accent)]"
          />
          Offer this rate
        </label>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-5 py-2.5 text-sm text-white disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          {rate ? "Save rate" : "Add rate"}
        </button>
        <button type="button" onClick={onDone} className="text-sm text-[var(--text-secondary)]">
          Cancel
        </button>
      </div>
    </form>
  );
}
