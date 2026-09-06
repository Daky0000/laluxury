"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Cookie, X } from "lucide-react";
import {
  CONSENT_OPEN_EVENT,
  CONSENT_UNKNOWN,
  consentSnapshot,
  newConsent,
  parseConsent,
  serverConsentSnapshot,
  subscribeToConsent,
  writeConsentCookie,
} from "@/lib/consent";

/**
 * The cookie notice.
 *
 * Built to the shape the GDPR and the ePrivacy Directive actually ask for:
 *
 *  - Nothing beyond the strictly necessary cookies is set before a choice is
 *    made, so the banner is a gate rather than a notification.
 *  - "Reject" is one tap, in the same place and the same weight as "Accept".
 *    A refusal that costs more clicks than agreement is not freely given.
 *  - The categories are separable, and each is off by default. A pre-ticked box
 *    is not consent.
 *  - The choice can be withdrawn later, as easily as it was given — the footer
 *    carries a "Cookie settings" link that reopens this panel.
 *
 * Continuing to browse is deliberately *not* treated as agreement, and there is
 * no close-without-choosing on the first view: dismissing the bar would leave
 * the visitor in an unrecorded state, and an unrecorded state means no consent.
 */
export function CookieConsent() {
  const [reopened, setReopened] = useState(false);
  const [detail, setDetail] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  // The cookie itself is the state. On the server the snapshot is the "not
  // asked" sentinel, so nothing renders until hydration — which is what keeps
  // the bar from flashing in front of someone who answered months ago.
  const raw = useSyncExternalStore(subscribeToConsent, consentSnapshot, serverConsentSnapshot);
  const known = raw !== CONSENT_UNKNOWN;
  const record = useMemo(() => (known ? parseConsent(raw) : null), [known, raw]);

  // The footer link, and anything else that wants to reopen the choice.
  useEffect(() => {
    function reopen() {
      const stored = parseConsent(consentSnapshot());
      setAnalytics(stored?.analytics ?? false);
      setMarketing(stored?.marketing ?? false);
      setDetail(true);
      setReopened(true);
    }

    window.addEventListener(CONSENT_OPEN_EVENT, reopen);
    return () => window.removeEventListener(CONSENT_OPEN_EVENT, reopen);
  }, []);

  function save(choice: { analytics: boolean; marketing: boolean }) {
    // Writing the cookie notifies the store, which re-renders this with a
    // record in hand — so the bar closes because the choice exists, not
    // because a flag says so.
    writeConsentCookie(newConsent(choice));
    setReopened(false);
    setDetail(false);
  }

  const open = known && (record === null || reopened);
  if (!open) return null;

  /** Only offered on a reopen — a first view has to end in a choice. */
  const dismissable = record !== null;

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="cookie-consent-title"
      className="lx-safe-b fixed inset-x-0 bottom-0 z-50 border-t border-[var(--border-strong)] bg-[var(--surface-raised)] shadow-[0_-8px_32px_rgba(26,26,24,0.12)]"
    >
      <div className="lx-container relative flex flex-col gap-4 py-5 md:flex-row md:items-start md:gap-8 md:py-6">
        {dismissable ? (
          <button
            type="button"
            onClick={() => {
              setReopened(false);
              setDetail(false);
            }}
            className="lx-tap-tight absolute right-3 top-2 text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] md:right-8"
          >
            <X className="h-4 w-4" aria-hidden />
            <span className="sr-only">Close cookie settings</span>
          </button>
        ) : null}

        <div className="min-w-0 flex-1">
          <p id="cookie-consent-title" className="flex items-center gap-2 text-base">
            <Cookie className="h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden />
            Cookies on this site
          </p>

          <p className="mt-2 max-w-[62ch] text-sm font-light leading-relaxed text-[var(--text-secondary)]">
            We use a few cookies that the shop cannot work without — keeping you signed in and
            remembering what is in your bag. Everything else is optional and stays off unless you
            switch it on. You can change your mind at any time.{" "}
            <Link href="/cookies" className="underline underline-offset-4 hover:text-[var(--accent)]">
              Cookie policy
            </Link>{" "}
            ·{" "}
            <Link href="/privacy" className="underline underline-offset-4 hover:text-[var(--accent)]">
              Privacy notice
            </Link>
          </p>

          {detail ? (
            <ul className="mt-4 flex flex-col gap-3 border-t border-[var(--border-subtle)] pt-4">
              <Category
                title="Strictly necessary"
                body="Your session, your bag, checkout security and this choice itself. These cannot be turned off — without them the shop does not function."
                checked
                locked
              />
              <Category
                title="Analytics"
                body="Anonymous counts of which pages and products get looked at, so we know what to stock more of. Never used to identify you."
                checked={analytics}
                onChange={setAnalytics}
              />
              <Category
                title="Marketing"
                body="Lets us measure whether an advert led to an order, and show you our pieces on other sites. Off unless you say otherwise."
                checked={marketing}
                onChange={setMarketing}
              />
            </ul>
          ) : null}
        </div>

        {/* Accept and reject are the same size, the same colour weight and the
            same distance from the thumb. */}
        <div className="flex shrink-0 flex-col gap-2.5 md:w-[280px]">
          {detail ? (
            <button
              type="button"
              onClick={() => save({ analytics, marketing })}
              className="lx-cta w-full text-sm"
            >
              Save my choices
            </button>
          ) : null}

          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => save({ analytics: false, marketing: false })}
              className="lx-cta-ghost w-full text-sm"
            >
              Reject all
            </button>
            <button
              type="button"
              onClick={() => save({ analytics: true, marketing: true })}
              className="lx-cta w-full text-sm"
            >
              Accept all
            </button>
          </div>

          {!detail ? (
            <button
              type="button"
              onClick={() => setDetail(true)}
              className="min-h-11 text-sm text-[var(--text-secondary)] underline underline-offset-4 transition-colors hover:text-[var(--accent)]"
            >
              Choose which cookies
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Category({
  title,
  body,
  checked,
  locked = false,
  onChange,
}: {
  title: string;
  body: string;
  checked: boolean;
  locked?: boolean;
  onChange?: (next: boolean) => void;
}) {
  return (
    <li className="flex items-start gap-3">
      <input
        type="checkbox"
        checked={checked}
        disabled={locked}
        onChange={(event) => onChange?.(event.target.checked)}
        className="mt-1 h-4 w-4 shrink-0 accent-[var(--accent)] disabled:opacity-60"
        id={`consent-${title.replace(/\s+/g, "-").toLowerCase()}`}
      />
      <label
        htmlFor={`consent-${title.replace(/\s+/g, "-").toLowerCase()}`}
        className="min-w-0 text-sm"
      >
        <span className="block text-[var(--text-primary)]">
          {title}
          {locked ? (
            <span className="ml-2 text-sm text-[var(--text-muted)]">always on</span>
          ) : null}
        </span>
        <span className="mt-0.5 block font-light leading-relaxed text-[var(--text-secondary)]">
          {body}
        </span>
      </label>
    </li>
  );
}

/**
 * The footer's way back in. A separate component so the footer stays a server
 * component.
 */
export function CookieSettingsLink({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(CONSENT_OPEN_EVENT))}
      className={className}
    >
      Cookie settings
    </button>
  );
}
