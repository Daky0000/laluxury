import { SiteShell } from "@/components/shop/site-shell";

export default function ShopLayout({ children }: LayoutProps<"/">) {
  return <SiteShell>{children}</SiteShell>;
}
