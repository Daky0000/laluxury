import { db } from "@/lib/db";
import { storeOptions, storeResponse } from "@/lib/store-api";
import { storeProduct, storeProductSelect } from "@/lib/store-products";

export const OPTIONS = storeOptions;
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const product = await db.product.findFirst({
    where: { status: "ACTIVE", OR: [{ id }, { slug: id }] },
    select: {
      ...storeProductSelect, shortDescription: true, description: true, care: true,
      options: { orderBy: { position: "asc" }, select: {
        id: true, name: true, position: true,
        values: { orderBy: { position: "asc" }, select: { id: true, optionId: true, value: true, hexColor: true, position: true } },
      } },
    },
  });
  if (!product) return storeResponse({ error: "Product not found." }, 404);
  return storeResponse({ product: { ...storeProduct(product), shortDescription: product.shortDescription,
    description: product.description, care: product.care, options: product.options } });
}
