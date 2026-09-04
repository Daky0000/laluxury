import Link from "next/link";
import type { StoreSettings } from "@/lib/settings";

/**
 * The opening image and headline. Its copy, image and both buttons are store
 * settings rather than section fields, so the section itself only decides
 * whether the hero shows and where in the page it sits.
 */
export function Hero({ settings }: { settings: StoreSettings }) {
  return (
    <section className="relative h-[88vh] min-h-[560px] overflow-hidden md:min-h-[640px]">
      {settings.heroImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={settings.heroImageUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
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

      <div className="lx-container relative flex h-full flex-col justify-end pb-16">
        {settings.heroEyebrow ? (
          <p className="mb-5 text-sm uppercase tracking-[0.34em] text-[#EDEAE3]">
            {settings.heroEyebrow}
          </p>
        ) : null}

        <h1 className="max-w-[760px] text-[clamp(2.75rem,8vw,5.5rem)] leading-[0.98] text-[#FBFAF6]">
          {settings.heroTitle}
          {settings.heroTitleAccent ? (
            <>
              <br />
              <em className="font-medium">{settings.heroTitleAccent}</em>
            </>
          ) : null}
        </h1>

        {settings.heroBody ? (
          <p className="mt-6 max-w-[440px] text-base leading-relaxed font-light text-[#E4E1D9]">
            {settings.heroBody}
          </p>
        ) : null}

        <div className="mt-8 flex flex-wrap gap-4">
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
