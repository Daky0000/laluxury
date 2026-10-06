import { db } from "@/lib/db";
import { getIntegrations } from "@/lib/integrations";
import {
  DEFAULT_ATTEMPTS_PER_MODEL,
  DEFAULT_CONCURRENCY,
  MAX_MODELS_PER_TASK,
  envModels,
  type AiPolicy,
  type AiProfile,
  type AiVendor,
} from "./default-models";

/**
 * Bulk Product AI configuration: environment defaults, overridden by the
 * advanced admin settings stored under the "bulkAi" settings key.
 */

export const BULK_AI_SETTING_KEY = "bulkAi";

export type BulkAiConfig = {
  bulkAiEnabled: boolean;
  /** OpenRouter or NVIDIA NIM; each keeps its own three model chains. */
  bulkAiVendor: AiVendor;
  bulkAiPolicy: AiPolicy;
  bulkAiFastModels: string[];
  bulkAiComplexModels: string[];
  bulkAiVisionModels: string[];
  bulkAiNvidiaFastModels: string[];
  bulkAiNvidiaComplexModels: string[];
  bulkAiNvidiaVisionModels: string[];
  bulkAiAttemptsPerModel: number;
  bulkAiFastConcurrency: number;
  bulkAiComplexConcurrency: number;
  bulkAiVisionConcurrency: number;
};

export function envBulkAiConfig(): BulkAiConfig {
  const policy = process.env.BULK_AI_POLICY;
  return {
    bulkAiEnabled: process.env.BULK_AI_ENABLED !== "false",
    bulkAiVendor: process.env.BULK_AI_VENDOR === "NVIDIA" ? "NVIDIA" : "OPENROUTER",
    bulkAiPolicy: policy === "FREE_THEN_PAID" || policy === "PAID_ONLY" ? policy : "FREE_ONLY",
    bulkAiFastModels: envModels("FAST_TEXT"),
    bulkAiComplexModels: envModels("COMPLEX_TEXT"),
    bulkAiVisionModels: envModels("VISION"),
    bulkAiNvidiaFastModels: envModels("FAST_TEXT", "NVIDIA"),
    bulkAiNvidiaComplexModels: envModels("COMPLEX_TEXT", "NVIDIA"),
    bulkAiNvidiaVisionModels: envModels("VISION", "NVIDIA"),
    bulkAiAttemptsPerModel: DEFAULT_ATTEMPTS_PER_MODEL,
    bulkAiFastConcurrency: DEFAULT_CONCURRENCY.FAST_TEXT,
    bulkAiComplexConcurrency: DEFAULT_CONCURRENCY.COMPLEX_TEXT,
    bulkAiVisionConcurrency: DEFAULT_CONCURRENCY.VISION,
  };
}

let cached: { value: BulkAiConfig; expiresAt: number } | null = null;

export function invalidateBulkAiConfig(): void {
  cached = null;
}

export async function getBulkAiConfig(): Promise<BulkAiConfig> {
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const row = await db.setting.findUnique({ where: { key: BULK_AI_SETTING_KEY } });
  const stored = (row?.value ?? {}) as Partial<BulkAiConfig>;
  const base = envBulkAiConfig();
  const value: BulkAiConfig = { ...base };
  for (const [k, v] of Object.entries(stored)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v) && v.filter(Boolean).length === 0) continue;
    (value as Record<string, unknown>)[k] = v;
  }
  value.bulkAiAttemptsPerModel = clamp(value.bulkAiAttemptsPerModel, 1, 5);
  cached = { value, expiresAt: Date.now() + 60_000 };
  return value;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(Number(n) || min)));
}

/** Defaults from earlier releases that OpenRouter no longer serves to this app. */
const RETIRED_MODELS = new Set(["inclusionai/ling-3.0-flash-vl:free", "thinkingmachines/inkling:free"]);

export function isFreeModel(id: string): boolean {
  return id.endsWith(":free");
}

/**
 * The model chain for a profile, after the spending policy is applied.
 * FREE_ONLY never yields a paid model — a misconfigured paid slug is dropped,
 * not silently used.
 */
export function modelsFor(config: BulkAiConfig, profile: AiProfile): string[] {
  if (config.bulkAiVendor === "NVIDIA") {
    const raw =
      profile === "FAST_TEXT"
        ? config.bulkAiNvidiaFastModels
        : profile === "COMPLEX_TEXT"
          ? config.bulkAiNvidiaComplexModels
          : config.bulkAiNvidiaVisionModels;
    const clean = [...new Set((raw ?? []).map((m) => m.trim()).filter(Boolean))];
    // NVIDIA's hosted models carry no ":free" suffix and cost nothing on a developer key.
    return (clean.length ? clean : envModels(profile, "NVIDIA")).slice(0, MAX_MODELS_PER_TASK);
  }
  const raw =
    profile === "FAST_TEXT"
      ? config.bulkAiFastModels
      : profile === "COMPLEX_TEXT"
        ? config.bulkAiComplexModels
        : config.bulkAiVisionModels;
  let clean = [...new Set(raw.map((m) => m.trim()).filter((m) => m && !RETIRED_MODELS.has(m)))];
  // Saved settings may still list only retired models; fall back to the defaults.
  if (!clean.length) clean = envModels(profile);

  let chain: string[];
  switch (config.bulkAiPolicy) {
    case "FREE_ONLY":
      chain = clean.filter(isFreeModel);
      break;
    case "PAID_ONLY":
      chain = clean.filter((m) => !isFreeModel(m));
      break;
    case "FREE_THEN_PAID":
      chain = [...clean.filter(isFreeModel), ...clean.filter((m) => !isFreeModel(m))];
      break;
  }
  return chain.slice(0, MAX_MODELS_PER_TASK);
}

export function concurrencyFor(config: BulkAiConfig, profile: AiProfile): number {
  const n =
    profile === "FAST_TEXT"
      ? config.bulkAiFastConcurrency
      : profile === "COMPLEX_TEXT"
        ? config.bulkAiComplexConcurrency
        : config.bulkAiVisionConcurrency;
  return clamp(n, 1, 20);
}

/** The OpenRouter key — the store's existing one unless a dedicated key is set. */
export async function openRouterKey(): Promise<string> {
  const dedicated = process.env.BULK_AI_OPENROUTER_API_KEY?.trim();
  if (dedicated) return dedicated;
  const integrations = await getIntegrations();
  return integrations.ai.openrouterApiKey;
}

/** The NVIDIA NIM key: BULK_AI_NVIDIA_API_KEY, else Settings → Integrations (NVIDIA_API_KEY). */
export async function nvidiaKey(): Promise<string> {
  const dedicated = process.env.BULK_AI_NVIDIA_API_KEY?.trim();
  if (dedicated) return dedicated;
  const integrations = await getIntegrations();
  return integrations.ai.nvidiaApiKey ?? "";
}

/** The key for whichever vendor is switched on. */
export async function vendorKey(config: BulkAiConfig): Promise<string> {
  return config.bulkAiVendor === "NVIDIA" ? nvidiaKey() : openRouterKey();
}

/** Models known to accept image input. Anything in the VISION chain is assumed to. */
export function supportsImages(config: BulkAiConfig, model: string): boolean {
  return config.bulkAiVisionModels.includes(model) || config.bulkAiNvidiaVisionModels.includes(model);
}
