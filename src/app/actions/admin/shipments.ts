"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export type ContainerManifest = {
  id: string;
  code: string;
  carrier: string;
  origin: string;
  eta: string;
  stage: string;
  note: string;
  updatedAt: string;
};

const SHIPMENTS_KEY = "container_shipments";

const DEFAULT_CONTAINERS: ContainerManifest[] = [
  {
    id: "cont-milan-01",
    code: "CONT-IT-ACC-01",
    carrier: "MSC Mediterranean Sea Freight",
    origin: "Milan & Brianza Ateliers → Tema Port",
    eta: "2026-10-18",
    stage: "IN_PRODUCTION",
    note: "Frames kiln-dried and upholstery cutting underway at our Brianza workshop.",
    updatedAt: new Date().toISOString(),
  },
  {
    id: "cont-air-02",
    code: "AIR-IST-ACC-02",
    carrier: "Turkish Cargo Priority Air",
    origin: "Istanbul Bespoke Brass & Stone → Kotoka Int. Airport",
    eta: "2026-10-05",
    stage: "QUALITY_INSPECTION",
    note: "Final travertine honing and wooden crating inspection passed; booked on Friday flight.",
    updatedAt: new Date().toISOString(),
  },
];

export async function getContainerManifests(): Promise<ContainerManifest[]> {
  const row = await db.setting.findUnique({ where: { key: SHIPMENTS_KEY } });
  if (!row || !Array.isArray(row.value)) {
    return DEFAULT_CONTAINERS;
  }
  return row.value as unknown as ContainerManifest[];
}

export async function createContainerManifestAction(formData: FormData): Promise<void> {
  const staff = await requirePermission("orders:write");

  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const carrier = String(formData.get("carrier") ?? "").trim() || "Sea Freight Container";
  const origin = String(formData.get("origin") ?? "").trim() || "Partner Atelier → Tema Port";
  const eta = String(formData.get("eta") ?? "").trim() || "4–6 weeks";
  const stage = String(formData.get("stage") ?? "IN_PRODUCTION").trim();
  const note =
    String(formData.get("note") ?? "").trim() ||
    "Scheduled in consolidated LaLuxury container manifest.";

  if (!code) return;

  const existing = await getContainerManifests();
  const filtered = existing.filter((c) => c.code !== code);
  const next: ContainerManifest[] = [
    {
      id: `cont-${Date.now()}`,
      code,
      carrier,
      origin,
      eta,
      stage,
      note,
      updatedAt: new Date().toISOString(),
    },
    ...filtered,
  ];

  await db.setting.upsert({
    where: { key: SHIPMENTS_KEY },
    update: { value: next },
    create: { key: SHIPMENTS_KEY, value: next },
  });

  await logAudit({
    actorId: staff.id,
    action: "shipment.create_manifest",
    entity: "Setting",
    entityId: code,
    after: { code, carrier, origin, eta, stage },
  });

  revalidatePath("/admin/shipments");
}

export async function assignOrderToContainerAction(formData: FormData): Promise<void> {
  const staff = await requirePermission("orders:write");

  const orderId = String(formData.get("orderId") ?? "").trim();
  const containerCode = String(formData.get("containerCode") ?? "").trim().toUpperCase();

  if (!orderId || !containerCode) return;

  const manifests = await getContainerManifests();
  const manifest = manifests.find((m) => m.code === containerCode);

  await db.order.update({
    where: { id: orderId },
    data: {
      trackingNumber: containerCode,
      trackingCompany: manifest?.carrier ?? "LaLuxury Consolidated Freight",
      preorderStage: manifest?.stage ?? "IN_PRODUCTION",
      preorderNote: manifest
        ? `[${manifest.code} · ETA ${manifest.eta}] ${manifest.note}`
        : undefined,
      events: {
        create: {
          type: "shipment.assigned",
          message: `Assigned to Container / Airway Manifest ${containerCode}${manifest ? ` (${manifest.origin})` : ""}.`,
          actorId: staff.id,
        },
      },
    },
  });

  revalidatePath("/admin/shipments");
  revalidatePath("/admin/preorders");
  revalidatePath("/orders/track");
}

export async function cascadeContainerStageAction(formData: FormData): Promise<void> {
  const staff = await requirePermission("orders:write");

  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const stage = String(formData.get("stage") ?? "IN_TRANSIT").trim();
  const eta = String(formData.get("eta") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();

  if (!code) return;

  const manifests = await getContainerManifests();
  const updatedManifests = manifests.map((m) =>
    m.code === code
      ? {
          ...m,
          stage,
          eta: eta || m.eta,
          note: note || m.note,
          updatedAt: new Date().toISOString(),
        }
      : m,
  );

  await db.setting.upsert({
    where: { key: SHIPMENTS_KEY },
    update: { value: updatedManifests },
    create: { key: SHIPMENTS_KEY, value: updatedManifests },
  });

  const matchingOrders = await db.order.findMany({
    where: { trackingNumber: code },
    select: { id: true, orderNumber: true },
  });

  const formattedNote = `[${code}${eta ? ` · ETA ${eta}` : ""}] ${note}`;

  await db.$transaction(async (tx) => {
    for (const o of matchingOrders) {
      await tx.order.update({
        where: { id: o.id },
        data: {
          preorderStage: stage,
          preorderNote: formattedNote,
          status: stage === "READY_FOR_DELIVERY" ? "SHIPPED" : undefined,
          events: {
            create: {
              type: "preorder.container_cascade",
              message: `Container ${code} advanced to ${stage}: ${note}`,
              actorId: staff.id,
            },
          },
        },
      });
    }
  });

  await logAudit({
    actorId: staff.id,
    action: "shipment.cascade_stage",
    entity: "Order",
    entityId: code,
    after: { code, stage, cascadedOrderCount: matchingOrders.length },
  });

  revalidatePath("/admin/shipments");
  revalidatePath("/admin/preorders");
  revalidatePath("/orders/track");
}
