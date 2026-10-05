# Codebase audit — 5 October 2026

## Assessment and scope

The repository builds, and both applications pass TypeScript checks. However, the current source contains critical authorization and authentication failures, including unauthenticated order and shipping mutations and paths that settle payments without gateway proof. Resolve these before adding features or doing cosmetic work.

This is a repository-wide static audit with deeper tracing of authentication, authorization, checkout, payments, inventory, discounts, shipping, carts, settings, mobile state, integrations, release configuration, and verification scripts. The source inventory contains 277 web/backend TypeScript files (54,745 lines) and 30 files under `mobile/src` (19,810 lines), excluding generated Prisma code; `mobile/App.tsx` is additional. This is not a claim that every line or runtime branch was independently validated.

No application source, dependencies, database records, or deployed services were intentionally changed. The audit report is the only intended tracked change. Production build and compiler checks regenerated ignored local artifacts. No live payment, SMS, email, or exploitation requests were sent. Production configuration, database contents, backup restoration, device behavior, and browser accessibility remain unverified.

Severity reflects source behavior and plausible impact. Dependency audit severity is separate from proof that an advisory is reachable in this application.

## Verification results

| Check | Result |
| --- | --- |
| `npm run verify:sync` | Passed: 20 checks. These are predominantly source-string and file-presence checks, not behavioral parity tests. |
| Root `npx tsc --noEmit` | Passed. |
| Mobile `npx tsc --noEmit` | Passed. |
| `npm run build` | Passed. Prisma product/category errors occurred during prerendering; sitemap code catches database failures and falls back to fixed URLs. |
| Root `npm run lint` | Failed: 5 errors and 30 warnings. |
| Mobile `npm run lint` | Passed with 7 warnings, including a missing effect dependency. |
| Mobile `npx expo-doctor` | Passed: 21/21 checks. |
| `npm run verify:egress` | Failed at `scripts/test-egress-hardening.ts:58`: expected `appDownloadUrl()` to throw when `APK_DOWNLOAD_URL` is absent. Current implementation returns a fallback URL. The chained cost-control test therefore did not run through this command. |
| `npx tsx scripts/test-cost-controls.ts` | Passed when run separately. |
| Root `npm audit --json` | 15 affected package entries: 1 critical, 14 high. Includes direct and transitive packages. |
| Mobile `npm audit --json` | 24 affected package entries: 16 high, 8 moderate. Includes tooling and transitive packages. |

`npm run verify` was not executed: it uses the configured database and includes writes. Commerce integration tests need an explicitly isolated test database first.

## Critical: repair before further releases

### 1. Anyone can update orders and mark them paid

**Evidence:** `src/app/api/app/orders/[id]/route.ts:110`; `src/lib/auth/bearer.ts`, `withApiAuth`.

The PATCH handler never calls an authentication or permission guard. It accepts an order ID or order number and directly updates status, tracking, fulfillment, and notes. Setting status to `PAID` also sets `paymentStatus: "SUCCESS"` when the order has no `paidAt` timestamp. It bypasses the shared transition, payment, cancellation, and inventory services.

`withApiAuth` is only an exception wrapper. Wrapping a handler does not require a token.

**Fix:** Require `requireBearerPermission("orders:write")` before reading or mutating management data. Route transitions through shared services. Public customer APIs must never establish payment success from a requested status. Test anonymous, customer, disabled staff, and permitted staff cases.

### 2. Anyone can create, edit, disable, or delete shipping zones and rates

**Evidence:** `src/app/api/app/shipping/zones/route.ts:52` and `:134`.

POST and DELETE use the exception wrapper without authentication. Requests can change authoritative delivery fees and regional coverage for both applications. GET exposes the management configuration as well.

**Fix:** Require `settings:manage` for management handlers, validate input with a shared schema, and record actor-based audits. Keep public quotes on the dedicated rates endpoint.

### 3. Guest mobile checkout can issue another user's session token

**Evidence:** `src/app/api/app/orders/route.ts:262`, `:290`, `:826`.

Guest checkout matches an existing user by a supplied email OR phone number, then signs a session using that user's ID and real role. It returns the token after initiating checkout, without requiring successful payment or identity verification. Existing staff accounts are not excluded. This can become customer or staff account takeover.

**Fix:** Never authenticate an existing account based on checkout contact fields. Require password or OTP verification before linking an authenticated profile or issuing a token. Preserve guest checkout using a guest identity. Do not set `phoneVerified` without verification.

### 4. Mobile login has a seed-password override

**Evidence:** `src/app/api/app/auth/login/route.ts:52`.

The route accepts configured seed credentials, with a known fallback password. It authenticates even when the stored password does not match and rewrites the stored hash to the seed password. A normal password change does not remove this alternate login path while seed credentials remain accepted.

**Fix:** Remove seed credential handling from login entirely. Limit seeding to explicit bootstrap operations. Review and rotate affected privileged credentials, and invalidate existing sessions as part of remediation. Remove fixed privileged passwords from maintenance scripts, including `scripts/migrate-owners-and-categories.mjs`.

### 5. Web OTP failure signs users in without verification

**Evidence:** `src/app/actions/auth.ts:133` and `:214`; `src/lib/sms.ts`, `sendOtp`.

When OTP sending returns a fatal failure, login creates a session and marks the phone verified. Missing gateway configuration is explicitly a fatal error. Registration has the same fallback. Existing privileged phone accounts can therefore be accessible without proof when these conditions occur.

**Fix:** Fail closed on OTP failure. Show a recovery path or allow separately verified password login. Verify that missing credentials, gateway rejection, and delivery failure never issue sessions.

### 6. Public server actions trust caller-supplied actors and simulated settlement

**Evidence:** `src/app/actions/admin/momo-push.ts:37`, `:220`, `:285`.

The exported server actions accept `actor` objects. `getStaffOrActor` returns that object without authentication. `checkOrConfirmMomoPinAction` accepts `simulateClientPinEntered` and, when true, finalizes payment without gateway verification. These exports are also imported by client components, so they must be treated as public action endpoints. TypeScript argument types do not establish trust.

**Fix:** Remove caller-controlled actor and simulation bypasses from public actions. Authenticate web actions internally. Move business operations into a server-only service, which API adapters call after verifying bearer users and permissions. Gateway settlement must be verified in all production paths. Add amount/currency checks to the admin verification path, which currently lacks the checks present in the customer and webhook paths.

### 7. Balance action can settle money without a payment gateway

**Evidence:** `src/app/actions/order-balance.ts:12`, `:53`.

The action accepts an order ID without checking ownership or staff permission. If Paystack is unavailable, it creates a successful direct payment and sets `balancePaidAt`. Missing integration configuration therefore becomes evidence of payment.

**Fix:** Require an authorized order owner or a dedicated staff settlement permission. Remove the automatic success fallback. Manual settlement must be a separate audited operation with an explicit payment record and reason.

## High priority: privacy and commerce correctness

### 8. Order data and receipts lack ownership checks

**Evidence:** `src/app/api/app/orders/[id]/route.ts:17`; `src/app/api/app/orders/[id]/receipt/route.ts:15`; `src/app/(shop)/orders/[orderNumber]/invoice/page.tsx:25`; `src/app/(shop)/orders/track/page.tsx`.

Order detail GET requires neither a token nor ownership. It returns contact/address, payment, and timeline information. Receipt POST allows unauthenticated callers to replace the order phone and resend a receipt. Invoice access depends only on an order number. Tracking makes email optional. Order list responses also include `staffNote` for customers (`src/app/api/app/orders/route.ts:141`).

**Fix:** Require ownership for account access and staff permission for management access. Give guests separate high-entropy, scoped, expiring access tokens. Filter internal notes/events from customer responses. Authorize and validate receipt recipients; add resend throttling.

### 9. Payment success cannot reliably recover after partial failure

**Evidence:** `src/lib/orders.ts:309`, `:346`, `:372`.

`markOrderPaid` establishes order success before inventory, discount, cart, and notification work. If stock commitment fails, the inventory flag is reset, but a retry exits immediately because `paymentStatus` is already `SUCCESS`. Later work can remain incomplete. A crash after claiming inventory but before committing stock also leaves an incomplete flag. Cancellation and payment operate across separate transactions and can race.

**Fix:** Make financial and inventory transitions atomic or use durable stages with independently retryable steps. Store notification work in an outbox. Test injected failures and concurrent webhook/confirmation/cancellation requests against an isolated database.

### 10. Multiple payment finalizers produce different business outcomes

**Evidence:** `src/app/actions/order-pay.ts:332`; `src/app/actions/admin/momo-push.ts:309`; `src/lib/orders.ts:287`; `src/app/api/webhooks/paystack/route.ts:97`.

Customer/admin MoMo helpers write payment and order success directly, bypassing stock commitment, cart clearing, discount recording, and shared notifications. A subsequent webhook can exit early because the order is already successful. These helpers can also overwrite a progressed or cancelled order with `PAID`.

The shared finalizer returns before recording a second successful payment if the order is already successful. This prevents hosted balance payments from being recorded correctly through the webhook/confirmation path and does not set `balancePaidAt`.

**Fix:** Use one central settlement service for all channels. Persist payment purpose (`initial`, `deposit`, `balance`) when initiating payment; do not infer it from mutable order state. Record each reference exactly once, derive outstanding money from successful payments, and preserve valid fulfillment state.

### 11. Failed attempts can overwrite successful payment state

**Evidence:** `src/lib/orders.ts:473`.

`markPaymentFailed` unconditionally marks the payment and order failed. A delayed failure from another attempt can downgrade an order that already received successful payment.

**Fix:** Apply monotonic per-payment transitions. Recompute order financial state from the payment ledger. Ignore stale failures after settlement and test reversed event ordering.

### 12. Mobile checkout bypasses sellability and tolerates failed stock reservation

**Evidence:** `src/app/api/app/orders/route.ts:350`, `:409`, `:604`.

Direct variant lookup does not enforce active variants and active products. Stock prechecks use `onHand` rather than available units, and reservation errors are logged while payment initiation continues. Product-ID fallback maps line items to real variants but reserves using the original client IDs, so fallback items can skip reservation. Duplicate input lines are not normalized before validation.

**Fix:** Resolve and normalize canonical variants once. Apply the shared sellability/quantity guard. Abort checkout on reservation failure and roll back or cancel the order. Reserve the same canonical variant IDs stored on order lines.

### 13. Checkout idempotency is not atomic

**Evidence:** `src/app/api/app/orders/route.ts:306`; `src/app/actions/checkout.ts`; `src/lib/orders.ts:89`.

Mobile searches a marker embedded in customer notes within a 15-minute window. Two concurrent requests can both pass this lookup. Web checkout lacks an atomic conversion claim and can create multiple orders from the same cart. Mobile replay does not return the complete original payment/session response.

**Fix:** Add a unique database idempotency record scoped to caller/session, with request hash, operation state, and stable response. Claim cart conversion transactionally. Keep operational keys out of customer-visible notes.

### 14. Failed or abandoned checkout leaves stock and carts in inconsistent states

**Evidence:** `src/lib/orders.ts:225`, `:249`; `src/app/api/app/orders/route.ts:617`; `src/app/actions/checkout.ts:194`.

Web reserves stock and converts the cart before gateway initialization. Mobile clears server cart lines before payment initiation completes. Failed initialization lacks compensating cancellation. No reservation-expiry scheduler was found in the audited source/scripts. Unpaid reservations can remain indefinitely unless manually cancelled.

**Fix:** Introduce timed, order-scoped reservations and a recoverable pending checkout. Compensate initialization failure and expire abandoned attempts through a durable job. Preserve cart recovery; reconcile late payments after expiration.

### 15. Shipping can silently become free or use the wrong weight

**Evidence:** `src/app/api/app/orders/route.ts:432`, `:455`; `src/lib/orders.ts:106`; `src/lib/shipping.ts`.

Mobile quotes use `totalWeightGrams: 0`. Both checkout implementations can proceed with zero shipping when no applicable quote exists. Mobile additionally infers pickup from address text containing `pickup` or `showroom`, allowing a delivery address to bypass delivery pricing accidentally or intentionally.

**Fix:** Derive weight from canonical cart lines. Reject unsupported delivery destinations. Use an explicit validated fulfillment method and server-configured pickup locations. Remove address-text inference.

### 16. Refunds and restocking need a transactional ledger

**Evidence:** `src/app/actions/admin/orders.ts:185`; `src/lib/orders.ts:607`; `src/lib/inventory.ts:255`.

Refund action records a refund even when the gateway rejects it. It caps against order total rather than settled funds, which is wrong for deposits. `recordRefund` can restock every order line on each partial refund without tracking refunded quantities. Concurrent refunds can lose cumulative updates. Concurrent cancellations can restock or release twice. `restockUnits` reads and writes an absolute stock count without row locking, risking lost increments.

**Fix:** Persist refund requests and provider settlement separately. Make manual refunds explicit. Limit refunds to verified net receipts and line quantities. Use locked/atomic stock increments and unique return/cancellation movement keys.

### 17. Discounts and deposit policies drift between channels

**Evidence:** `src/app/api/app/orders/route.ts:639`; `src/lib/discounts.ts:65`, `:216`; `src/lib/orders.ts:135`; `src/app/actions/checkout.ts:166`.

Mobile consumes discounts before payment, with separately swallowed writes; web records them after success. Concurrent eligibility checks can exceed limits. Web free-shipping discounts have zero monetary discount, but redemption handling runs only when `discountTotal > 0`, so they can avoid usage accounting. Both storefront paths hardcode a 50% deposit option despite the catalog exposing `preorderDepositPercent`.

**Fix:** Reserve/redeem discount eligibility transactionally through a shared checkout service. Count free-shipping redemptions. Read deposit policy from server data and define mixed-cart behavior. Document both contracts in `docs/SYNC_REGISTRY.md`.

### 18. Authentication and payment endpoints lack consistent abuse controls

**Evidence:** `src/app/api/app/auth/login/route.ts`; `src/app/api/app/auth/otp/send/route.ts`; `src/app/api/app/auth/otp/verify/route.ts`; `src/app/api/app/orders/verify/route.ts`; `src/app/actions/auth.ts:75`.

Mobile password/OTP handlers lack application rate limiting. Web email-password login returns before the phone-branch limiter. Public payment verification and OTP submission have no ownership or request limits. Receipt resend and checkout can generate external-service costs.

**Fix:** Limit by verified proxy address, account/phone, and operation. Rate-limit before expensive hashing/gateway calls. Add checkout/receipt budgets and scoped guest payment access. Existing process-local limits require shared enforcement before running multiple instances.

### 19. Disabled staff and lower roles can still broadcast

**Evidence:** `src/app/api/app/notifications/custom/route.ts:25`, `:30`, `:95`; `src/app/actions/admin/notifications.ts:19`.

Mobile notification POST loads a staff role without checking `isActive`. Any staff role can update store announcements, while the web equivalent requires `settings:manage`.

**Fix:** Use `requireBearerPermission` consistently. Separate announcement management, customer messaging, and order messaging permissions. Test disabled users and role parity across channels.

### 20. Product JSON-LD needs safe serialization

**Evidence:** `src/app/(shop)/product/[slug]/page.tsx:326`; installed guide `node_modules/next/dist/docs/01-app/02-guides/json-ld.md`.

Product data is inserted into a script using plain `JSON.stringify`. Catalog text containing a closing script sequence can escape the JSON-LD element. This requires a catalog write path, but the current account takeover failures make that boundary especially relevant.

**Fix:** Escape `<` as `\u003c` in serialized JSON-LD and verify rendered output. Add a tested CSP compatible with payment and media integrations after fixing the underlying injection boundary.

## Dependency upgrades

### 21. Patch direct runtime dependencies first

| Package | Current declared version | Action |
| --- | --- | --- |
| Next.js | `16.3.2` | Audit proposes `16.3.8` within the current major. At minimum, leave all reported vulnerable ranges. Keep `eslint-config-next` aligned. |
| Sharp | `^0.35.3` | Update lockfile to at least `0.35.4`, then verify native binaries and uploads. |
| Nodemailer | `^9.0.5` | Upgrade to at least `10.0.6`; review major-version compatibility and test SMTP/template behavior. |
| Prisma family | `^7.9.1` | Triage transitive `deepmerge-ts`/`mysql2` findings and use a supported compatible patch/override where appropriate. Keep client, CLI, and adapter aligned. |
| Expo / React Native | SDK 57 / RN `0.86.3` | Doctor confirms compatibility. Triage affected tooling/transitive packages; do not independently bump React/RN or accept suggested old SDK downgrades. |

Sources checked on 5 October 2026:

- [Next.js Windows RCE advisory](https://github.com/advisories/GHSA-p293-qw3h-jr36): current version is affected when hosted on Windows. Local dev binds to `0.0.0.0`; production Railway OS was not independently inspected.
- [Next.js image optimization advisory](https://github.com/advisories/GHSA-2xp9-vwfh-vxw4): inspect deployment exposure. The repository config uses `images.unoptimized: true`.
- [Next.js ImageResponse advisory](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j): fixed in `16.3.6`. No `next/og` use was identified in application source; package finding alone does not prove runtime exposure.
- [Sharp advisory](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c): fixed in `0.35.4`.
- [Nodemailer advisory](https://github.com/advisories/GHSA-v53p-9fqp-m79j): fixed in `10.0.6`.
- [Expo SDK 57 reference](https://docs.expo.dev/versions/v57.0.0/): use SDK-matched documentation and dependency tooling.

The npm audit resolver suggests downgrading Prisma, Next ESLint configuration, Expo, and React Native for some transitive findings. Do not run `npm audit fix --force` indiscriminately. Separate runtime reachability from tooling exposure, inspect dependency chains, and validate compatible resolutions. Audit totals count affected package entries, not distinct remotely exploitable application vulnerabilities.

## Medium priority: mobile reliability and architecture

### 22. Logout preserves another account's cart

**Evidence:** `mobile/App.tsx:585`, `:532`; `mobile/src/services/api.ts:111`.

Logout clears token/user storage but leaves cart state and saved cart. A subsequent login merges the remaining cart into the next account. This can transfer one customer's bag to another user on a shared device. Concurrent optimistic mutations also apply responses without sequencing, allowing older responses to replace newer state.

**Fix:** Namespace account carts separately from guest carts, clear visible account state on logout, and merge only genuine guest items. Serialize cart mutations or use revisions to reject stale responses. Backend cart creation needs a unique active-cart invariant; the current schema only indexes `userId`.

### 23. Network and polling behavior can hang or multiply work

**Evidence:** `mobile/src/services/api.ts:142`; `src/lib/paystack.ts:36`; `mobile/src/screens/StorefrontCartScreen.tsx:264`, `:313`; `mobile/src/components/OrderPromptModal.tsx:126`.

Core mobile requests and Paystack calls lack explicit timeouts. Payment intervals can overlap when requests take longer than the interval. In the storefront polling catch branch, the attempt limit is not enforced, so repeated network failures can continue indefinitely. Service-level 401 clears credentials without directly clearing React user/mode state; startup retains cached state when `getMe` rejects.

**Fix:** Use cancellable requests, bounded timeout/backoff, and sequential polling paused on background/unmount. Enforce deadlines in every result/error branch. Expose a session-expired event to clear UI state. Keep charge retries tied to durable idempotency.

### 24. API destination changes retain credentials

**Evidence:** `mobile/src/services/api.ts:84`, `:139`.

`setBaseUrl` accepts any HTTPS host while retaining the current token. Initialization also accepts persisted URLs without reapplying the production HTTPS restriction. Subsequent private requests send that token to the selected destination.

**Fix:** Restrict production origins to approved hosts and clear credentials when switching origins. Apply the same validation during startup. Keep custom endpoints limited to development builds.

### 25. Mobile navigation and large screens need structure

**Evidence:** `mobile/App.tsx`; `mobile/package.json`; `mobile/src/screens/StorefrontCartScreen.tsx` (2,710 lines); `mobile/src/screens/AccountScreen.tsx` (1,783 lines); `src/components/admin/product-editor.tsx` (1,699 lines).

Mobile navigation is maintained through conditional state and custom back-button logic. Expo Router is absent despite the repository mandate. Large screens mix networking, checkout state, auth, polling, modals, and styling. This makes recovery and cross-platform navigation difficult to verify.

**Fix:** After correctness fixes, migrate navigation incrementally with route tests for back behavior, links, order detail, and auth redirects. Extract checkout/payment state into tested hooks/services and reusable components. Consolidate mobile theme tokens and verify VoiceOver/TalkBack labels, focus, text scaling, and error announcements on devices. These accessibility improvements are a validation backlog, not a measured accessibility score.

## Medium priority: operations, caching, and verification

### 26. Settings fallback can affect pricing and overwrite configuration

**Evidence:** `src/lib/settings.ts:158`, `:201`; `src/lib/db-health.ts:75`.

`getSettings` silently returns defaults on failed database checks. Defaults contain commerce policy. `updateSettings` reads through that fallback before writing the entire settings object; a transient read failure followed by a successful write can overwrite unrelated configured values with defaults. `isDbTemporarilyDown` always returns false, and `recordDbFailure` does not record unreachable state, despite callers treating them as a circuit breaker.

**Fix:** Separate display fallbacks from authoritative commerce reads. Fail checkout when required policy cannot be loaded. Make updates operate on validated stored data using transaction/version checks. Implement or remove the misleading circuit-breaker API.

### 27. Cache invalidation does not cover every write path

**Evidence:** `src/lib/catalog-revalidate.ts`; `src/lib/agent/tools.ts`; `src/lib/orders.ts`; `src/lib/store-api.ts`.

Product API writes use a catalog invalidation helper, but agent price/product writes and payment stock changes do not call it. Public APIs advertise five-minute shared caching with an hour of stale reuse. Process-local settings/catalog caches also diverge across instances.

**Fix:** Have shared business mutations emit catalog/settings revision events, including agent and inventory operations. Verify actual CDN invalidation; Next path invalidation alone does not establish that an external CDN purges responses. Treat public stock as advisory and validate every checkout authoritatively.

### 28. Tests can pass while commerce contracts are broken

**Evidence:** `scripts/verify-sync.ts:148`; `scripts/verify.mjs:29`; `scripts/test-egress-hardening.ts:58`; absence of a tracked `.github` workflow directory.

Sync verification mostly checks that selected strings exist. It reports idempotency and shipping parity despite the issues above. `verify.mjs` reimplements allocation arithmetic instead of exercising the production function. Egress assertions no longer agree with release behavior. Railway's configured build runs `npm run build`, which passes despite ESLint errors.

**Fix:** Add isolated behavioral tests for authentication/ownership, payment event ordering, deposits/balances, last-unit concurrency, refunds, cart merges, and shipping parity. Keep structural checks as supplemental checks. Add CI gates for web/mobile types and lint, sync, cost controls, dependency triage, and build. Repair release tests to reflect the agreed policy.

The five web ESLint errors are explicit `any` usage in order list, MoMo API, notification, and SMS code. Remove unused imports and address the mobile payment effect dependency warning.

### 29. Background integration work is not durable

**Evidence:** `src/app/api/webhooks/slack/route.ts:93`; `src/app/api/webhooks/whatsapp/route.ts:77`.

Messaging webhooks acknowledge and launch unawaited work. Dedupe is process-local. A process restart can lose acknowledged work; multiple instances can repeat operations. Payment notifications similarly lack a durable recovery queue.

**Fix:** Persist inbox events before acknowledgment, process through a worker, and store unique provider event IDs. Use an outbox for notifications. Validate agent tool arguments with executable schemas; advertised JSON schemas alone do not validate input inside `executeTool`.

### 30. Release, health, and storage safeguards need strengthening

**Evidence:** `src/lib/app-release.ts:32`; `src/app/api/health/route.ts:29`; `src/lib/r2.ts:52`; `mobile/eas.json`; `src/app/sitemap.ts`.

The APK manifest uses manually maintained version data and fallback download hosts without verifying artifact existence. Invalid configured APK URLs are silently ignored. Deep health checks are public and can expose raw database errors and force repeated database work. R2 client caching keys omit the secret value, so secret rotation with the same access-key ID retains old credentials. Sitemap build fallback can leave product URLs absent until regeneration.

**Fix:** Generate release metadata from verified build artifacts and test URL/version/checksum policy. Protect deep diagnostics and return sanitized errors; keep cheap liveness checks. Make storage client invalidation respond to credential changes. Verify sitemap regeneration after deploy. Add staging payment smoke tests and document/test backup restoration and migration rollback procedures; repository inspection cannot establish whether external backups currently exist.

## Recommended implementation order

1. **Contain unauthorized access:** fix findings 1–8 and 19; remove actor/simulation/seed/OTP bypasses; add authorization regression tests. Review affected privileged sessions and account integrity.
2. **Patch exposed dependencies:** update Next.js, Sharp, and Nodemailer with compatibility checks. Triage remaining transitive advisories separately.
3. **Rebuild commerce invariants:** centralize order creation and settlement; introduce payment purpose, atomic idempotency, reservation expiry, refund accounting, and transaction-safe inventory.
4. **Enforce cross-platform contracts:** share validation/DTOs, fix shipping/deposit/discount parity, and update `docs/SYNC_REGISTRY.md` with behavioral tests.
5. **Improve reliability:** fix mobile logout/polling/session state, settings writes, cache invalidation, durable integration jobs, and CI gates.
6. **Refactor and polish:** migrate navigation, split large screens, improve accessibility and loading/error recovery, then measure performance on representative devices and connections.

Preserve the existing strengths: PostgreSQL as shared business storage, minor-unit money, database-sourced prices, row-locked reservation logic, role checks on many admin actions, secure mobile token storage, webhook signature validation, bounded public traffic maps, and reduced media egress. The priority is to apply those safeguards consistently across every entry point.
