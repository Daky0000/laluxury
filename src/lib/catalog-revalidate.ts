import { revalidatePath } from "next/cache";
import { invalidateCatalogFacetsCache } from "@/lib/catalog";

/**
 * Revalidates storefront and admin paths whenever a product is created,
 * updated, or deleted. Ensures changes in the custom app or admin console
 * are live immediately across the storefront.
 */
export function revalidateProductCatalog(id?: string, slug?: string): void {
  invalidateCatalogFacetsCache();
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
