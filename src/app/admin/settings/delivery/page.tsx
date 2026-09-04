import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { SectionHeading } from "@/components/ui";
import { DeliveryManager } from "@/components/admin/delivery-manager";

export const metadata: Metadata = { title: "Delivery" };

export default async function AdminDeliveryPage() {
  await requirePermission("settings:manage");

  const zones = await db.shippingZone.findMany({
    include: { rates: { orderBy: [{ position: "asc" }, { price: "asc" }] } },
    orderBy: { createdAt: "asc" },
  });

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
        title="Delivery"
        description="Zones group the regions that cost the same to reach. The rates inside a zone are what a shopper chooses between at checkout."
      />

      <DeliveryManager
        zones={zones.map((zone) => ({
          id: zone.id,
          name: zone.name,
          regions: zone.regions,
          isActive: zone.isActive,
          rates: zone.rates.map((rate) => ({
            id: rate.id,
            name: rate.name,
            price: rate.price,
            freeAboveSubtotal: rate.freeAboveSubtotal,
            estimatedDaysMin: rate.estimatedDaysMin,
            estimatedDaysMax: rate.estimatedDaysMax,
            isActive: rate.isActive,
            position: rate.position,
          })),
        }))}
      />
    </div>
  );
}
