import Link from "next/link";
import type { StoreSettings } from "@/lib/settings";
import { formatPrice } from "@/lib/money";
import { Photo } from "@/components/shop/photo";

/**
 * The wide offer banner. Its copy, image and prices are store settings, so the
 * section only decides where it sits and whether it shows; a blank bundle
 * heading still hides it, which is how it has always been switched off.
 */
export function BundleBanner({ settings }: { settings: StoreSettings }) {
  if (!settings.bundleTitle) return null;

  const saving =
    settings.bundlePrice !== null && settings.bundleCompareAtPrice !== null
      ? settings.bundleCompareAtPrice - settings.bundlePrice
      : 0;

  return (
    <section className="relative mt-0 overflow-hidden">
      {settings.bundleImageUrl ? (
        <Photo src={settings.bundleImageUrl} sizes="100vw" />
      ) : (
        <div className="absolute inset-0 bg-[var(--surface-media)]" />
      )}

      {/* The wash runs left-to-right behind the copy on a wide banner. On a
          phone the copy fills the width, so a horizontal wash leaves the last
          words of every line on bare photograph; there it runs top-to-bottom
          instead and the text keeps its contrast whatever is underneath. */}
      <div
        className="pointer-events-none absolute inset-0 md:hidden"
        style={{
          background:
            "linear-gradient(180deg, rgba(43,39,36,.55) 0%, rgba(43,39,36,.78) 100%)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 hidden md:block"
        style={{
          background:
            "linear-gradient(90deg, rgba(43,39,36,.86) 0%, rgba(43,39,36,.45) 50%, rgba(43,39,36,.12) 100%)",
        }}
      />

      <div className="lx-container relative flex min-h-[420px] flex-col justify-center py-14 sm:min-h-[500px] sm:py-20 md:min-h-[600px] md:py-24">
        {settings.bundleEyebrow ? (
          <p className="text-xs uppercase tracking-[0.24em] text-[#EDEAE3] sm:tracking-[0.32em]">
            {settings.bundleEyebrow}
          </p>
        ) : null}

        <h2 className="my-4 max-w-[520px] text-[clamp(1.875rem,6vw,3.625rem)] leading-[1.06] text-[#FBFAF6] sm:my-5 sm:leading-[1.02]">
          {settings.bundleTitle}
        </h2>

        {settings.bundleBody ? (
          <p className="max-w-[400px] text-sm sm:text-base font-light leading-relaxed text-[#E4E1D9]">
            {settings.bundleBody}
          </p>
        ) : null}

        {settings.bundlePrice !== null ? (
          <div className="my-6 flex flex-wrap items-baseline gap-x-4 gap-y-2 sm:my-8">
            <span className="font-display text-[clamp(1.75rem,7vw,2.25rem)] text-[#FBFAF6] tabular-nums">
              {formatPrice(settings.bundlePrice)}
            </span>
            {settings.bundleCompareAtPrice !== null ? (
              <span className="text-lg text-[#A9A6A0] line-through">
                {formatPrice(settings.bundleCompareAtPrice)}
              </span>
            ) : null}
            {saving > 0 ? (
              <span className="border border-[rgba(253,250,244,.4)] px-3 py-1.5 text-xs uppercase tracking-[0.12em] text-[#EDEAE3]">
                Save {formatPrice(saving)}
              </span>
            ) : null}
          </div>
        ) : null}

        <Link
          href={settings.bundleHref || "/shop"}
          className="lx-cta w-full self-start sm:w-auto"
        >
          Shop the set
        </Link>
      </div>
    </section>
  );
}
