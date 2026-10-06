import type { AiVendor } from "./default-models";

/**
 * The models a provider serves right now, for the settings picker. Read live
 * from the provider so the owner chooses from what actually exists instead of
 * a list baked into the code.
 */

export type CatalogModel = {
  id: string;
  name: string;
  free: boolean;
  vision: boolean;
  contextLength?: number;
};

const g = globalThis as unknown as { bulkAiCatalog?: Map<string, { at: number; models: CatalogModel[] }> };
const cache = (g.bulkAiCatalog ??= new Map());
const TTL_MS = 10 * 60_000;

/** NVIDIA's list has no modality flags; these name fragments mark image-capable models. */
const NVIDIA_VISION = /vision|-vl\b|vl-|omni|multimodal|maverick|scout|vila|llava|kosmos|paligemma|gemma-3/i;

/** Embedding, reranking, safety and speech models cannot write product copy. */
const NOT_CHAT = /embed|rerank|retriever|guard|safety|reward|parakeet|canary|whisper|tts|asr|clip|nv-dino|detector|ocr|cosmos|flux|stable-diffusion|sdxl|bge|e5-/i;

export async function listVendorModels(vendor: AiVendor, apiKey: string): Promise<CatalogModel[]> {
  const key = `${vendor}:${apiKey.slice(-6)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.models;

  const models = vendor === "NVIDIA" ? await nvidiaModels(apiKey) : await openRouterModels(apiKey);
  models.sort((a, b) => Number(b.free) - Number(a.free) || a.name.localeCompare(b.name));
  cache.set(key, { at: Date.now(), models });
  return models;
}

async function openRouterModels(apiKey: string): Promise<CatalogModel[]> {
  const res = await fetch("https://openrouter.ai/api/v1/models", {
    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`OpenRouter model list failed (${res.status}).`);
  const body = (await res.json()) as {
    data?: {
      id: string;
      name?: string;
      context_length?: number;
      pricing?: { prompt?: string; completion?: string };
      architecture?: { input_modalities?: string[]; output_modalities?: string[] };
    }[];
  };
  return (body.data ?? [])
    .filter((m) => !m.architecture?.output_modalities || m.architecture.output_modalities.includes("text"))
    .map((m) => ({
      id: m.id,
      name: m.name ?? m.id,
      free: m.id.endsWith(":free") || (Number(m.pricing?.prompt) === 0 && Number(m.pricing?.completion) === 0),
      vision: Boolean(m.architecture?.input_modalities?.includes("image")),
      contextLength: m.context_length,
    }));
}

async function nvidiaModels(apiKey: string): Promise<CatalogModel[]> {
  const res = await fetch("https://integrate.api.nvidia.com/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`NVIDIA model list failed (${res.status}).`);
  const body = (await res.json()) as { data?: { id: string }[] };
  return (body.data ?? [])
    .filter((m) => !NOT_CHAT.test(m.id))
    .map((m) => ({
      id: m.id,
      name: m.id,
      // Hosted NIM models are free on a developer key.
      free: true,
      vision: NVIDIA_VISION.test(m.id),
    }));
}
