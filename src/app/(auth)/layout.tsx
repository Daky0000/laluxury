import { SiteShell } from "@/components/shop/site-shell";

/**
 * Sign-in and registration sit inside the same shell as the rest of the shop.
 * They used to render a wordmark-only header of their own, which meant the
 * search, the account link and the bag vanished the moment you tried to sign
 * in — and getting back to the catalogue meant the browser's back button.
 */
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <SiteShell mainClassName="flex items-start justify-center px-5 py-12 sm:py-16">
      {children}
    </SiteShell>
  );
}
