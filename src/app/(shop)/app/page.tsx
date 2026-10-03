import type { Metadata } from "next";
import Link from "next/link";
import { Download, Smartphone, ShieldCheck, CheckCircle2, ArrowRight } from "lucide-react";
import { getAppReleaseInfo } from "@/lib/app-release";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Download Mobile App | Noble Enclave",
  description: "Download the Noble Enclave mobile app for Android to browse luxury living collections, track orders, and manage pieces.",
};

const DOWNLOAD_URL = "/api/app/download";

export default function AppDownloadPage() {
  const release = getAppReleaseInfo();

  return (
    <>
      {/* Header */}
      <section className="lx-container lx-page-header text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3.5 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--accent)] mb-3">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Version {release.version} &bull; Latest Release
        </div>
        <h1 className="mt-2 text-[clamp(2.25rem,5vw,3.5rem)] leading-tight font-serif text-[var(--text-primary)]">
          Noble Enclave Mobile App
        </h1>
        <p className="mx-auto mt-3 max-w-[620px] text-sm sm:text-base font-light leading-relaxed text-[var(--text-muted)]">
          The complete luxury living experience in your pocket. Browse handcrafted collections in GH₵, purchase seamlessly with Paystack or MoMo, or sign in to manage your orders and concierge services in real time.
        </p>

        {/* Primary CTA */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <a
            href={DOWNLOAD_URL}
            className="inline-flex items-center gap-2.5 rounded-none bg-[#7A2E3C] px-8 py-4 text-xs font-medium uppercase tracking-[0.16em] text-white shadow-md transition-all hover:bg-[#60232F]"
          >
            <Download className="h-4 w-4" />
            <span>Download Android APK (v{release.version})</span>
          </a>
          <Link
            href="/shop"
            className="inline-flex items-center gap-2 border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-6 py-4 text-xs font-medium uppercase tracking-[0.16em] text-[var(--text-primary)] transition-colors hover:border-[var(--border-strong)]"
          >
            <span>Browse Web Showroom</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </section>

      {/* Highlights */}
      <section className="lx-container py-12">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <div className="border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-7">
            <Smartphone className="h-6 w-6 text-[var(--accent)]" strokeWidth={1.5} />
            <h3 className="mt-4 font-display text-lg">Guest Catalog Browsing</h3>
            <p className="mt-2 text-sm font-light leading-relaxed text-[var(--text-secondary)]">
              Anyone can explore the live showroom collection without creating an account or logging in.
            </p>
          </div>

          <div className="border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-7">
            <ShieldCheck className="h-6 w-6 text-[var(--accent)]" strokeWidth={1.5} />
            <h3 className="mt-4 font-display text-lg">Store Owner 1-Tap Login</h3>
            <p className="mt-2 text-sm font-light leading-relaxed text-[var(--text-secondary)]">
              Convenient 1-tap auto-fill for store owner credentials to instantly unlock real-time pricing and stock adjustments.
            </p>
          </div>

          <div className="border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-7">
            <CheckCircle2 className="h-6 w-6 text-[var(--accent)]" strokeWidth={1.5} />
            <h3 className="mt-4 font-display text-lg">Web Storefront Sync</h3>
            <p className="mt-2 text-sm font-light leading-relaxed text-[var(--text-secondary)]">
              Direct links in product views allow opening any item on the live website with full customer checkout preview.
            </p>
          </div>
        </div>
      </section>

      {/* How to Install Guide */}
      <section className="lx-container max-w-[800px] py-12 sm:py-16">
        <div className="border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-8 sm:p-12">
          <h2 className="text-center font-display text-2xl sm:text-3xl">How to Install on Android</h2>
          <p className="mt-2 text-center text-sm font-light text-[var(--text-muted)]">
            Follow these 3 quick steps to get the app running on your Android device:
          </p>

          <ol className="mt-8 space-y-6">
            <li className="flex items-start gap-4">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--text-primary)] text-xs font-semibold text-[var(--surface-canvas)]">
                1
              </span>
              <div>
                <h4 className="text-sm font-medium uppercase tracking-[0.12em] text-[var(--text-primary)]">
                  Download the APK
                </h4>
                <p className="mt-1 text-sm font-light leading-relaxed text-[var(--text-secondary)]">
                  Tap the <strong>Download Android APK</strong> button above from your Android phone or tablet.
                </p>
              </div>
            </li>

            <li className="flex items-start gap-4">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--text-primary)] text-xs font-semibold text-[var(--surface-canvas)]">
                2
              </span>
              <div>
                <h4 className="text-sm font-medium uppercase tracking-[0.12em] text-[var(--text-primary)]">
                  Allow Installation
                </h4>
                <p className="mt-1 text-sm font-light leading-relaxed text-[var(--text-secondary)]">
                  Open your phone&rsquo;s <strong>Downloads</strong> and tap <code>{release.fileName}</code>. If prompted by your browser or Android system to allow unknown apps, toggle &ldquo;Allow from this source&rdquo;.
                </p>
              </div>
            </li>

            <li className="flex items-start gap-4">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--text-primary)] text-xs font-semibold text-[var(--surface-canvas)]">
                3
              </span>
              <div>
                <h4 className="text-sm font-medium uppercase tracking-[0.12em] text-[var(--text-primary)]">
                  Launch &amp; Enjoy
                </h4>
                <p className="mt-1 text-sm font-light leading-relaxed text-[var(--text-secondary)]">
                  Open the app from your home screen. Explore the live luxury collections or sign in seamlessly via phone number and SMS verification.
                </p>
              </div>
            </li>
          </ol>

          <div className="mt-10 border-t border-[var(--border-subtle)] pt-6 text-center">
            <p className="text-xs text-[var(--text-muted)]">
              Direct Download:{" "}
              <a
                href={DOWNLOAD_URL}
                className="underline hover:text-[var(--text-primary)]"
              >
                {DOWNLOAD_URL}
              </a>
              {" "}&bull; Version {release.version} (Build {release.versionCode})
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
