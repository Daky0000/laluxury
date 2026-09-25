"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, Clock, Loader2, Plus, ShoppingBag, Sparkles } from "lucide-react";
import { addToCartAction } from "@/app/actions/cart";
import {
  formatConvertedFromMinorGhs,
  useStoreCurrency,
} from "@/components/shop/currency-switcher";
import { cn } from "@/lib/utils";

export type LookbookSpot = {
  id: string;
  variantId: string;
  title: string;
  slug: string;
  price: number;
  imageUrl: string | null;
  isPreorder: boolean;
  preorderLeadTime: string | null;
  xPercent: number;
  yPercent: number;
};

export type LookbookScene = {
  id: string;
  eyebrow: string;
  title: string;
  location: string;
  description: string;
  heroImage: string;
  spots: LookbookSpot[];
};

export function RoomLookbook({ scenes }: { scenes: LookbookScene[] }) {
  const [activeSceneIdx, setActiveSceneIdx] = useState(0);
  const scene = scenes[activeSceneIdx] ?? scenes[0];
  const [activeSpotId, setActiveSpotId] = useState<string>(scene?.spots[0]?.id ?? "");
  const [currency] = useStoreCurrency();
  const [pending, startTransition] = useTransition();
  const [addedId, setAddedId] = useState<string | null>(null);

  function selectScene(index: number) {
    setActiveSceneIdx(index);
    setActiveSpotId(scenes[index]?.spots[0]?.id ?? "");
  }

  function addSinglePiece(variantId: string, id: string) {
    startTransition(async () => {
      await addToCartAction(variantId, 1);
      setAddedId(id);
      setTimeout(() => setAddedId(null), 2000);
    });
  }

  function addEntireRoom() {
    if (!scene) return;
    startTransition(async () => {
      for (const spot of scene.spots) {
        await addToCartAction(spot.variantId, 1);
      }
      setAddedId("ALL_ROOM");
      setTimeout(() => setAddedId(null), 2500);
    });
  }

  if (!scene) return null;

  const totalRoomPrice = scene.spots.reduce((sum, s) => sum + s.price, 0);

  return (
    <div className="space-y-10">
      {/* Scene Selector Tabs */}
      <div className="flex flex-wrap gap-3 border-b border-[var(--border-subtle)] pb-5">
        {scenes.map((s, idx) => {
          const active = idx === activeSceneIdx;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => selectScene(idx)}
              className={cn(
                "border px-5 py-3 text-left transition-colors",
                active
                  ? "border-[var(--accent)] bg-[var(--surface-raised)] text-[var(--text-primary)]"
                  : "border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]",
              )}
            >
              <span className="block text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
                {s.location}
              </span>
              <span className="mt-0.5 block font-display text-lg">{s.title}</span>
            </button>
          );
        })}
      </div>

      {/* Interactive Hotspot Stage + Sidebar */}
      <div className="grid items-start gap-8 lg:grid-cols-[1.35fr_1fr]">
        {/* Left: Interactive Room Canvas */}
        <div className="relative aspect-[4/3] w-full overflow-hidden border border-[var(--border-subtle)] bg-[var(--surface-media)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={scene.heroImage}
            alt={scene.title}
            className="h-full w-full object-cover transition-all duration-500"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/15 to-transparent" />

          {/* Hotspot Pins */}
          {scene.spots.map((spot, index) => {
            const isSelected = spot.id === activeSpotId;
            return (
              <button
                key={spot.id}
                type="button"
                onClick={() => setActiveSpotId(spot.id)}
                style={{ left: `${spot.xPercent}%`, top: `${spot.yPercent}%` }}
                className={cn(
                  "group absolute -translate-x-1/2 -translate-y-1/2 transition-transform",
                  isSelected ? "z-20 scale-110" : "z-10 hover:scale-110",
                )}
                aria-label={`Inspect ${spot.title}`}
              >
                <span
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-full border-2 text-xs font-semibold shadow-lg transition-colors",
                    isSelected
                      ? "border-white bg-[var(--accent)] text-white"
                      : "border-white/90 bg-black/75 text-white hover:bg-[var(--accent)]",
                  )}
                >
                  {index + 1}
                </span>
                <span className="pointer-events-none absolute left-1/2 top-11 hidden -translate-x-1/2 whitespace-nowrap border border-white/20 bg-black/85 px-2.5 py-1 text-[11px] text-white backdrop-blur-sm sm:group-hover:block">
                  {spot.title} · {formatConvertedFromMinorGhs(spot.price, currency)}
                </span>
              </button>
            );
          })}

          {/* Bottom Caption Overlay */}
          <div className="absolute bottom-4 left-4 right-4 flex flex-wrap items-end justify-between gap-4 text-white sm:bottom-6 sm:left-6 sm:right-6">
            <div className="max-w-md">
              <p className="text-[11px] uppercase tracking-[0.2em] text-amber-200">
                {scene.eyebrow} · Click numbered pins to inspect pieces
              </p>
              <h2 className="mt-1 font-display text-2xl sm:text-3xl">{scene.title}</h2>
            </div>
            <button
              type="button"
              disabled={pending}
              onClick={addEntireRoom}
              className="inline-flex items-center gap-2 bg-white px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-ink-950 transition-colors hover:bg-amber-100 disabled:opacity-60"
            >
              {pending && addedId === "ALL_ROOM" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : addedId === "ALL_ROOM" ? (
                <Check className="h-3.5 w-3.5 text-sage-600" aria-hidden />
              ) : (
                <Sparkles className="h-3.5 w-3.5 text-[#8C6528]" aria-hidden />
              )}
              {addedId === "ALL_ROOM"
                ? "Full Room Added to Bag!"
                : `Add Entire Room · ${formatConvertedFromMinorGhs(totalRoomPrice, currency)}`}
            </button>
          </div>
        </div>

        {/* Right: Curated Pieces in this Room */}
        <div className="border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-5 sm:p-6">
          <div className="border-b border-[var(--border-subtle)] pb-4">
            <p className="lx-eyebrow">Pieces in this room ({scene.spots.length})</p>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">{scene.description}</p>
          </div>

          <ul className="divide-y divide-[var(--border-subtle)]">
            {scene.spots.map((spot, index) => {
              const isSelected = spot.id === activeSpotId;
              const justAdded = addedId === spot.id;
              return (
                <li
                  key={spot.id}
                  onClick={() => setActiveSpotId(spot.id)}
                  className={cn(
                    "flex cursor-pointer items-center gap-4 py-4 transition-colors",
                    isSelected ? "bg-[var(--accent)]/5 -mx-3 px-3" : "hover:bg-[var(--surface-sunken)]/50",
                  )}
                >
                  <span
                    className={cn(
                      "grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-medium",
                      isSelected
                        ? "bg-[var(--accent)] text-white"
                        : "border border-[var(--border-strong)] text-[var(--text-secondary)]",
                    )}
                  >
                    {index + 1}
                  </span>

                  <div className="h-16 w-14 shrink-0 overflow-hidden bg-[var(--surface-media)]">
                    {spot.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={spot.imageUrl} alt="" className="h-full w-full object-cover" />
                    ) : null}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Link
                        href={`/product/${spot.slug}`}
                        className="truncate text-sm font-medium hover:text-[var(--accent)] hover:underline"
                      >
                        {spot.title}
                      </Link>
                      {spot.isPreorder ? (
                        <span className="inline-flex items-center gap-1 border border-amber-800/30 bg-amber-950/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.1em] text-[#8C6528]">
                          <Clock className="h-2.5 w-2.5" aria-hidden />
                          Pre-Order{spot.preorderLeadTime ? ` · ${spot.preorderLeadTime}` : ""}
                        </span>
                      ) : (
                        <span className="text-[10px] uppercase tracking-[0.1em] text-sage-600">
                          In Stock
                        </span>
                      )}
                    </div>

                    <p className="mt-1 text-sm font-semibold tabular-nums">
                      {formatConvertedFromMinorGhs(spot.price, currency)}
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled={pending}
                    onClick={(e) => {
                      e.stopPropagation();
                      addSinglePiece(spot.variantId, spot.id);
                    }}
                    className="inline-flex shrink-0 items-center gap-1.5 border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-xs font-medium uppercase tracking-[0.1em] transition-colors hover:border-[var(--accent)] hover:bg-[var(--accent)] hover:text-white disabled:opacity-50"
                  >
                    {justAdded ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-sage-600" aria-hidden />
                        Added
                      </>
                    ) : (
                      <>
                        <Plus className="h-3.5 w-3.5" aria-hidden />
                        {spot.isPreorder ? "Reserve" : "Add"}
                      </>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-subtle)] pt-4">
            <div>
              <span className="block text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">
                Complete Room Curated Total
              </span>
              <span className="font-display text-2xl font-semibold tabular-nums">
                {formatConvertedFromMinorGhs(totalRoomPrice, currency)}
              </span>
            </div>
            <Link
              href="/checkout"
              className="inline-flex items-center gap-2 bg-[var(--accent)] px-5 py-3 text-xs font-medium uppercase tracking-[0.14em] text-[var(--accent-contrast)]"
            >
              <ShoppingBag className="h-3.5 w-3.5" aria-hidden />
              Proceed to Bag
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
