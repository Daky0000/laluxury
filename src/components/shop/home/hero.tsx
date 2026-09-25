import Link from "next/link";
import type { StoreSettings } from "@/lib/settings";
import { Photo } from "@/components/shop/photo";

/**
 * The opening image and headline. Its copy, image and both buttons are store
 * settings rather than section fields, so the section itself only decides
 * whether the hero shows and where in the page it sits.
 */
export function Hero({ settings }: { settings: StoreSettings }) {
  return (
    // `svh` rather than `vh`: on a phone `vh` is measured against the viewport
    // with the browser's toolbar hidden, so a `88vh` hero is taller than the
    // screen on arrival and the buttons at its foot start below the fold. `svh`
    // is the smallest the viewport gets, which is what it is when the page
    // loads. The minimums keep the crop from collapsing in landscape.
    <section className="relative h-[88svh] min-h-[520px] overflow-hidden sm:min-h-[560px] md:min-h-[640px]">
      {settings.heroImageUrl ? (
        <Photo src={settings.heroImageUrl} priority sizes="100vw" />
      ) : (
        <div className="absolute inset-0 bg-[var(--surface-media)]" />
      )}

      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(43,39,36,.5) 0%, rgba(43,39,36,.12) 40%, rgba(43,39,36,.78) 100%)",
        }}
      />

      <div className="lx-container relative flex h-full flex-col justify-end pb-10 sm:pb-16">
        {settings.heroEyebrow ? (
          <p className="mb-4 text-xs uppercase tracking-[0.24em] text-[#EDEAE3] sm:mb-5 sm:tracking-[0.32em]">
            {settings.heroEyebrow}
          </p>
        ) : null}

        <h1 className="max-w-[760px] text-[clamp(2.25rem,8vw,5.5rem)] leading-[1.02] text-[#FBFAF6] sm:leading-[0.98]">
          {settings.heroTitle}
          {settings.heroTitleAccent ? (
            <>
              <br />
              <em className="font-medium">{settings.heroTitleAccent}</em>
            </>
          ) : null}
        </h1>

        {settings.heroBody ? (
          <p className="mt-5 max-w-[440px] text-sm sm:text-base leading-relaxed font-light text-[#E4E1D9] sm:mt-6">
            {settings.heroBody}
          </p>
        ) : null}

        {/* Stacked and full-bleed on a phone: side by side, two tracked-out
            uppercase labels each take most of the screen and the second wraps
            to three lines. */}
        <div className="mt-7 flex flex-col gap-3 sm:mt-8 sm:flex-row sm:flex-wrap sm:gap-4">
          <Link href="/shop" className="lx-cta">
            Explore the collection
          </Link>
          <a href="#rooms" className="lx-cta-ghost">
            Shop by room
          </a>
        </div>
      </div>
    </section>
  );
}
