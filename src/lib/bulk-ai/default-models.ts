/**
 * Every model ID Bulk Product Add uses by default, in one place.
 *
 * Free OpenRouter endpoints come and go, so nothing else in the codebase names
 * a model. The environment can replace any slot (BULK_AI_FAST_MODEL_1 …), and
 * the advanced admin settings can replace the environment.
 */

export type AiProfile = "FAST_TEXT" | "COMPLEX_TEXT" | "VISION";
export type AiPolicy = "FREE_ONLY" | "FREE_THEN_PAID" | "PAID_ONLY";
/** Where Bulk Product Add sends its AI calls. The owner switches in settings. */
export type AiVendor = "OPENROUTER" | "NVIDIA";

export const DEFAULT_MODELS: Record<AiProfile, string[]> = {
  FAST_TEXT: [
    "nvidia/nemotron-3.5-lightning:free",
    "nvidia/nemotron-3-super-120b-a12b:free",
    "nvidia/nemotron-3-ultra-550b-a55b:free",
  ],
  COMPLEX_TEXT: [
    "nvidia/nemotron-3-super-120b-a12b:free",
    "nvidia/nemotron-3-ultra-550b-a55b:free",
    "nvidia/nemotron-3.5-lightning:free",
  ],
  VISION: [
    "google/gemma-4-31b-it:free",
    "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
    "google/gemma-4-26b-a4b-it:free",
  ],
};

/**
 * NVIDIA NIM (build.nvidia.com) hosted models. Free with an NVIDIA developer
 * key; no ":free" suffix, so the spending policy does not apply to them.
 */
export const NVIDIA_DEFAULT_MODELS: Record<AiProfile, string[]> = {
  FAST_TEXT: [
    "mistralai/mistral-small-3.1-24b-instruct-2503",
    "qwen/qwen3-next-80b-a3b-instruct",
    "nvidia/llama-3.3-nemotron-super-49b-v1.5",
  ],
  COMPLEX_TEXT: [
    "qwen/qwen3-next-80b-a3b-instruct",
    "nvidia/llama-3.3-nemotron-super-49b-v1.5",
    "mistralai/mistral-small-3.1-24b-instruct-2503",
  ],
  VISION: [
    "meta/llama-4-maverick-17b-128e-instruct",
    "nvidia/nemotron-nano-12b-v2-vl",
    "meta/llama-3.2-90b-vision-instruct",
  ],
};

export const DEFAULT_CONCURRENCY: Record<AiProfile, number> = {
  FAST_TEXT: 6,
  COMPLEX_TEXT: 3,
  VISION: 3,
};

export const DEFAULT_ATTEMPTS_PER_MODEL = 3;
export const MAX_MODELS_PER_TASK = 3;

/** Friendly names for the settings screen. Unknown IDs show as themselves. */
export const MODEL_LABELS: Record<string, string> = {
  "nvidia/nemotron-3.5-lightning:free": "Nemotron 3.5 Lightning",
  "nvidia/nemotron-3-super-120b-a12b:free": "Nemotron 3 Super",
  "nvidia/nemotron-3-ultra-550b-a55b:free": "Nemotron 3 Ultra",
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free": "Nemotron 3 Nano Omni",
  "google/gemma-4-31b-it:free": "Gemma 4 31B",
  "google/gemma-4-26b-a4b-it:free": "Gemma 4 26B A4B",
  "meta/llama-3.3-70b-instruct": "Llama 3.3 70B (NVIDIA)",
  "mistralai/mistral-small-3.1-24b-instruct-2503": "Mistral Small 3.1 (NVIDIA)",
  "qwen/qwen3-next-80b-a3b-instruct": "Qwen3 Next 80B (NVIDIA)",
  "nvidia/llama-3.3-nemotron-super-49b-v1.5": "Nemotron Super 49B (NVIDIA)",
  "meta/llama-4-maverick-17b-128e-instruct": "Llama 4 Maverick (NVIDIA)",
  "nvidia/nemotron-nano-12b-v2-vl": "Nemotron Nano 12B VL (NVIDIA)",
  "meta/llama-3.2-90b-vision-instruct": "Llama 3.2 90B Vision (NVIDIA)",
};

export function modelLabel(id: string): string {
  return MODEL_LABELS[id] ?? id;
}

const ENV_PREFIX: Record<AiProfile, string> = {
  FAST_TEXT: "FAST_MODEL_",
  COMPLEX_TEXT: "COMPLEX_MODEL_",
  VISION: "VISION_MODEL_",
};

/**
 * The default chain for a profile with any environment overrides applied:
 * BULK_AI_FAST_MODEL_1 … for OpenRouter, BULK_AI_NVIDIA_FAST_MODEL_1 … for NVIDIA.
 */
export function envModels(profile: AiProfile, vendor: AiVendor = "OPENROUTER"): string[] {
  const defaults = vendor === "NVIDIA" ? NVIDIA_DEFAULT_MODELS : DEFAULT_MODELS;
  const prefix = vendor === "NVIDIA" ? "BULK_AI_NVIDIA_" : "BULK_AI_";
  return defaults[profile].map(
    (fallback, i) => process.env[`${prefix}${ENV_PREFIX[profile]}${i + 1}`]?.trim() || fallback,
  );
}
