import { revalidatePath } from "next/cache";
import { invalidateCatalogFacetsCache } from "@/lib/catalog";

/**
 * Revalidates storefront and admin paths whenever a product is created,
 * updated, or deleted. Ensures changes in the custom app or admin console
 * are live immediately across the storefront.
 */
export function revalidateProductCatalog(id?: string): void {
  invalidateCatalogFacetsCache();
  revalidatePath("/admin/products");
  revalidatePath("/admin/preorders");
  if (id) revalidatePath(`/admin/products/${id}`);
  revalidatePath("/shop");
  revalidatePath("/pre-order");
  revalidatePath("/");
  revalidatePath("/product/[slug]", "page");
}
