import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { getCommerceSettings } from "@/lib/settings";
import { SectionHeading } from "@/components/ui";
import { DeliveryFeeForm } from "@/components/admin/delivery-fee-form";

export const metadata: Metadata = { title: "Delivery" };
export const dynamic = "force-dynamic";

export default async function AdminDeliveryPage() {
  await requirePermission("settings:manage");

  const settings = await getCommerceSettings();

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
        description="One delivery fee for every order and every region. Shoppers see it at checkout on the website and in the app."
      />

      <DeliveryFeeForm
        deliveryFee={settings.deliveryFee}
        freeShippingThreshold={settings.freeShippingThreshold}
      />
    </div>
  );
}
