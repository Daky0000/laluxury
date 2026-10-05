/**
 * Every model ID Bulk Product Add uses by default, in one place.
 *
 * Free OpenRouter endpoints come and go, so nothing else in the codebase names
 * a model. The environment can replace any slot (BULK_AI_FAST_MODEL_1 …), and
 * the advanced admin settings can replace the environment.
 */

export type AiProfile = "FAST_TEXT" | "COMPLEX_TEXT" | "VISION";
export type AiPolicy = "FREE_ONLY" | "FREE_THEN_PAID" | "PAID_ONLY";

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
    "inclusionai/ling-3.0-flash-vl:free",
    "thinkingmachines/inkling:free",
    "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
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
  "inclusionai/ling-3.0-flash-vl:free": "Ling 3.0 Flash VL",
  "thinkingmachines/inkling:free": "Inkling",
};

export function modelLabel(id: string): string {
  return MODEL_LABELS[id] ?? id;
}

const ENV_PREFIX: Record<AiProfile, string> = {
  FAST_TEXT: "BULK_AI_FAST_MODEL_",
  COMPLEX_TEXT: "BULK_AI_COMPLEX_MODEL_",
  VISION: "BULK_AI_VISION_MODEL_",
};

/** The default chain for a profile with any environment overrides applied. */
export function envModels(profile: AiProfile): string[] {
  return DEFAULT_MODELS[profile].map(
    (fallback, i) => process.env[`${ENV_PREFIX[profile]}${i + 1}`]?.trim() || fallback,
  );
}
