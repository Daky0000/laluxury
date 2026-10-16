# Payment System Audit (2026-10-16)

Scope: every path that takes, records, verifies, refunds or reports money, on the web storefront, the mobile API (`/api/app/*`), the admin console and the background jobs. That covers the Paystack client, the webhook, checkout (hosted page and Direct Debit), MoMo push/OTP/resend, deposits and balances, manual/POS/console/quote orders, refunds, cancellation and expiry, the stock movements tied to payment, discounts, the key and mode settings, and revenue reporting.

Method: a static read of the source at `9e6b5aa`. No live Paystack, SMS or email calls were made. No database was touched. No tests were run: `node_modules` is not installed in this container, and this change is documentation only. Every finding cites the file and line it comes from. The fix order is at the end.

Severity:
- **P0**: money is lost, taken twice or given away, or goods leave without payment. Fix before taking more orders.
- **P1**: stock or financial records go wrong, or a customer is misled about money.
- **P2**: security or abuse exposure.
- **P3**: reporting, configuration and housekeeping.

---

## Do now: the short list

1. **Record and alert on second payments** (P0-1). A double-approved MoMo prompt today takes the money twice, and nobody is told.
2. **Stop recording refunds that Paystack refused** (P0-2), and move refunds onto a ledger with its own permission.
3. **Parse refund and dispute webhooks** (P0-3).
4. **Refuse test-mode transactions on live orders** (P0-4).
5. **Lock "mark paid", POS and manual-paid orders behind a manager permission, and always write a Payment row** (P0-5).
6. **Make cancellation atomic against payment** (P0-6), and require a refund decision when a paid order is cancelled (P0-7).
7. **Fix the stock paths for staff orders, and the double restock** (P1-1, P1-2).
8. **Put mobile checkout on the shared order service** (P1-5). This also closes the free-delivery keyword exploit and the account pre-hijack.
9. **Rate-limit checkout and prompts, fix the IP source, and require the order token on the payment endpoints** (P2-1 to P2-3).
10. **Schedule the reconcile/expiry cron, and rebuild the revenue report on the payment ledger** (P3).

---

## P0: money lost, taken twice or given away

### P0-1. A second successful payment on the same order is silently dropped
**Evidence:** `src/lib/orders.ts:380-388`, `src/lib/checkout-payment.ts:129-136`, `src/lib/momo-push.ts:150-151`, `src/app/(checkout)/checkout/confirm/page.tsx:427`, `src/lib/orders.ts:382-385`, `src/lib/orders.ts:632-664`

**What goes wrong:**
- The confirmation page offers "Send the prompt again" while the first prompt is still live (`pay_offline` or `pending`). It is only hidden while a code is needed.
- `resendDirectDebitPrompt` marks the first payment row `FAILED` and fires a second charge. The checkout's own help text sends payers to `*170# → My Approvals`, where both requests can be waiting, so the payer can approve both.
- When the second success arrives, by webhook or by sweep, `markOrderPaid` sees `order.paymentStatus === "SUCCESS"` and returns `alreadyPaid`. The second payment row is never set to `SUCCESS`, nothing is logged, and nobody is alerted.
- The late-payment sweep only re-checks `FAILED` rows on orders that are *not* paid, so it never catches the second payment either.
- The customer is debited twice. The order shows one payment, and there is no trail to refund from.

**Deposit orders:** any second success is booked as the *balance* (`settleOrderBalance`), whatever its amount. The code never checks that it matches the outstanding balance.

**Fix:**
- In `markOrderPaid`, when the order is already settled and a *different* reference succeeds, upsert that payment as `SUCCESS`. Then log `payment.duplicate`, `postAlert` with a refund call-to-action, and show it on the admin order page. Optionally, auto-refund it.
- Store the payment's purpose (`FULL | DEPOSIT | BALANCE`) on `Payment` when it is initiated, and stop inferring it from mutable order state. Only a `BALANCE` payment whose amount equals the outstanding balance may set `balancePaidAt`.
- On resend, leave the earlier payment watchable: mark it `SUPERSEDED`, or keep it `PENDING`. Only offer resend once Paystack reports `failed` or the prompt has timed out.
- Have `reconcilePendingPayments` check every non-SUCCESS payment in the window, whatever the order's status.

### P0-2. Refunds are recorded, and the customer is told, even when Paystack refuses them
**Evidence:** `src/app/actions/admin/orders.ts:187-254`, `src/lib/orders.ts:1032-1088`, `src/lib/auth/rbac.ts:24-31`

**What goes wrong:**
- **A refused refund still counts.** On a `PaystackError` (insufficient balance, already refunded, unknown reference, and so on), the action still calls `recordRefund`. The order moves to `REFUNDED`/`PARTIALLY_REFUNDED`, and the customer gets the "refunded" SMS or email. No money moved.
- **Paystack is called before anything is claimed locally.** Two clicks, or two staff at once, both pass the `outstanding` check and both reach Paystack. The local conditional update rejects the second refund, but Paystack has already processed it.
- **Only the latest payment is refunded** (`order.payments[0]`). On a deposit + balance order, a full refund exceeds that one transaction, so Paystack rejects it, and P0-2 then records it anyway.
- **Manual payments go to Paystack.** Manual and POS payments (`MANUAL-…`, `POS-…`) are sent to Paystack for refund, because `markOrderPaid` never sets `provider` and the schema default is `"paystack"` (`prisma/schema.prisma:693`, `src/lib/orders.ts:391-407`).
- **Any staff member can refund.** Refunds need only `orders:write`, which the lowest `STAFF` role holds.
- **The payment rows never change.** `Payment.status` is never set to `REFUNDED`/`PARTIALLY_REFUNDED`, and the Paystack refund id is not stored anywhere.

**Fix:**
- Add a `Refund` table: `orderId`, `paymentId`, `amount`, `status` (requested, processing, processed, failed), `providerRefundId`, `actorId`, `reason`.
- Claim the amount locally first, then call Paystack once per payment, splitting across payments when needed.
- Notify the customer only after Paystack accepts. On refusal, mark the refund failed and give the amount back.
- Make "refunded by hand (cash/MoMo)" an explicit checkbox that never calls Paystack.
- Add a `payments:refund` permission for MANAGER and above.

### P0-3. Refund and dispute webhooks are thrown away
**Evidence:** `src/app/api/webhooks/paystack/route.ts:45-46`, `:110-119`

**What goes wrong:**
- The handler reads `event.data.reference`. Paystack's refund events carry the transaction reference as `data.transaction_reference` (see the official refund payload sample), so `if (!reference) return;` exits early.
- `refund.processed` and `refund.failed` are never logged, and a failed refund is never surfaced.
- `charge.dispute.*` (chargebacks) are ignored completely, so goods can ship on a disputed charge.

**Fix:**
- Resolve the reference from `data.reference ?? data.transaction_reference ?? data.transaction?.reference`.
- Update the `Refund` row from P0-2 with the result. On `refund.failed`, alert and give the amount back.
- Handle `charge.dispute.create/remind/resolve`: flag the order, alert, and block fulfilment while a dispute is open.

### P0-4. Test-mode "payments" can settle real orders
**Evidence:** `src/lib/checkout-payment.ts:37-72`, `src/app/api/webhooks/paystack/route.ts:59-98`, `src/lib/integrations.ts:260-283`

**What goes wrong:**
- Paystack mode is a console setting, and any ADMIN can change it.
- Paystack returns `domain: "test" | "live"` on every transaction, but nothing reads it.
- With the store left in (or switched to) test mode, test cards pay real orders. Those orders become `PAID`, stock is committed, receipts go out, and goods ship for no money.
- The mobile API tags such orders `isTestOrder` only in a log line (`src/app/api/app/orders/route.ts:755-757`, `:903`).

**Fix:**
- Store `domain` on the payment. Refuse to settle a `test` transaction unless the order itself was created in test mode and flagged `isTest`.
- Show a site-wide banner, on the storefront and in admin, while test mode is on.
- Alert Slack whenever the Paystack mode or keys change.

### P0-5. Staff can release goods with no money behind them
**Evidence:**
- Marking paid: `src/lib/orders.ts:896-926`, `:1006`, reachable from the web admin and from `PATCH /api/app/orders/[id]`.
- POS: `src/app/actions/admin/pos.ts:34-35`, `:101-103`, `:123-181`.
- Console orders: `src/app/actions/admin/manual-orders.ts:103-123`.
- Permissions: `src/lib/auth/rbac.ts:24-31`.

**What goes wrong:**
- **"Mark paid" needs no proof.** Any `STAFF` user can mark an order paid as "cash", with no reference.
- **POS settings are unchecked.** POS accepts any `discountGhs` (up to 100%) and any `PAID_MOMO_BANK` claim, and neither is checked or approved.
- **Paid console orders have no payment.** A console order ticked "markPaid" becomes `PAID` with **no Payment row at all**. It cannot be refunded ("no successful payment") and does not appear in payment reports.

**Fix:**
- Add a `payments:record` permission for MANAGER and above.
- Require a reference or proof note for every manual settlement.
- Route every manual settlement through `markOrderPaid` with `provider: "manual" | "pos"`.
- Cap POS discounts, or require manager approval for them.
- Add a daily "manual settlements" report to Slack.

### P0-6. Cancel and pay can race, leaving a paid order cancelled with no alert
**Evidence:** `src/lib/orders.ts:719-741`, `:778-803`, `:417-432`

**What goes wrong:**
- `cancelOrder` reads the order, releases stock, then writes `CANCELLED`, with no condition on the write.
- The expiry sweep reconciles first, then cancels. If a webhook lands in between, `markOrderPaid` has already read `PENDING`, so it sets `PAID` and commits stock.
- `cancelOrder` then overwrites the status to `CANCELLED`. The result is `paymentStatus: SUCCESS` on a cancelled order, stock both released *and* committed, and **no** `payment.after_cancel` alert. Two concurrent cancels also release stock twice.

**Fix:** claim the cancellation atomically before anything else, with `updateMany({ where: { id, status: { notIn: ["CANCELLED","REFUNDED"] }, paymentStatus: { not: "SUCCESS" } }, data: { status: "CANCELLED", … } })`. Release stock only if the claim succeeded. Paid orders take the paid-cancel path in P0-7.

### P0-7. Cancelling a paid order keeps the money and flags nothing
**Evidence:** `src/lib/orders.ts:821-830` (PAID and PROCESSING may go to CANCELLED), `:1008-1010`

**What goes wrong:** staff cancel a paid order. Stock goes back and the customer gets "order cancelled", but no refund is created and nothing says money is owed.

**Fix:** a paid order can only be cancelled together with a refund: the Paystack refund, or a recorded manual refund. If that is not possible, set an explicit `refundDue` flag and alert.

---

## P1: stock and financial records go wrong

### P1-1. Staff-created orders break the stock model
**Evidence:** `src/app/actions/admin/pos.ts:123-181`, `src/app/actions/admin/manual-orders.ts:129-150`, `src/lib/inventory.ts:214-252`, `src/lib/orders.ts:778-790`, `src/app/actions/admin/preorders.ts:95-152`

**What goes wrong:**
- **POS sales never move stock.** POS orders paid on the spot create no reservation and no sale, so the shelf count never drops and the shop oversells.
- **Paid console orders take other shoppers' holds.** They call `commitStock` without ever reserving. `commitStock` lowers `reserved` (clamped at 0), which frees units held by *other* shoppers' checkouts, and the shop oversells.
- **Unpaid staff orders die after 6 hours.** Console orders, POS `PENDING_INVOICE`/`PUSH_MOMO_PIN` orders and bespoke **quote** orders are all `PENDING` with no SUCCESS payment, so `expireStalePendingOrders` cancels them after 6 h, silently (`notify: false`).
- **That expiry also corrupts stock.** It calls `releaseStock` on stock these orders never reserved.
- **Quotes vanish.** A quote sent to a client is cancelled before they can pay the deposit.

**Fix:**
- Build staff orders through one shared service that reserves stock, or that explicitly records "no reservation".
- Give each order an `expiresAt`, or a `source` that the 6 h checkout expiry skips. Quotes should expire on their own schedule.
- On payment, commit only what was reserved.

### P1-2. Stock goes back twice, and refunds restock whole orders
**Evidence:** `src/lib/orders.ts:729-741`, `:1065-1077`, `src/lib/inventory.ts:255-284`

**What goes wrong:**
- **Double restock.** Cancelling a paid order restocks it but leaves `inventoryAppliedAt` set. A later refund with "restock" claims that flag and restocks a second time, which creates phantom stock.
- **Whole-order restock.** A *partial* refund with restock puts back every line in full.
- **Lost stock updates.** `restockUnits` reads `onHand` and writes an absolute number without a row lock, while `commitStock` locks. A concurrent sale can be lost.

**Fix:**
- Clear `inventoryAppliedAt` in `cancelOrder` when it restocks.
- Restock per line by refunded quantity, and store refunded quantities on `OrderItem`.
- In `restockUnits`, use `SELECT … FOR UPDATE` with `{ increment }`.

### P1-3. Post-payment work is lost if any step throws
**Evidence:** `src/lib/orders.ts:450-536` (also raised in the 2026-10-05 audit, finding 9, and still open)

**What goes wrong:**
- After the paid claim, everything else runs once: account creation, discount redemption, cart clearing, the CRM row, the Slack alert, push, receipts and the owner text.
- If any of them throws, for example `customerInteraction.create`, `recordRedemption` or an SMS gateway, the rest never run.
- Retries see "already paid" and skip, so the customer gets no receipt and the owner gets no alert.

**Fix:** write those steps to an outbox table inside the claim, and process it with retries. `scripts/notification-worker.ts` already exists to build on.

### P1-4. Discount usage limits do not hold
**Evidence:** `src/lib/orders.ts:461`, `src/lib/discounts.ts:74-76`, `:166-191`, `src/app/api/app/orders/route.ts:729-736`

**What goes wrong:**
- **Free-delivery codes are never counted on the web.** Web only records a redemption when `discountTotal > 0`. A `FREE_SHIPPING` code has amount 0, so it is never recorded. "First 100 orders get free delivery" is unlimited.
- **Limits can be overshot.** The limit is checked at validation, but `recordRedemption` increments without re-checking, so concurrent orders exceed `usageLimit`.
- **Mobile uses up codes on unpaid orders.** The mobile API redeems at order *creation*, so unpaid app orders hold limited codes for up to 6 h.
- **Payment re-reads the cart's code.** `markOrderPaid` looks the code up from the cart at payment time, not from the order, and the cart's code can change in the meantime.

**Fix:**
- Store `discountId` on the order at creation, and redeem from that on payment, on web and mobile alike.
- Enforce the limit with a conditional increment: `updateMany where timesUsed < usageLimit`.

### P1-5. Mobile checkout is a second, divergent copy of the order logic
**Evidence:** `src/app/api/app/orders/route.ts:199-929` (AGENTS.md rule 2 says to call the services in `src/lib/`)

**What goes wrong:**
- **Free delivery by keyword.** Any address containing "pickup" or "showroom" is treated as pickup and charged **no delivery** (`:224-228`, `:512-516`). For example, "12 Showroom Rd, Kumasi" ships free.
- **Account pre-hijack.**
  1. Before payment, the API creates an account and hands back a signed session for whatever email and phone were typed (`:278-322`).
  2. An attacker can register a victim's phone this way and keep the token.
  3. The victim's later guest orders are filed to that account by phone (`src/app/actions/checkout.ts:157-163`, `src/lib/orders.ts:582-588`), and the attacker can read them, including the delivery address.
- **Payment row created late.** The hosted path initialises Paystack *before* the payment row exists (`:847-873`). Web does it the other way round.
- **Notices before payment.** "Order placed" SMS and email go out before payment on the hosted path. Web does not do this.
- **Unchecked MoMo number.** The Direct Debit number is never checked as a Ghana MoMo number. Web checks it.

**Fix:**
- Extract one `placeOrder` service from `createOrderFromCart` that takes lines plus a quote, and call it from both web and mobile.
- Never create or sign in an account at checkout. Link the order after an OTP-verified login instead.
- Add contract tests to `scripts/verify-sync.ts`.

### P1-6. Web guest checkout files orders and addresses onto any matching account
**Evidence:** `src/app/actions/checkout.ts:155-163`, `src/lib/orders.ts:169-181`

**What goes wrong:** a guest who types someone else's email or phone gets their order, *and their typed delivery address*, saved under that account. Staff and owner accounts are not excluded either: mobile excludes them, web does not.

**Fix:** attach orders only to the signed-in session. Match guests to an account only after a verified sign-in, and never to a staff account.

---

## P2: security and abuse

### P2-1. No rate limits on order creation or customer MoMo pushes
**Evidence:** `src/app/actions/checkout.ts:58`, `src/app/api/app/orders/route.ts:199`, `src/app/api/app/orders/[id]/momo-push/route.ts:57-75`

**What goes wrong:**
- **Prompt bombing.** Anyone can fire unlimited MoMo prompts at any number by typing it as the "MoMo number".
- **Stock holding.** Each such order holds stock for 6 h.
- **Too much freedom in the app.** The app's push endpoint lets a customer choose the phone and the charge scope, and ignores the store's `momoDirectNetworks` setting. Web enforces that setting.

**Fix:**
- Rate-limit per IP, per phone and per email.
- Cap open pending orders per phone.
- Restrict the customer push to the order's own phone (or one verified by OTP), use scope `FULL` only, and respect `momoDirectNetworks`.

### P2-2. The rate limiter keys on a spoofable header
**Evidence:** `src/lib/rate-limit.ts:90-95`

**What goes wrong:** the limiter uses the *left-most* `X-Forwarded-For` entry, which the client controls. Every IP-based limit, on verify, OTP and sign-in, can be bypassed by rotating that header.

**Fix:** use the entry appended by Railway's proxy (the right-most hop), or the platform's real-IP header.

### P2-3. Payment endpoints and the receipt page are open to anyone holding a reference
**Evidence:**
- Open endpoints: `src/app/actions/order-pay.ts:269-313` (OTP), `:318-410` (PIN check), `src/app/api/app/orders/verify/route.ts:27-206`, `src/lib/momo-push.ts:117-201` (resend).
- Receipt page: `src/app/(checkout)/checkout/confirm/page.tsx:51-66`, `:270-283`.

**What goes wrong:**
- **No proof needed.** OTP submission, PIN checks and resend need nothing beyond the payment reference or the order id.
- **Personal details on show.** The confirmation page shows the full name, address, phone and email to anyone who has a reference URL.
- **Guessable references.** References are not secret: they appear in the URL and in Paystack receipts. `MOMO-<order>-<6 digits>` gives only 10⁶ guesses once the order number is known.

**Fix:**
- Require the existing order-access token (`src/lib/order-access.ts`) or the owner's session for all of these.
- Show a minimal receipt without it.
- Generate references with `crypto.randomBytes`.

### P2-4. Paystack secrets and reusable card tokens are stored in plaintext
**Evidence:** `src/lib/integrations.ts:166-217`, `src/lib/orders.ts:403`, `src/app/actions/admin/integrations.ts:124`

**What goes wrong:**
- **Plaintext key in the database.** The live secret key sits in plaintext JSON in the `Setting` table, so it is in every database backup.
- **An admin can redirect takings.** Any ADMIN can paste in a different Paystack account's key and divert all income. The change is audited, but no alert goes out.
- **Card tokens are kept.** `authorization_code`, a token that can charge the card again, is stored on every card payment.

**Fix:**
- Keep the live secret in env only, or encrypt it with a key derived from `AUTH_SECRET`.
- Make Paystack key and mode changes OWNER-only, with re-authentication and a Slack alert.
- Stop storing `authCode` (it is also inside `rawResponse`) unless recurring billing is planned.

### P2-5. Paystack calls have no timeout
**Evidence:** `src/lib/paystack.ts:38-46`

**What goes wrong:** a hung Paystack call hangs checkout, the confirmation page, the webhook (which Paystack then retries) and the reconcile sweep.

**Fix:** add `signal: AbortSignal.timeout(15_000)`, and treat a timeout as "unknown" rather than "failed".

---

## P3: reporting, configuration and housekeeping

### P3-1. Deposits and balances
- **The admin's deposit % is ignored.** The per-product `preorderDepositPercent` saved in admin (`prisma/schema.prisma:189`) is never used. Web, mobile, POS, staff push and quotes all hardcode 50%: `checkout.ts:178`, `api/app/orders/route.ts:607`, `pos.ts:96`, `momo-push.ts:267-270`, `preorders.ts:88`. This also breaks AGENTS.md rule 3.
- **The deposit covers in-stock items too.** It is taken on the whole order total, including in-stock items and delivery (`orders.ts:155`).
- **Cash balances cannot be recorded.** A balance collected in cash or by bank transfer on delivery has nowhere to go. `balancePaidAt` is only set by `settleOrderBalance`, and "mark paid" needs `PENDING` (`orders.ts:908`). Balances stay "due" forever, and orders reach `DELIVERED` with money outstanding. Add a manual balance settlement under the P0-5 permission, and block `DELIVERED` until the balance is settled or waived.
- **Balance before deposit.** A `REMAINING_BALANCE` charge is allowed before the deposit is paid (`momo-push.ts:243` only blocks the other way).
- **Balance card on dead orders.** The tracking page shows the balance card on cancelled or refunded orders (`orders/track/page.tsx:74-77`, `:266`). The actions refuse the payment, but the page misleads.
- **Dead code.** `payRemainingBalanceAction` (`src/app/actions/order-balance.ts`) is unused and has no status checks. Delete it.

### P3-2. Mismatched payments are handled inconsistently and never resolved
**Evidence:** `order-pay.ts:351-356`, `momo-push.ts:453-458`, `api/app/orders/verify/route.ts:87-99`; compare `checkout-payment.ts:38-58`

**What goes wrong:**
- Three paths return an error on an amount mismatch without logging or alerting. Only the webhook and the reconcile path record it.
- A held payment stays `PENDING`. The sweep asks Paystack about it every 2 minutes for 3 days, and staff have no "accept" or "refund" action for it.

**Fix:** route every verify path through `reconcilePaystackPayment`, and add a held-payment resolution action.

### P3-3. The revenue dashboard is wrong
**Evidence:** `src/app/admin/analytics/page.tsx:20-82`

**What goes wrong:**
- Unpaid `PENDING` orders count as revenue.
- Unpaid deposit orders count as "cash collected".
- `refundedTotal` is ignored.
- `PARTIALLY_REFUNDED` orders drop out of cash collected entirely.
- Orders paid after cancellation are excluded.
- All orders load with no bound.
- Any `STAFF` user can see it.

**Fix:** compute from the payment and refund ledger, and paginate or aggregate in SQL.

### P3-4. Payment records cannot tell gateway money from cash
- Manual payments are stored as `provider: "paystack"` (P0-2).
- Payment rows are never set to refunded.
- POS and staff pushes hardcode `currency: "GHS"` instead of using `order.currency` (`pos.ts:176`, `momo-push.ts:305`).

### P3-5. Background jobs only run when there is traffic
- No scheduler calls `POST /api/cron/expire-orders`: `railway.json` defines none.
- `CRON_SECRET` is missing from `.env.example`.
- Late approvals and stock holds are only picked up as people browse.
- The sweep checks only 25 payments, newest first (`checkout-payment.ts:147`), so older ones can starve.

**Fix:** add a Railway cron service, every 5 minutes.

### P3-6. Smaller issues
- **Silent localhost fallback.** `env.siteUrl()` falls back to `http://localhost:3000` (`src/lib/env.ts:27`). If it is unset in production, Paystack callbacks go to localhost. Fail fast in production instead.
- **Zero-total orders fail.** A 100% discount plus free delivery initialises Paystack with amount 0, which fails, so the order cannot be placed (`checkout.ts:201`, `:252`). Settle zero totals without the gateway.
- **The confirmation page claims receipts were sent.** It says the receipt "has been dispatched via SMS … and emailed" whether or not it was (`confirm/page.tsx:153`). It also has an unreachable "Next steps" block inside the paid branch (`:176-189`).
- **POS order numbers can collide, and bad input crashes it.** POS uses `generateOrderNumber()` without a uniqueness check (`pos.ts:105`). Non-numeric shipping or discount input produces `NaN` totals.
- **Mismatch alerts are uneven.** The webhook's currency-mismatch branch does not alert Slack (`webhooks/paystack/route.ts:74-82`). Amount mismatches are logged again on each path that sees them.
- **Order numbers use `Math.random`** (`src/lib/slug.ts:42-49`). Use `crypto.randomInt`.

---

## Already sound (keep it this way)
- Webhook signatures: HMAC-SHA512 over the raw body, compared in constant time; failed processing returns 500 so Paystack retries.
- Amount and currency are checked against the payment row before settling, on both the webhook and the reconcile path.
- `markOrderPaid` claims "paid" with one conditional update. Stock is claimed once through `inventoryAppliedAt`, and money arriving after a cancel is flagged.
- `markPaymentFailed` only moves forward: a late failure cannot undo a success.
- Totals are recomputed on the server, cart prices are re-read before checkout, and stock is reserved with `SELECT … FOR UPDATE`.
- "Abandoned" gets a 20-minute grace period, so shoppers still on the payment page are not told it failed.
- Order access tokens are HMAC-based, and the cron endpoint compares its secret in constant time.
- Several 2026-10-05 findings are fixed: `PATCH /api/app/orders/[id]` is now permission-guarded, the simulated-PIN bypass and caller-supplied actors are gone, balances no longer settle without a gateway, and failures can no longer overwrite a success.

## Still open from the 2026-10-05 audit
Findings 9 (durable post-payment work, see P1-3), 16 (refund ledger and restocking, see P0-2 and P1-2), 17 (discount limits and the 50% deposit, see P1-4 and P3-1) and 18 (abuse controls, see P2-1 to P2-3).

---

## Fix order

**Phase 1: stop the money leaks**
- P0-1: record duplicate payments, add payment purpose, make resend safe.
- P0-2 and P0-3: refund ledger, `payments:refund`, refund and dispute webhooks.
- P0-4: domain check and test-mode banner.
- P0-5: `payments:record`, a Payment row for every manual or POS settlement, POS discount cap.
- P0-6 and P0-7: atomic cancel; paid cancel requires a refund.

**Phase 2: get stock and records right**
- P1-1 and P1-2: shared staff-order service, expiry by order source, fix the double restock, locked restock.
- P1-3: outbox for post-payment work.
- P1-4: discount on the order, atomic limits, count free-delivery codes.
- P1-5 and P1-6: one `placeOrder` service for web and mobile, no accounts at checkout, update `docs/SYNC_REGISTRY.md`.

**Phase 3: harden and report**
- P2-1 to P2-5: rate limits, real client IP, tokens on payment endpoints, secret storage, timeouts.
- P3: per-product deposit %, balance collection, ledger-based analytics, cron schedule, `siteUrl` guard.

**Tests to add with these fixes:**
- Concurrent webhook + confirm + cancel against a disposable database.
- Two approvals of the same order.
- A refund Paystack refuses.
- A refund webhook carrying `transaction_reference`.
- A `domain: "test"` transaction arriving while the store is live.
- A POS sale, then checking stock.
- A FREE_SHIPPING code with `usageLimit: 1`, used twice.

Each phase must end with `npm run verify:sync` and `npx tsc --noEmit`.
