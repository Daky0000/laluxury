"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import type { Prisma } from "@/generated/prisma";
import { recipeConfigSchema } from "@/lib/bulk-import/schema";
import { DEFAULT_RECIPES } from "@/lib/bulk-import/default-recipes";
import {
  BULK_AI_SETTING_KEY,
  envBulkAiConfig,
  getBulkAiConfig,
  invalidateBulkAiConfig,
  type BulkAiConfig,
} from "@/lib/bulk-ai/model-registry";
import { runBulkAiTask } from "@/lib/bulk-ai/router";
import { errorMessage } from "@/lib/bulk-ai/retry";

type Result<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; message: string };
const fail = (message: string): { ok: false; message: string } => ({ ok: false, message });

// --- Product Recipes ----------------------------------------------------------

const recipeInput = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "Give the recipe a name.").max(80),
  description: z.string().max(300).optional().nullable(),
  config: recipeConfigSchema,
});

export async function saveRecipeAction(input: unknown): Promise<Result<{ id: string }>> {
  const user = await requirePermission("products:write");
  const parsed = recipeInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the recipe.");
  const { id, name, description, config } = parsed.data;
  const clash = await db.productRecipe.findFirst({ where: { name, ...(id ? { NOT: { id } } : {}) }, select: { id: true } });
  if (clash) return fail("A recipe with that name already exists.");

  const recipe = id
    ? await db.productRecipe.update({
        where: { id },
        data: { name, description: description ?? null, config: config as Prisma.InputJsonValue, version: { increment: 1 } },
      })
    : await db.productRecipe.create({ data: { name, description: description ?? null, config: config as Prisma.InputJsonValue } });
  await recordAudit({ actorId: user.id, action: id ? "recipe.update" : "recipe.create", entity: "ProductRecipe", entityId: recipe.id });
  revalidatePath("/admin/products/recipes");
  return { ok: true, data: { id: recipe.id } };
}

export async function deleteRecipeAction(id: string): Promise<Result> {
  const user = await requirePermission("products:write");
  await db.productRecipe.update({ where: { id }, data: { isActive: false, name: `${id}-archived` } }).catch(() => null);
  await recordAudit({ actorId: user.id, action: "recipe.archive", entity: "ProductRecipe", entityId: id });
  revalidatePath("/admin/products/recipes");
  return { ok: true };
}

/** Adds the starter recipes (Bedsheet, Curtain Blind …) that are not there yet. */
export async function seedRecipesAction(): Promise<Result<{ added: number }>> {
  await requirePermission("products:write");
  let added = 0;
  for (const r of DEFAULT_RECIPES) {
    const exists = await db.productRecipe.findUnique({ where: { name: r.name }, select: { id: true } });
    if (exists) continue;
    await db.productRecipe.create({
      data: { name: r.name, description: r.description, config: recipeConfigSchema.parse(r.config) as Prisma.InputJsonValue },
    });
    added++;
  }
  for (const r of DEFAULT_RECIPES) for (const o of r.config.options ?? []) await saveOptionValues(o.name, o.values);
  revalidatePath("/admin/products/recipes");
  revalidatePath("/admin/products/options");
  return { ok: true, data: { added } };
}

// --- Option Library -------------------------------------------------------------

async function saveOptionValues(name: string, values: string[]) {
  const option = await db.catalogOptionDefinition.upsert({
    where: { name },
    create: { name },
    update: {},
    select: { id: true, values: { select: { value: true } } },
  });
  const have = new Set(option.values.map((v) => v.value.toLowerCase()));
  let position = option.values.length;
  for (const value of values.map((v) => v.trim()).filter(Boolean)) {
    if (have.has(value.toLowerCase())) continue;
    have.add(value.toLowerCase());
    await db.catalogOptionValueDefinition.create({ data: { optionId: option.id, value, position: position++ } });
  }
  return option.id;
}

const optionInput = z.object({
  name: z.string().trim().min(1, "Name the option.").max(60),
  values: z.array(z.string().trim().max(80)).max(300),
});

/** Saves an option (or new values on an existing one) for future products. */
export async function saveLibraryOptionAction(input: unknown): Promise<Result> {
  await requirePermission("products:write");
  const parsed = optionInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the option.");
  await saveOptionValues(parsed.data.name, parsed.data.values);
  revalidatePath("/admin/products/options");
  return { ok: true };
}

export async function deleteLibraryValueAction(valueId: string): Promise<Result> {
  await requirePermission("products:write");
  await db.catalogOptionValueDefinition.delete({ where: { id: valueId } }).catch(() => null);
  revalidatePath("/admin/products/options");
  return { ok: true };
}

export async function deleteLibraryOptionAction(optionId: string): Promise<Result> {
  await requirePermission("products:write");
  await db.catalogOptionDefinition.delete({ where: { id: optionId } }).catch(() => null);
  revalidatePath("/admin/products/options");
  return { ok: true };
}

// --- Normalisation rules ------------------------------------------------------------

const ruleInput = z.object({
  field: z.string().trim().min(1).max(60),
  fromValue: z.string().trim().min(1).max(120),
  toValue: z.string().trim().min(1).max(120),
});

export async function saveRuleAction(input: unknown): Promise<Result> {
  await requirePermission("products:write");
  const parsed = ruleInput.safeParse(input);
  if (!parsed.success) return fail("Fill in the option, the supplier spelling and the catalog value.");
  const { field, fromValue, toValue } = parsed.data;
  await db.catalogNormalizationRule.upsert({
    where: { field_fromValue_sourceKey: { field, fromValue, sourceKey: "" } },
    create: { field, fromValue, toValue },
    update: { toValue },
  });
  revalidatePath("/admin/products/options");
  return { ok: true };
}

export async function deleteRuleAction(id: string): Promise<Result> {
  await requirePermission("products:write");
  await db.catalogNormalizationRule.delete({ where: { id } }).catch(() => null);
  revalidatePath("/admin/products/options");
  return { ok: true };
}

// --- Bulk Product AI settings (advanced) ----------------------------------------------

const modelList = z.array(z.string().trim().max(120)).max(3);
const aiSettingsInput = z.object({
  bulkAiEnabled: z.boolean(),
  bulkAiPolicy: z.enum(["FREE_ONLY", "FREE_THEN_PAID", "PAID_ONLY"]),
  bulkAiFastModels: modelList,
  bulkAiComplexModels: modelList,
  bulkAiVisionModels: modelList,
  bulkAiAttemptsPerModel: z.number().int().min(1).max(5),
  bulkAiFastConcurrency: z.number().int().min(1).max(20),
  bulkAiComplexConcurrency: z.number().int().min(1).max(20),
  bulkAiVisionConcurrency: z.number().int().min(1).max(20),
});

export async function saveBulkAiSettingsAction(input: unknown): Promise<Result> {
  const user = await requirePermission("settings:manage");
  const parsed = aiSettingsInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the settings.");
  const value = {
    ...parsed.data,
    bulkAiFastModels: parsed.data.bulkAiFastModels.filter(Boolean),
    bulkAiComplexModels: parsed.data.bulkAiComplexModels.filter(Boolean),
    bulkAiVisionModels: parsed.data.bulkAiVisionModels.filter(Boolean),
  } satisfies BulkAiConfig;
  await db.setting.upsert({
    where: { key: BULK_AI_SETTING_KEY },
    create: { key: BULK_AI_SETTING_KEY, value },
    update: { value },
  });
  invalidateBulkAiConfig();
  await recordAudit({ actorId: user.id, action: "settings.bulk_ai", entity: "Setting", entityId: BULK_AI_SETTING_KEY, after: value });
  revalidatePath("/admin/products/bulk-add/settings");
  return { ok: true };
}

export async function resetBulkAiSettingsAction(): Promise<Result> {
  const user = await requirePermission("settings:manage");
  await db.setting.deleteMany({ where: { key: BULK_AI_SETTING_KEY } });
  invalidateBulkAiConfig();
  await recordAudit({ actorId: user.id, action: "settings.bulk_ai_reset", entity: "Setting", entityId: BULK_AI_SETTING_KEY, after: envBulkAiConfig() });
  revalidatePath("/admin/products/bulk-add/settings");
  return { ok: true };
}

/** Quick round-trip through the FAST_TEXT chain. */
export async function testBulkAiAction(): Promise<Result<{ model: string; ms: number }>> {
  await requirePermission("settings:manage");
  const config = await getBulkAiConfig();
  if (!config.bulkAiEnabled) return fail("AI assistance is switched off.");
  const started = Date.now();
  try {
    const { value, model } = await runBulkAiTask({
      task: "NORMALIZE_VALUE",
      schema: z.object({ suggestions: z.array(z.object({ field: z.string(), from: z.string(), to: z.string(), confidence: z.number() })) }),
      system: "Map supplier spellings to canonical values. Reply with JSON only.",
      user: 'Option: Size. Canonical values: ["Superking","King","Double"]. Supplier values: ["S-KING"].',
    });
    return { ok: true, data: { model, ms: Date.now() - started }, message: `Got ${value.suggestions.length} suggestion(s).` };
  } catch (error) {
    return fail(errorMessage(error));
  }
}
