import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Header } from "./header";
import { Footer } from "./footer";
import { CartDrawer } from "./cart-drawer";
import { CookieConsent } from "./cookie-consent";

/**
 * One shell for every page the public sees.
 *
 * The store used to carry three different headers — the full one on the shop, a
 * bare wordmark on sign-in, and a stripped "secure checkout" bar during
 * payment — so the announcement bar, the search, the account link and the bag
 * appeared and disappeared as you moved through the site. They are one header
 * now, rendered from here, and every route group defers to it.
 *
 * A new page belongs in one of the storefront route groups, and gets this shell
 * for free by doing so. Nothing should render `Header` directly.
 *
 * The admin console is the one thing outside this: it is a back office with its
 * own navigation, not a page of the shop.
 */
export function SiteShell({
  children,
  /** Extra classes for `main` — the auth pages centre their card with these. */
  mainClassName,
}: {
  children: ReactNode;
  mainClassName?: string;
}) {
  return (
    <>
      <Header />
      <main className={cn("flex-1", mainClassName)}>{children}</main>
      <Footer />
      <CartDrawer />
      <CookieConsent />
    </>
  );
}
