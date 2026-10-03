import { getPublicStoreConfig } from "@/lib/store-config";
import { storeOptions, storeResponse } from "@/lib/store-api";
export const OPTIONS = storeOptions;
export async function GET() { return storeResponse(await getPublicStoreConfig()); }
