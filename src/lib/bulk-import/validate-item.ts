import type { ProductImportItemStatus } from "@/generated/prisma";
import { ISSUE_CODES, type Issue, type IssueCode, type ItemDraft, type ItemOverrides } from "./schema";
import type { AiResult } from "./merge-data";
import type { MatchResult } from "./match-existing";

/**
 * Decides whether an inbox item can be imported as it stands.
 *
 *   BLOCK  — cannot be imported until fixed (no title, no price …)
 *   REVIEW — importable once the owner has looked (possible duplicate …)
 *   INFO   — shown, never stops anything
 */
export function validateItem(args: {
  draft: ItemDraft;
  match: MatchResult;
  ai: AiResult | null;
  aiStatus: string | null;
  overrides: ItemOverrides | null;
  requireImage: boolean;
  takenSkus: Set<string>;
  duplicateMedia: number;
}): { issues: Issue[]; status: ProductImportItemStatus } {
  const { draft, match } = args;
  const reviewed = Boolean(args.overrides?.acceptDuplicate || args.overrides?.reviewed);
  const issues: Issue[] = [];
  const add = (code: IssueCode, severity: Issue["severity"], message?: string) =>
    issues.push({ code, severity: severity === "REVIEW" && reviewed ? "INFO" : severity, message: message ?? ISSUE_CODES[code] });

  const isUpdate = match.confident && !args.overrides?.forceCreate;

  if (!draft.title?.value?.trim()) {
    add("MISSING_TITLE", "BLOCK", args.aiStatus === "PENDING" ? "Title will come from AI" : "Missing title");
  }

  const active = draft.variants.filter((v) => v.enabled);
  if (!active.length) add("NO_ACTIVE_VARIANTS", "BLOCK");
  const unpriced = active.filter((v) => v.price == null);
  if (unpriced.length && !isUpdate) {
    add("MISSING_PRICE", "BLOCK", `Missing price for ${unpriced.length === active.length ? "all versions" : unpriced.map((v) => v.key).slice(0, 5).join(", ")}`);
  }
  for (const v of active) {
    if (v.price != null && v.compareAtPrice != null && v.compareAtPrice <= v.price) {
      add("INVALID_VALUE", "REVIEW", `Was-price for ${v.key} is not above the price`);
      break;
    }
  }

  if (args.requireImage && !draft.images.length && !isUpdate) add("MISSING_IMAGE", "REVIEW");

  if (!isUpdate) {
    const seen = new Set<string>();
    for (const v of active) {
      if (!v.sku) continue;
      if (seen.has(v.sku) || args.takenSkus.has(v.sku)) {
        add("SKU_CONFLICT", "BLOCK", `SKU ${v.sku} is already used`);
        break;
      }
      seen.add(v.sku);
    }
  }

  if (match.productId && !match.confident && !args.overrides?.forceCreate) {
    add("POSSIBLE_DUPLICATE", "REVIEW", "A product with the same title already exists");
  }
  if (args.duplicateMedia > 0) {
    add("POSSIBLE_DUPLICATE", "REVIEW", `${args.duplicateMedia} photo(s) look like duplicates`);
  }
  if (isUpdate) add("UPDATE_MATCH", "INFO", `Will update an existing product (matched by ${match.method?.toLowerCase().replace("_", " ")})`);

  if (args.aiStatus === "FAILED") add("AI_FAILED", draft.title ? "INFO" : "REVIEW");
  if (args.ai?.visibleLogo) add("VISIBLE_LOGO", "REVIEW", "A brand logo or watermark is visible in a photo");
  if (args.ai && args.ai.confidence < 0.5) add("LOW_AI_CONFIDENCE", "REVIEW");

  const status: ProductImportItemStatus = issues.some((i) => i.severity === "BLOCK")
    ? "BLOCKED"
    : issues.some((i) => i.severity === "REVIEW")
      ? "NEEDS_REVIEW"
      : "READY";
  return { issues: dedupeIssues(issues), status };
}

function dedupeIssues(issues: Issue[]): Issue[] {
  const seen = new Set<string>();
  return issues.filter((i) => {
    const k = `${i.code}|${i.message}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
