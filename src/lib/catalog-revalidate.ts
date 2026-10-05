import { revalidatePath, revalidateTag } from "next/cache";
import { invalidateCatalogFacetsCache } from "@/lib/catalog";

/**
 * Revalidates storefront and admin paths whenever a product is created,
 * updated, or deleted. Ensures changes in the custom app or admin console
 * are live immediately across the storefront.
 */
export function revalidateProductCatalog(id?: string, slug?: string): void {
  invalidateCatalogFacetsCache();
  try {
    revalidateCatalogPaths(id, slug);
  } catch (error) {
    // Background callers (webhooks, agent jobs) run outside a request, where
    // Next cannot revalidate; the short public cache TTL covers them.
    console.warn("[catalog.revalidate] skipped outside request", error);
  }
}

function revalidateCatalogPaths(id?: string, slug?: string): void {
  revalidateTag("public-catalog", { expire: 0 });
  revalidatePath("/api/store/products");
  if (id) revalidatePath(`/api/store/products/${id}`);
  if (slug) revalidatePath(`/api/store/products/${slug}`);
  revalidatePath("/admin/products");
  revalidatePath("/admin/preorders");
  revalidatePath("/admin/inventory");
  revalidatePath("/admin");
  if (id) revalidatePath(`/admin/products/${id}`);
  if (slug) revalidatePath(`/product/${slug}`);
  revalidatePath("/shop");
  revalidatePath("/pre-order");
  revalidatePath("/");
  revalidatePath("/product/[slug]", "page");
}
