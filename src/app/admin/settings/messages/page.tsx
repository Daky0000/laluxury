import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { getMessageTemplates } from "@/lib/message-templates";
import { SectionHeading } from "@/components/ui";
import { MessageTemplatesEditor } from "@/components/admin/message-templates-editor";
import { CustomNotificationPanel } from "@/components/admin/custom-notification-panel";

export const metadata: Metadata = { title: "SMS & Email Notifications" };

export default async function AdminMessagesSettingsPage() {
  await requirePermission("settings:manage");

  const [templates, settings] = await Promise.all([
    getMessageTemplates(),
    getSettings(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/admin/settings"
        className="inline-flex w-fit items-center gap-1.5 text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
        Settings
      </Link>

      <SectionHeading
        title="SMS &amp; Email Notifications"
        description="Draft, customize, and configure automated SMS and transactional emails for orders, payments, receipts, abandoned carts, and direct messages."
      />

      <CustomNotificationPanel storeName={settings.storeName} />

      <MessageTemplatesEditor
        initialTemplates={templates}
        storeName={settings.storeName}
      />
    </div>
  );
}
