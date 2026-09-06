"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { setMarketingPreferenceAction } from "@/app/actions/misc";

/**
 * The marketing opt-in, on the account page.
 *
 * It is a switch rather than a form with a save button because withdrawing
 * consent has to cost no more than giving it did — and a saved preference the
 * customer has to remember to submit is a preference that quietly stays on.
 */
export function MarketingToggle({ initial }: { initial: boolean }) {
  const [accepted, setAccepted] = useState(initial);
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function change(next: boolean) {
    // Moved straight away, and put back if the write fails: the switch should
    // follow the thumb, not the round trip.
    setAccepted(next);
    setNote(null);
    start(async () => {
      const result = await setMarketingPreferenceAction(next);
      if (!result.ok) {
        setAccepted(!next);
        setNote(result.message ?? "That did not save. Try again.");
        return;
      }
      setNote(result.message ?? null);
    });
  }

  return (
    <div>
      <label className="flex items-start gap-2.5 text-sm text-[var(--text-secondary)]">
        <input
          type="checkbox"
          checked={accepted}
          disabled={pending}
          onChange={(event) => change(event.target.checked)}
          className="mt-0.5 accent-[var(--accent)]"
        />
        <span className="min-w-0 font-light leading-relaxed">
          Text and email me about new arrivals and restocks.
        </span>
      </label>

      <p aria-live="polite" className="mt-1.5 flex items-center gap-1.5 text-sm text-[var(--text-muted)]">
        {pending ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : null}
        {note ?? "You can change this whenever you like."}
      </p>
    </div>
  );
}
