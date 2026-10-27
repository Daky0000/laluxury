import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { getSettings } from "@/lib/settings";
import { sendSms } from "@/lib/sms";
import { normalisePhone } from "@/lib/phone";
import { recordAudit } from "@/lib/audit";

export type NewProductsSmsResult = {
  ok: boolean;
  message: string;
  sentCount: number;
  failedCount: number;
  recipientCount: number;
  newProductCount: number;
  previewMessage?: string;
};

export type Recipient = {
  phone: string;
  name?: string;
};

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Finds products or varieties added approximately 3 days ago
 * (within the 3 to 7 days active "New" window).
 */
export async function getEligibleNewProducts() {
  const now = Date.now();
  const threeDaysAgo = new Date(now - THREE_DAYS_MS);
  const sevenDaysAgo = new Date(now - SEVEN_DAYS_MS);

  // Products created or having variants created between 3 and 7 days ago
  const products = await db.product.findMany({
    where: {
      status: "ACTIVE",
      OR: [
        {
          createdAt: {
            gte: sevenDaysAgo,
            lte: threeDaysAgo,
          },
        },
        {
          variants: {
            some: {
              isActive: true,
              createdAt: {
                gte: sevenDaysAgo,
                lte: threeDaysAgo,
              },
            },
          },
        },
      ],
    },
    select: {
      id: true,
      title: true,
      slug: true,
      createdAt: true,
      variants: {
        where: { isActive: true },
        select: { id: true, createdAt: true },
      },
    },
  });

  return products;
}

/**
 * Gathers all buyers (customers with orders) and registered users who have
 * supplied contact details (phone number), deduplicated canonically.
 */
export async function getNewProductsSmsRecipients(): Promise<Recipient[]> {
  const [users, orders] = await Promise.all([
    db.user.findMany({
      where: {
        phone: { not: null },
        isActive: true,
      },
      select: {
        phone: true,
        firstName: true,
        acceptsMarketing: true,
      },
    }),
    db.order.findMany({
      select: {
        phone: true,
        shippingAddress: {
          select: {
            firstName: true,
            phone: true,
          },
        },
      },
      take: 2000,
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const map = new Map<string, string | undefined>();

  // 1. Registered users
  for (const u of users) {
    if (!u.phone) continue;
    const clean = normalisePhone(u.phone);
    if (clean && !map.has(clean)) {
      map.set(clean, u.firstName?.trim() || undefined);
    }
  }

  // 2. Order buyers (who have made purchases with their contact details)
  for (const o of orders) {
    const rawPhone = o.shippingAddress?.phone || o.phone;
    if (!rawPhone) continue;
    const clean = normalisePhone(rawPhone);
    if (clean && !map.has(clean)) {
      const name = o.shippingAddress?.firstName?.trim() || undefined;
      map.set(clean, name);
    }
  }

  return Array.from(map.entries()).map(([phone, name]) => ({
    phone,
    name,
  }));
}

/**
 * Dispatches the simple stock notification SMS linking to the /new page.
 */
export async function sendNewProductsSmsNotification(options?: {
  force?: boolean;
  dryRun?: boolean;
  actorId?: string;
}): Promise<NewProductsSmsResult> {
  const settings = await getSettings();
  const eligibleProducts = await getEligibleNewProducts();

  if (eligibleProducts.length === 0 && !options?.force) {
    return {
      ok: true,
      message: "No products added ~3 days ago requiring notification at this time.",
      sentCount: 0,
      failedCount: 0,
      recipientCount: 0,
      newProductCount: 0,
    };
  }

  // Check if a campaign was already dispatched recently to prevent spamming
  if (!options?.force) {
    const lastCampaign = await db.auditLog.findFirst({
      where: { action: "NEW_PRODUCTS_SMS_CAMPAIGN" },
      orderBy: { createdAt: "desc" },
    });

    if (lastCampaign) {
      const timeSinceLast = Date.now() - new Date(lastCampaign.createdAt).getTime();
      // Enforce at least 48 hours between automated campaigns
      if (timeSinceLast < 48 * 60 * 60 * 1000) {
        return {
          ok: true,
          message: "SMS notification for new products was already dispatched recently.",
          sentCount: 0,
          failedCount: 0,
          recipientCount: 0,
          newProductCount: eligibleProducts.length,
        };
      }
    }
  }

  const recipients = await getNewProductsSmsRecipients();
  const siteUrl = env.siteUrl().replace(/\/$/, "");
  const newProductsUrl = `${siteUrl}/new`;

  const sampleMessage = `New products are in stock at ${settings.storeName}! Check them out: ${newProductsUrl}`;

  if (options?.dryRun) {
    return {
      ok: true,
      message: `Dry run complete. Found ${recipients.length} recipients for ${eligibleProducts.length} new pieces.`,
      sentCount: 0,
      failedCount: 0,
      recipientCount: recipients.length,
      newProductCount: eligibleProducts.length,
      previewMessage: sampleMessage,
    };
  }

  let sentCount = 0;
  let failedCount = 0;

  for (const recipient of recipients) {
    const message = recipient.name
      ? `Hello ${recipient.name}, new products are in stock at ${settings.storeName}! Check them out: ${newProductsUrl}`
      : `New products are in stock at ${settings.storeName}! Check them out: ${newProductsUrl}`;

    try {
      const res = await sendSms(recipient.phone, message);
      if (res.ok) {
        sentCount++;
      } else {
        failedCount++;
      }
    } catch {
      failedCount++;
    }
  }

  await recordAudit({
    actorId: options?.actorId ?? null,
    action: "NEW_PRODUCTS_SMS_CAMPAIGN",
    entity: "ProductCatalog",
    entityId: "new-products",
    after: {
      sentCount,
      failedCount,
      totalRecipients: recipients.length,
      newProductCount: eligibleProducts.length,
      link: newProductsUrl,
    },
  }).catch(() => null);

  return {
    ok: true,
    message: `Dispatched new products SMS alert to ${sentCount} recipients (${failedCount} failed).`,
    sentCount,
    failedCount,
    recipientCount: recipients.length,
    newProductCount: eligibleProducts.length,
    previewMessage: sampleMessage,
  };
}
