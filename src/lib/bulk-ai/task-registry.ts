import type { AiProfile } from "./default-models";

/**
 * Every AI task Bulk Product Add runs, and the model profile that suits it.
 * Bump a task's promptVersion whenever its prompt changes, so cached results
 * from the old prompt are not reused.
 */
export const AI_TASKS = {
  PARSE_BATCH_INSTRUCTION: { profile: "FAST_TEXT", promptVersion: 1, vision: false },
  MAP_SPREADSHEET_COLUMNS: { profile: "FAST_TEXT", promptVersion: 1, vision: false },
  NORMALIZE_VALUE: { profile: "FAST_TEXT", promptVersion: 1, vision: false },
  GENERATE_PRODUCT_COPY: { profile: "FAST_TEXT", promptVersion: 1, vision: false },
  SUGGEST_PRODUCT_RECIPE: { profile: "COMPLEX_TEXT", promptVersion: 1, vision: false },
  RESOLVE_COMPLEX_SOURCE_GROUPING: { profile: "COMPLEX_TEXT", promptVersion: 1, vision: false },
  ANALYZE_PRODUCT_IMAGE: { profile: "VISION", promptVersion: 1, vision: true },
  MATCH_IMAGE_TO_OPTION: { profile: "VISION", promptVersion: 1, vision: true },
  SUGGEST_IMAGE_GROUPING: { profile: "VISION", promptVersion: 1, vision: true },
} as const satisfies Record<string, { profile: AiProfile; promptVersion: number; vision: boolean }>;

export type AiTask = keyof typeof AI_TASKS;

export function resolveTaskProfile(task: AiTask): AiProfile {
  return AI_TASKS[task].profile;
}
