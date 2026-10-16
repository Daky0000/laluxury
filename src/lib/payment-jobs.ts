import { db } from "./db";
import { formatMoney } from "./money";
import { postAlert } from "./agent/slack";
import { reconcilePendingPayments } from "./checkout-payment";
import { expireStalePendingOrders } from "./orders";

/**
 * Payment housekeeping that must happen on time, not only when someone
 * happens to browse the shop: late MoMo approvals and missed webhooks are
 * settled, paid orders left half-done are finished, unpaid checkouts give
 * their stock back, and the team gets a daily list of money recorded by hand.
 *
 * Runs inside the web server every few minutes (see `src/instrumentation.ts`),
 * and from `POST /api/cron/expire-orders` for an external scheduler. Every step
 * is idempotent, so two servers, or the server and the cron, overlapping is
 * harmless.
 */
export async function runPaymentJobs(): Promise<{ reconciled: number; paid: number; expired: number }> {
  const { checked, paid } = await reconcilePendingPayments({ limit: 50 });
  const expired = await expireStalePendingOrders(100);
  await postManualSettlementReport().catch((error) => console.error("[payment-jobs] report", error));
  return { reconciled: checked, paid, expired };
}

const REPORT_KEY = "payments.manualReportAt";
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Once a day: every payment staff recorded by hand (cash, transfer, showroom
 * POS), so money that never passed through Paystack is seen by someone other
 * than the person who recorded it.
 */
export async function postManualSettlementReport(): Promise<void> {
  const row = await db.setting.findUnique({ where: { key: REPORT_KEY } });
  const last = typeof row?.value === "string" ? new Date(row.value) : null;
  const now = new Date();
  if (last && now.getTime() - last.getTime() < DAY_MS) return;

  const since = last ?? new Date(now.getTime() - DAY_MS);
  const payments = await db.payment.findMany({
    where: { provider: { in: ["manual", "pos"] }, status: "SUCCESS", paidAt: { gte: since, lt: now } },
    include: { order: { select: { orderNumber: true, currency: true } } },
    orderBy: { paidAt: "asc" },
    take: 100,
  });

  await db.setting.upsert({
    where: { key: REPORT_KEY },
    create: { key: REPORT_KEY, value: now.toISOString() },
    update: { value: now.toISOString() },
  });
  if (payments.length === 0) return;

  const recorders = new Map<string, string>();
  const ids = [
    ...new Set(
      payments
        .map((p) => (p.rawResponse as { recordedBy?: string } | null)?.recordedBy)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  for (const user of await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, email: true, phone: true } })) {
    recorders.set(user.id, user.email ?? user.phone ?? user.id);
  }

  const total = payments.reduce((sum, p) => sum + p.amount, 0);
  const lines = payments.map((p) => {
    const raw = p.rawResponse as { recordedBy?: string; note?: string | null } | null;
    const by = raw?.recordedBy ? (recorders.get(raw.recordedBy) ?? "staff") : "staff";
    return `- ${p.order.orderNumber}: ${formatMoney(p.amount, p.order.currency)} (${p.provider}, ${p.channel ?? "?"}) by ${by}${raw?.note ? ` — ${raw.note}` : ""}`;
  });
  await postAlert(
    `:ledger: Money recorded by hand in the last day: ${payments.length} payment${payments.length === 1 ? "" : "s"}, ${formatMoney(total)}. Check it reached the bank or till.\n${lines.join("\n")}`,
  );
}

let started = false;

/** Starts the in-server schedule, once per process. */
export function startPaymentJobs(everyMs = 5 * 60 * 1000): void {
  if (started) return;
  started = true;
  const tick = () => {
    runPaymentJobs().catch((error) => console.error("[payment-jobs]", error));
  };
  // A minute after boot, then on the interval; neither keeps the process alive.
  setTimeout(tick, 60 * 1000).unref?.();
  setInterval(tick, everyMs).unref?.();
}
