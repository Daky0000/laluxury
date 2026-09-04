import Link from "next/link";
import type { StoreSettings } from "@/lib/settings";
import { formatPrice } from "@/lib/money";

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
    <section className="relative mt-16 min-h-[600px] overflow-hidden">
      {settings.bundleImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={settings.bundleImageUrl}
          alt=""
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 bg-[var(--surface-media)]" />
      )}

      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(90deg, rgba(43,39,36,.86) 0%, rgba(43,39,36,.45) 50%, rgba(43,39,36,.12) 100%)",
        }}
      />

      <div className="lx-container relative flex min-h-[600px] flex-col justify-center py-24">
        {settings.bundleEyebrow ? (
          <p className="text-sm uppercase tracking-[0.32em] text-[#EDEAE3]">
            {settings.bundleEyebrow}
          </p>
        ) : null}

        <h2 className="my-5 max-w-[520px] text-[clamp(2.25rem,5vw,3.625rem)] leading-[1.02] text-[#FBFAF6]">
          {settings.bundleTitle}
        </h2>

        {settings.bundleBody ? (
          <p className="max-w-[400px] text-base font-light leading-relaxed text-[#E4E1D9]">
            {settings.bundleBody}
          </p>
        ) : null}

        {settings.bundlePrice !== null ? (
          <div className="my-8 flex flex-wrap items-baseline gap-4">
            <span className="text-[2.25rem] text-[#FBFAF6] tabular-nums">
              {formatPrice(settings.bundlePrice)}
            </span>
            {settings.bundleCompareAtPrice !== null ? (
              <span className="text-lg text-[#A9A6A0] line-through">
                {formatPrice(settings.bundleCompareAtPrice)}
              </span>
            ) : null}
            {saving > 0 ? (
              <span className="border border-[rgba(253,250,244,.4)] px-3 py-1.5 text-sm uppercase tracking-[0.1em] text-[#EDEAE3]">
                Save {formatPrice(saving)}
              </span>
            ) : null}
          </div>
        ) : null}

        <Link href={settings.bundleHref || "/shop"} className="lx-cta self-start">
          Shop the set
        </Link>
      </div>
    </section>
  );
}
