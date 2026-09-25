import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { SectionHeading } from "@/components/ui";
import { PosOrderBuilder, type PosCatalogVariant } from "@/components/admin/pos-order-builder";

export const metadata: Metadata = { title: "Create Showroom / POS Order" };
export const dynamic = "force-dynamic";

export default async function NewShowroomPosOrderPage() {
  await requirePermission("orders:write");

  const rawVariants = await db.variant.findMany({
    where: {
      isActive: true,
      product: { status: "ACTIVE" },
    },
    include: {
      product: { select: { title: true, isPreorder: true } },
      inventory: { select: { onHand: true, reserved: true } },
    },
    orderBy: [{ product: { title: "asc" } }, { position: "asc" }],
  });

  const variants: PosCatalogVariant[] = rawVariants.map((v) => ({
    id: v.id,
    sku: v.sku,
    title: v.title,
    price: v.price,
    productTitle: v.product.title,
    isPreorder: v.product.isPreorder,
    available: Math.max(0, (v.inventory?.onHand ?? 0) - (v.inventory?.reserved ?? 0)),
  }));

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/admin/orders"
        className="flex w-fit items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to Orders
      </Link>

      <SectionHeading
        title="Showroom POS & Concierge Order Creator"
        description="Create an instant in-person showroom order, phone/WhatsApp commission, or 50% Deposit Pre-Order with immediate Tax Invoice & White-Glove Delivery Waybill generation."
      />

      <PosOrderBuilder variants={variants} />
    </div>
  );
}
