import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { SectionHeading } from "@/components/ui";
import { BulkAddNav, DesktopOnly } from "@/components/admin/bulk-add/desktop-only";
import { LibraryManager } from "@/components/admin/bulk-add/library-manager";

export const metadata: Metadata = { title: "Option Library" };
export const dynamic = "force-dynamic";

export default async function OptionLibraryPage() {
  await requirePermission("products:write");
  const [options, rules] = await Promise.all([
    db.catalogOptionDefinition.findMany({
      orderBy: [{ position: "asc" }, { name: "asc" }],
      include: { values: { orderBy: { position: "asc" }, select: { id: true, value: true } } },
    }),
    db.catalogNormalizationRule.findMany({ orderBy: [{ field: "asc" }, { fromValue: "asc" }] }),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <SectionHeading
        title="Option Library"
        description="Reusable options and values. A saved value is available to every product — it is never forced onto one."
      />
      <BulkAddNav active="options" />
      <DesktopOnly>
        <LibraryManager
          options={options.map((o) => ({ id: o.id, name: o.name, values: o.values }))}
          rules={rules.map((r) => ({ id: r.id, field: r.field, fromValue: r.fromValue, toValue: r.toValue }))}
        />
      </DesktopOnly>
    </div>
  );
}
