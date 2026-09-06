import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Jost } from "next/font/google";
import { env } from "@/lib/env";
import "./globals.css";

const display = Cormorant_Garamond({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  display: "swap",
});

const body = Jost({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  // Without this, every relative Open Graph image on a product page resolves
  // against localhost, so a link shared to WhatsApp — which is how most of this
  // shop's traffic arrives — previews with no picture.
  metadataBase: new URL(env.siteUrl()),
  title: {
    default: "LaLuxury — Quiet luxury for the modern home",
    template: "%s · LaLuxury",
  },
  description:
    "Bedding, carpets, curtains and furnishings for Ghanaian homes. Delivered nationwide, paid by Mobile Money (MTN, Telecel, AirtelTigo), card or bank transfer.",
  openGraph: {
    type: "website",
    siteName: "LaLuxury",
  },
};

/**
 * `viewport-fit=cover` lets the page paint behind a phone's rounded corners and
 * notch, which is what the hero and the drawers want; everything that would
 * otherwise land underneath the notch or the home indicator asks for the inset
 * back through `env(safe-area-inset-*)`.
 *
 * `maximumScale` is deliberately absent. Capping it is the usual way a shop
 * stops iOS zooming on a focused field, and it also stops anyone who needs to
 * pinch-zoom a photograph or a price from doing so; the fields are all at the
 * 16px floor instead, which fixes the zoom without taking anything away.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f1f0ec" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1a18" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
