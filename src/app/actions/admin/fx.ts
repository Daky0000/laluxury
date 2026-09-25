"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export type FxConfig = {
  ghsPerUsd: number; // e.g. 15.4
  ghsPerGbp: number; // e.g. 19.6
  ghsPerEur: number; // e.g. 16.7
  updatedAt: string;
};

const FX_KEY = "currency_rates";

const DEFAULT_FX: FxConfig = {
  ghsPerUsd: 15.4,
  ghsPerGbp: 19.6,
  ghsPerEur: 16.7,
  updatedAt: new Date().toISOString(),
};

let cachedFx: { data: FxConfig; expiresAt: number } | null = null;
const FX_CACHE_TTL_MS = 5 * 60 * 1000;

export async function getFxRates(): Promise<FxConfig> {
  const now = Date.now();
  if (cachedFx && cachedFx.expiresAt > now) {
    return cachedFx.data;
  }

  const row = await db.setting.findUnique({ where: { key: FX_KEY } });
  if (!row || typeof row.value !== "object" || row.value === null) {
    cachedFx = { data: DEFAULT_FX, expiresAt: now + FX_CACHE_TTL_MS };
    return DEFAULT_FX;
  }
  const stored = row.value as Partial<FxConfig>;
  const result: FxConfig = {
    ghsPerUsd: Number(stored.ghsPerUsd) > 0 ? Number(stored.ghsPerUsd) : DEFAULT_FX.ghsPerUsd,
    ghsPerGbp: Number(stored.ghsPerGbp) > 0 ? Number(stored.ghsPerGbp) : DEFAULT_FX.ghsPerGbp,
    ghsPerEur: Number(stored.ghsPerEur) > 0 ? Number(stored.ghsPerEur) : DEFAULT_FX.ghsPerEur,
    updatedAt: stored.updatedAt ?? DEFAULT_FX.updatedAt,
  };
  cachedFx = { data: result, expiresAt: now + FX_CACHE_TTL_MS };
  return result;
}

export async function updateFxRatesAction(formData: FormData): Promise<void> {
  const staff = await requirePermission("settings:manage");

  const ghsPerUsd = Math.max(0.5, Number(formData.get("ghsPerUsd") ?? DEFAULT_FX.ghsPerUsd));
  const ghsPerGbp = Math.max(0.5, Number(formData.get("ghsPerGbp") ?? DEFAULT_FX.ghsPerGbp));
  const ghsPerEur = Math.max(0.5, Number(formData.get("ghsPerEur") ?? DEFAULT_FX.ghsPerEur));

  const next: FxConfig = {
    ghsPerUsd,
    ghsPerGbp,
    ghsPerEur,
    updatedAt: new Date().toISOString(),
  };

  await db.setting.upsert({
    where: { key: FX_KEY },
    update: { value: next },
    create: { key: FX_KEY, value: next },
  });

  cachedFx = null;

  await logAudit({
    actorId: staff.id,
    action: "settings.update_fx_rates",
    entity: "Setting",
    entityId: FX_KEY,
    after: next,
  });

  revalidatePath("/admin/settings");
  revalidatePath("/lookbook");
  revalidatePath("/shop");
}
