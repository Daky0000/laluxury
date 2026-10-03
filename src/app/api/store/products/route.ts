import { storeOptions, storeResponse } from "@/lib/store-api";
import { storeProductList } from "@/lib/store-products";

export const OPTIONS = storeOptions;
export async function GET(request: Request) {
  return storeResponse(await storeProductList(new URL(request.url)));
}
