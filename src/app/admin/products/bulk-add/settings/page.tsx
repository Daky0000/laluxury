import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth";
import { SectionHeading } from "@/components/ui";
import { BulkAddNav } from "@/components/admin/bulk-add/desktop-only";
import { AiSettingsForm } from "@/components/admin/bulk-add/ai-settings-form";
import { getBulkAiConfig, invalidateBulkAiConfig, openRouterKey } from "@/lib/bulk-ai/model-registry";
import { MODEL_LABELS } from "@/lib/bulk-ai/default-models";

export const metadata: Metadata = { title: "Bulk Product AI" };
export const dynamic = "force-dynamic";

export default async function BulkAiSettingsPage() {
  await requirePermission("settings:manage");
  invalidateBulkAiConfig();
  const [config, key] = await Promise.all([getBulkAiConfig(), openRouterKey()]);
  return (
    <div className="flex flex-col gap-6">
      <SectionHeading
        title="Bulk Product AI"
        description="Which OpenRouter models help with imports. Each model gets a few attempts before the next one is tried."
      />
      <BulkAddNav active="settings" />
      <AiSettingsForm config={config} labels={MODEL_LABELS} hasKey={Boolean(key)} />
    </div>
  );
}
