# Noble Enclave Cross-Platform Module & Settings Registry

## Final synchronization audit — 2026-10-03

Static contract audit covered every shared mobile module: authentication, public storefront,
catalog, taxonomy, inventory, cart continuity, shipping, discounts, checkout, payments,
orders, account history, dashboard metrics, product management, category design, custom
notifications, settings, and app releases.

Confirmed corrections:

- Store-wide `freeShippingThreshold` now runs inside `src/lib/shipping.ts`, so web quotes,
  web checkout, mobile quotes, and mobile checkout use one rule.
- Mobile checkout now rejects a shipping rate not returned for the submitted region. It no
  longer accepts a globally valid but region-inapplicable rate ID.
- Mobile shipping no longer falls back to the cookie-based web cart quote, which cannot
  represent a bearer-authenticated or guest app cart.
- Web cart changes, mobile cart changes, and guest-cart merges now invoke the same stock,
  active-product, and active-variant validation guard.
- `verify:sync` now protects these invariants against regression.

Verification scope is repository code and contracts. Production database contents, deployed
environment variables, payment-provider state, and CDN objects require deployment smoke tests.

## Public catalog delivery and caching

Public mobile storefront reads now use `/api/store/config`, `/api/store/categories`, `/api/store/collections`, `/api/store/products`, and `/api/store/products/[id]`. These contracts use the same PostgreSQL data and shared settings service as the web and legacy `/api/app/*` endpoints. Public reads ignore bearer/session state and expose only active products and taxonomy; product detail accepts an ID or slug. Raw inventory, cost prices, and management sales statistics remain private.

Config and taxonomy have bounded mobile TTLs; product refreshes remain uncached on the device. CDN responses use a five-minute shared TTL and one-hour stale allowance. Checkout always validates current stock, prices, discounts, and shipping independently. Private management/customer APIs remain `private, no-store` and retain their existing authentication. Legacy reads remain available for older app versions.

`available: null` means an untracked or backorderable variant; mobile treats it as unrestricted stock. `totalStock` in the public compatibility payload aggregates available tracked quantities with a presence marker for unrestricted variants; it is not an internal inventory ledger or checkout quote. Images use `publicAssetUrl`; `NEXT_PUBLIC_MEDIA_BASE_URL` must be configured at build time. Release metadata sends the external APK URL in both `downloadUrl` and `directUrl`.

See [Railway implementation and rollout gates](RAILWAY_EGRESS_IMPLEMENTATION.md) for production audit results and remaining Cloudflare configuration.

This registry tracks the coverage, authoritative source, and synchronization status across the **Website** and **Mobile App** across all 8 functional domains.

Classification:
- **Shared (Parity Achieved)**: Implemented on both platforms consuming unified backend service.
- **Shared (Active Synchronization)**: Synchronization endpoints in place, client integration unified.
- **Web-Only (Documented Exception)**: Features intentionally exclusive to website (e.g., SEO sitemap, browser-specific downloads).
- **App-Only (Documented Exception)**: Features intentionally native to mobile (e.g., Android back handler, camera capture, native sharing).

---

## 1. Store Settings

| Setting / Field | Authoritative Source | Web Status | App Status | Refresh Trigger | Classification | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `storeName`, `tagline` | `Setting["store"]` / `src/lib/settings.ts` | Consumed | Consumed (`/api/app/config`) | App launch / Focus | **Shared (Parity Achieved)** | Displayed on branding headers |
| `supportEmail`, `supportPhone`, `whatsappNumber` | `Setting["store"]` | Consumed | Consumed (`/api/app/config`) | App launch / Focus | **Shared (Parity Achieved)** | Used in Help & Support sheets |
| `addressLine`, `instagramUrl` | `Setting["store"]` | Consumed | Consumed (`/api/app/config`) | App launch / Focus | **Shared (Parity Achieved)** | Contact details |
| `announcementBar` | `Setting["store"]` | Consumed (Marquee) | Consumed (`/api/app/config`) | App launch / Focus | **Shared (Parity Achieved)** | Top announcement banner |
| `returnsPolicy`, `shippingPolicy` | `Setting["store"]` | Consumed (Legal shell) | Consumed (`/api/app/config`) | App launch / Focus | **Shared (Parity Achieved)** | Shown in Account/Help section |
| `freeShippingThreshold` | `Setting["store"]` | Consumed (`src/lib/shipping.ts`) | Consumed (`/api/app/shipping/rates`) | Real-time quote | **Shared (Parity Achieved)** | Authoritatively evaluated on backend |
| `lowStockThreshold` | `Setting["store"]` | Consumed | Consumed (`/api/app/config`) | Real-time catalog | **Shared (Parity Achieved)** | Triggers low stock warning badges |
| `paymentMode` (`live` / `test`) | `Setting["store"]` | Consumed | Consumed (`/api/app/config`) | App launch / Checkout | **Shared (Parity Achieved)** | Determines live vs test Paystack key |

---

## 2. Storefront & Home Configuration

| Module / Feature | Authoritative Source | Web Status | App Status | Refresh Trigger | Classification | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `heroEyebrow`, `heroTitle`, `heroTitleAccent`, `heroBody` | `Setting["store"]` | Rendered on `/` | Rendered on Home screen | App launch / Pull to refresh | **Shared (Parity Achieved)** | App consumes backend hero configuration |
| `heroImageUrl` | `Setting["store"]` | Rendered on `/` | Rendered on Home screen | App launch / Pull to refresh | **Shared (Parity Achieved)** | Dynamic hero banner image |
| `bundleTitle`, `bundlePrice`, `bundleImageUrl` | `Setting["store"]` | Rendered on `/` | Consumed via config | App launch / Pull to refresh | **Shared (Parity Achieved)** | Curated featured collection/bundle |
| Dynamic Categories | `db.category` | Header & Catalog | Horizontal Pills & Shop Filter | App launch / Pull to refresh | **Shared (Parity Achieved)** | Replaced hardcoded static category names |
| Featured Products | `db.product` (`isFeatured: true`) | Home showcase | Home showcase | App launch / Pull to refresh | **Shared (Parity Achieved)** | Loaded dynamically via `/api/app/products` |
| Native Sharing | Platform API | Web Share API | `react-native` `Share` | User interaction | **App-Only (Documented Exception)** | Uses OS-native share sheet on mobile |

---

## 3. Catalog

| Module / Feature | Authoritative Source | Web Status | App Status | Refresh Trigger | Classification | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Products List & Pagination | `db.product` | Server-rendered & client | `GET /api/app/products` | Screen focus / search | **Shared (Parity Achieved)** | Full parity on search, filters, pagination |
| Product Details & Options | `db.product` & `db.variant` | `/product/[slug]` | `GET /api/app/products/:id` | Screen focus | **Shared (Parity Achieved)** | Full variant selection, swatches, gallery |
| Categories & Collections | `db.category`, `db.collection` | Header & Filter | `GET /api/app/categories`, `collections` | Screen focus | **Shared (Parity Achieved)** | Dynamic taxonomy |
| Pre-order Status & Lead Time | `db.product.isPreorder` | Shown on product & cart | Shown on product & cart | Real-time | **Shared (Parity Achieved)** | Preorder badge & lead time estimates |

---

## 4. Inventory

| Module / Feature | Authoritative Source | Web Status | App Status | Refresh Trigger | Classification | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Stock Quantity (`availableOf`) | `db.inventory` | Computed in `src/lib/inventory.ts` | Computed on API fetch | Real-time query | **Shared (Parity Achieved)** | Enforced on Add to Cart and Checkout |
| Stock Reservation on Order | `src/lib/inventory.ts:reserveStock` | Enforced at checkout | Enforced at mobile checkout | Order placement | **Shared (Parity Achieved)** | Atomic reservation prevents overselling |
| Reorder Alerting | `src/lib/inventory.ts` | Admin dashboard | Mobile Backend dashboard | Screen focus | **Shared (Parity Achieved)** | Stock level badge indicators |

---

## 5. Commerce (Cart, Delivery & Checkout)

| Module / Feature | Authoritative Source | Web Status | App Status | Refresh Trigger | Classification | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Server Cart (Logged-in) | `db.cart` & `db.cartItem` | Stored in DB | Synced via `GET/POST /api/app/cart` | On login / action | **Shared (Parity Achieved)** | Web-to-app cart continuity |
| Guest Cart Merge | `src/lib/cart.ts` | Merged on web login | Merged via `POST /api/app/cart/merge` | On mobile login | **Shared (Parity Achieved)** | Local device cart merged into account cart |
| Bag Kept Until Paid | `src/lib/cart.ts` (`liveCartWhere`) & `src/lib/checkout-payment.ts` | A bag whose order is unpaid (MoMo prompt pending, failed, abandoned) stays the live bag; checking out again verifies and cancels the earlier attempt | `GET/POST/PATCH/DELETE /api/app/cart` and `/api/app/cart/merge` use `liveCartWhere`; `POST /api/app/orders` empties that bag | Payment outcome / re-checkout | **Shared (Parity Achieved)** | Payment clears the bag (`markOrderPaid`); a paid earlier attempt redirects to its confirmation instead of charging twice |
| Shipping Zones & Rates | `db.shippingZone` / `src/lib/shipping.ts` | `quoteShipping` & `/admin/shipping` | `GET /api/app/shipping/rates` & `DeliverySettingsScreen` | Address/Region change & Admin mutation | **Shared (Parity Achieved)** | Dynamic rates based on Ghanaian regions with in-app zone and fee editor |
| Flat GH₵25 Removal | `src/lib/shipping.ts` | Eliminated | Eliminated | Build & API verification | **Shared (Parity Achieved)** | Real calculated shipping replacing hardcode |
| Pre-order 50% Deposit | `src/lib/orders.ts` | Supported | Supported in checkout API & cart | User selection | **Shared (Parity Achieved)** | Allows 50% advance for bespoke items |
| Discount Codes | `src/lib/discounts.ts` | Supported | Supported in checkout API & cart | User coupon entry | **Shared (Parity Achieved)** | Validated on backend against order subtotal |
| Payment methods | Direct Debit, Mobile Money, Bank Card | Supported | Supported | Checkout form / modal | **Shared (Parity Achieved)** | Direct Debit uses an instant phone prompt; Mobile Money and Bank Card use restricted hosted checkout channels. Provider identity is not customer-facing. |
| MoMo PIN Direct USSD Push | `initiateMomoPinPushAction`, `checkOrConfirmMomoPinAction` | `QuickMomoPromptButton` | `OrderPromptModal` / `/api/app/orders/[id]/momo-push` | Owner action | **Shared (Parity Achieved)** | Pushes live MoMo PIN USSD prompt to customer handset, auto-detects telco, handles OTP, polls status |
| Paystack callback and webhook URLs | `NEXT_PUBLIC_SITE_URL` | `/checkout/confirm`, `/api/webhooks/paystack` | Same backend endpoints | Admin Settings > Integrations | **Shared (Parity Achieved)** | Public HTTPS URLs shown in settings; webhook signature uses active Paystack secret |
| Ghana delivery regions | `src/lib/constants.ts` | Checkout | `/api/store/config` consumed by mobile | Checkout address | **Shared (Parity Achieved)** | Mobile keeps a compile-time fallback only for offline startup |
| Direct Debit (`direct_debit`) | Paystack Charge API | Web & API | Native in-app phone prompt + polling | Checkout submission | **Shared (Parity Achieved)** | Remains pending until provider verification or a signed webhook confirms the exact amount and currency. |
| Payment success invariant | Provider verification / signed webhook | Enforced | Enforced | Confirmation, polling, order tracking | **Shared (Parity Achieved)** | Callback arrival, charge initialization, and test mode never mark an order paid. |
| SMS & Email Purchase Receipts | `src/lib/notify.ts:notifyOrder`, `src/lib/sms.ts` | Sent on payment | Sent on app order placement & MoMo approval (`/receipt`) | Order creation / payment | **Shared (Parity Achieved)** | Dispatches SMS via Vynfy & Email receipt with Unicode currency normalization |
| PDF Invoice Download | `/orders/[orderNumber]/invoice` | Confirmation page | OrderConfirmationModal & share action | Post-checkout | **Shared (Parity Achieved)** | Official tax invoice download link |
| Guest Auto-Account Creation | `db.user` from customer phone | Web registration | Auto-created in `/api/app/orders` | Checkout | **Shared (Parity Achieved)** | Phone links account & issues bearer token |
| Idempotency Protection | `db.order` unique reference | Supported | `Idempotency-Key` / unique order | Network request | **Shared (Parity Achieved)** | Blocks double order creation |

---

## 6. Customer Account

| Module / Feature | Authoritative Source | Web Status | App Status | Refresh Trigger | Classification | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Customer Identity & Auth | `db.user` | Cookies (`/api/auth`) | Bearer JWT (`/api/app/auth`) | Token expiry | **Shared (Parity Achieved)** | Same credentials work across web & app |
| Saved Delivery Addresses | `db.address` | Customer profile | Cart modal / Account screen | Screen focus | **Shared (Parity Achieved)** | Addresses saved to customer profile |
| Order History | `db.order` | Account orders | Account orders via `/api/app/orders` | Screen focus | **Shared (Parity Achieved)** | Customers see orders on both platforms |

---

## 7. Store Management (Admin / Staff)

| Module / Feature | Authoritative Source | Web Status | App Status | Refresh Trigger | Classification | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Dashboard KPI Metrics | `db.order`, `db.product` | Full admin analytics | Mobile Backend dashboard | Screen focus / refresh | **Shared (Parity Achieved)** | Revenue, active orders, stock alerts |
| Order Management & Filtering | `db.order`, `/api/app/orders` | `/admin/orders` | `OrdersScreen` (All, Unpaid, Paid, Shipped, Delivered) | Filter switch / search | **Shared (Parity Achieved)** | Comprehensive order details, items, notes, status update |
| Manual Order Creation | `createManualOrderAction` / `POST /api/app/orders` | `/admin/orders` (New order) | `ManualOrderModal` in OrdersScreen | Owner action | **Shared (Parity Achieved)** | Create phone/walk-in orders directly from catalog with delivery & payment options |
| Delivery Zones & Rates Editor | `db.shippingZone`, `/api/app/shipping/zones` | `/admin/shipping` | `DeliverySettingsScreen` | Owner mutation | **Shared (Parity Achieved)** | Edit regional delivery rates, prices, and thresholds in-app |
| Product Catalog CRUD | `db.product`, `db.variant` | `/admin/products` | ProductsList & CreateProduct | Mutation | **Shared (Parity Achieved)** | Create, edit price/stock, upload images |
| Direct Camera Image Upload | Device Camera / R2 CDN | Web file picker | Native Camera + Expo ImagePicker | User action | **App-Only (Documented Exception)** | Mobile camera snap uploaded to R2 |
| Order Status Transitions | `db.order`, `PATCH /api/app/orders/:id` | `/admin/orders` | `OrdersScreen` Status Modal | Mutation | **Shared (Parity Achieved)** | Update order status, fulfillment status, and tracking info |
| Custom Notifications & Post Alerts | `/api/app/notifications/custom` / `expo-notifications` | `CustomNotificationPanel` | `CustomNotificationModal` + Local OS Tray | Mutation | **Shared (Parity Achieved)** | Owner can send targeted SMS or broadcast, and post to device notification tray |
| Store Design & Category Backgrounds | `db.category`, `/api/app/categories` | `/admin/store-design` | `StoreDesignScreen` in Backend Dashboard | Mutation | **Shared (Parity Achieved)** | Owner can customize category backgrounds, positions, and live card preview across web & mobile |

---

## 8. Operations & Releases

APK delivery uses `src/lib/app-release.ts` as the server-side source for
`/api/app/version.downloadUrl` and `/api/app/download`. `APK_DOWNLOAD_URL`
can select a verified HTTPS release object. Web and legacy download links
resolve through the same redirect endpoint; existing mobile response fields
remain unchanged. Optional `CATALOG_CDN_URL` redirects public catalog assets
after upload verification. See `RAILWAY_COST_REDUCTION.md` for rollout checks.

| Module / Feature | Authoritative Source | Web Status | App Status | Refresh Trigger | Classification | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| App Release Version | Published release manifest (`1.4.0`, code 18); source `mobile/app.json` (`1.4.0`, code 18) | Web direct download | `/api/app/version` | In-app update check | **Shared (Active Synchronization)** | API advertises verified release binaries. Source version matches verified release. |
| APK Distribution | Cloudflare R2 | `/api/app/download` | In-app download link | User action | **Shared (Parity Achieved)** | Hosted on R2 bucket |
| In-App Update Prompt System | `/api/app/version` / `/api/app/download` | Direct download link | `AppUpdateModal` auto-prompt & account check | App launch / Focus | **Shared (Parity Achieved)** | Prompts user on new release and downloads APK in-app |
| Drift Prevention Checks | `scripts/verify-sync.ts` | CI pipeline | `npm run verify:sync` | Pre-commit / CI | **Shared (Parity Achieved)** | Fails build if hardcoded commerce rules drift |

Production cost controls also cover all image uploads, including web preorder references:
`storeUpload` requires R2 in production and never writes new binary media to PostgreSQL.
Web header account/cart state uses `/api/account/header-state` with `private, no-store`;
cart mutations invalidate cart/checkout only, and client events update counts. Shared
public product APIs remain bounded to 48 products per response; web catalog navigation
uses pages after 48 products. Identified bulk AI/backlink crawlers are rejected before
public catalog rendering; normal web/mobile requests and payment webhooks remain available.
See `RAILWAY_COST_GROWTH_RUNBOOK.md` for rate limits, retention and cost procedures.

## Security & commerce hardening — 2026-10-05

Contract changes from the 2026-10-05 audit (`docs/CODEBASE_AUDIT_2026-10-05.md`).
Web and app share every change listed here through the services in `src/lib/`.

| Area | Change | Web | App |
| :--- | :--- | :--- | :--- |
| Order management | `PATCH /api/app/orders/[id]` requires `orders:write`; status changes go through `updateOrderStatus` / `cancelOrder` / `markOrderPaid` (manual payments only from PENDING); refunds only via the refund flow. `GET` returns only the caller's own order unless staff have `orders:read`. | Admin actions use the same services | `OrdersScreen` (staff) |
| Shipping zones | `/api/app/shipping/zones` (GET/POST/DELETE) requires `settings:manage`. Public quotes stay on `/api/app/shipping/rates`. | Admin settings | `DeliverySettingsScreen` (staff) |
| Guest app checkout | An existing account is never signed in from checkout contact details; a session token is returned only for a newly created account. Phones are not marked verified at checkout. | n/a | `StorefrontCartScreen` |
| Checkout rules | App checkout refuses inactive/draft products, checks free stock (on hand minus reserved), uses variant weights for quotes, refuses regions with no delivery rate (no silent free shipping), cancels the order if stock cannot be reserved (409), and uses a unique `Order.idempotencyKey` for retries. | `createOrderFromCart` | `POST /api/app/orders` |
| Payment finalization | Every path (webhook, app verify, MoMo push, customer MoMo) finalizes through `markOrderPaid`, which also records deposit balances and completes a failed stock commit on retry. Late failures never overwrite a successful payment. No simulated or gateway-less settlement exists. | Same | Same |
| Abandoned checkouts | Unpaid orders older than 6 h are cancelled and their stock and discount uses are released (`expireStalePendingOrders`, run during checkout and via `POST /api/cron/expire-orders` with `CRON_SECRET`). | Same | Same |
| Order documents | Tracking/invoice pages need the order email, an owner/staff session, or a signed `t` token (`orderPath`). App order lists return `invoicePath`. Receipt resend is owner/staff only, and only staff may change the destination phone. | `/orders/track`, `/orders/[n]/invoice` | `AccountScreen`, `OrderConfirmationModal` |
| Abuse limits | App login, OTP send/verify, register and payment verify return `429` with `Retry-After` when limited. | Web actions already limited | `api.ts` surfaces the error message |
| Settings writes | `updateSettings` merges onto the stored row under a lock; pricing reads use `getCommerceSettings` (no default fallback). | Same | `/api/app/config` unchanged |
| App client | 30 s request timeout; switching API host clears the session; logout clears the local bag; payment polling never overlaps. | n/a | `mobile/src/services/api.ts`, `App.tsx` |

`npm run verify:sync` now includes authorization regression checks for these rules.

## Mobile app 1.4.0 — 2026-10-05

| Area | Authoritative source | Web | App |
| :--- | :--- | :--- | :--- |
| Wishlist | `src/lib/wishlist.ts` (`WishlistItem`) | Product heart, `/account` | `GET/POST /api/app/wishlist`, heart on shop grid and product page, `WishlistScreen` |
| Reviews | `src/lib/reviews.ts` (`Review`, moderated in Admin → Reviews) | Product page form | `GET/POST /api/app/products/[id]/reviews`, `ProductReviews` |
| Push notifications | `src/lib/push.ts` (`PushDevice`, Expo push) | n/a | `POST/DELETE /api/app/devices`; customers get order notices from `notifyOrder`, staff with `orders:read` get new-order pushes from `markOrderPaid` |
| Funnel analytics | `AnalyticsEvent` (`app_open`, `product_view`, `add_to_bag`, `wishlist_add`, `search`, `checkout_start`; `purchase` is written server-side in `markOrderPaid` for every channel) | Admin → Analytics funnel card | `POST /api/app/events` (batched); pruned after 180 days by the cron sweep |
| Shop filters | `storeProductList` accepts `sort` (`featured`/`newest`/`price_asc`/`price_desc`), `minPrice`/`maxPrice` (minor units), `inStock=true` | `/api/store/products` | Shop screen sort/price/stock panel; suggestions from `/api/search` |
| Order tracking | `GET /api/app/orders/[id]` accepts the signed `?t=` token and returns `invoicePath` | `/orders/track` | `OrderTrackingScreen` timeline |
| Deep links | `nobleenclave://`, `https://nobleenclave.com/product/*`, `/orders/track` | `/.well-known/assetlinks.json` (set `ANDROID_CERT_SHA256`) | React Navigation `linking` |
| OTA updates | EAS Update, `runtimeVersion` = app version, channels per build profile | n/a | Checked on launch and on resume |

## Bulk Product Add — 2026-10-06

Web admin (`/admin/products/bulk-add`) and, since 2026-10-06, the owner app (OWNER/ADMIN, photo imports) via
`/api/app/bulk-import*`. Both drive the same batches, queue and services; spreadsheet imports stay web-only.

| Area | Authoritative source | Web | App |
| :--- | :--- | :--- | :--- |
| Product creation | `src/lib/catalog/create-product.ts` (`createCatalogProduct`) — one transaction per product: options, values, variants, inventory, images (incl. `optionValueId`), categories, collections | Add Product form, agent `create_product`, Bulk Product Add | `POST /api/app/products` now uses it too; app Bulk Add imports through it |
| Catalog Inbox | `ProductImportBatch` / `ProductImportItem` / `ProductImportMedia`; nothing reaches `Product` until imported; drafts by default | `/admin/products/bulk-add/[batchId]` | n/a |
| Recipes & options | `ProductRecipe`, `CatalogOptionDefinition`/`CatalogOptionValueDefinition`, `CatalogNormalizationRule` | `/admin/products/recipes`, `/admin/products/options` | n/a |
| Supplier identity | `CatalogSource`, `CatalogSourceProfile`, `CatalogSourceProduct` (source + external key → product) | Import profiles | n/a |
| Work queue | `ProductImportJob` (Postgres, `SKIP LOCKED`); runs after requests, on review-page polls, `POST /api/cron/bulk-import` (`CRON_SECRET`), or `npm run catalog:worker` | Same | n/a |
| Batch operations | `src/lib/bulk-import/batch-ops.ts` (`startBatchProcessing`, `importBatch`, `publishBatch`, `retryFailedItems`, `cancelBatch`, `editImportItem`) — callers check permissions | Server actions in `src/app/actions/admin/bulk-import.ts` wrap them | `GET/POST /api/app/bulk-import`, `GET/POST /api/app/bulk-import/[batchId]` (`action`: start, import, publish, retry, cancel, editItem), `POST /api/app/bulk-import/[batchId]/photos` (one base64 photo per request); `BulkAddScreen` |
| Bulk AI | OpenRouter or NVIDIA NIM (`bulkAiVendor`), `src/lib/bulk-ai/*`; settings key `bulkAi`; separate model chains per vendor; OpenRouter `FREE_ONLY` by default; rate-limited items requeue with backoff (item stays `PENDING`); 3 attempts per model, max 3 models; attempts logged in `ProductImportAiAttempt`, results cached in `BulkAiCache` | `/admin/products/bulk-add/settings` (`settings:manage`) | Reads `ai.enabled` / `ai.vendor` from `GET /api/app/bulk-import`; settings stay web-only |
| Sync audit 2026-10-06 | App category edits (`PATCH /api/app/categories`) now audit and revalidate storefront; app shipping zone/rate edits revalidate `/checkout` and admin delivery like the web actions | — | — |

## Product pagination and filters — 2026-10-06

| Area | Authoritative source | Web | App |
| :--- | :--- | :--- | :--- |
| Shop listing | `storeProductList` (`/api/store/products`: `page`, `limit`, `categoryId`, `sort`, `minPrice`, `maxPrice`, `inStock`, `q`) | `/shop` — 24 per page, numbered pages with gaps and a "Go to page" box (`src/components/ui/page-nav.tsx`) | Shop tab — 24 per page via `Pager` (`mobile/src/components/Pager.tsx`), same pattern; category pills are live store categories filtered on the server (no client-side filtering of loaded pages) |
| Admin product list | `/admin/products` query / `GET /api/app/products` (`page`, `limit`, `status`, `stock`, `categoryId`, `q`) | Numbered pages + jump; out-of-range page redirects to the last page | Products tab — 20 per page, status, stock (out/low) and category filters, debounced search, `Pager` |

## Mobile Money prompt recovery �� 2026-10-08

Web order tracking and mobile storefront checkout offer a customer-controlled Resend MoMo Prompt action with a 30-second UI cooldown and a payment-status check before dispatch. The mobile action uses the existing authenticated POST /api/app/orders/[id]/momo-push endpoint and preserves the checkout deposit scope; it never creates another order. Both surfaces remind customers to check network approvals, approve only one request, and check payment status if already debited. MTN guidance uses *170#, My Wallet, My Approvals; other networks receive network-specific menu guidance without MTN instructions. Pending means authorization is unconfirmed, not that a handset pop-up was delivered. Web and shared app services reject cancelled, refunded, or fully paid orders; paid deposits cannot be reissued through the app service. Existing response contracts remain unchanged. No automatic charge retries or outbound reminders are introduced.

## Product minimum order quantity

`Product.minimumOrderQuantity` is a positive integer, defaults to 1, and applies separately to each variant line. Admin web create/edit and `/api/app/products` POST/PATCH persist this field. Web catalog, public `/api/store/products`, app product responses, and app cart product objects expose it. Web and mobile quantity controls use the minimum; removal remains explicit. Shared cart validation and order quantity validation reject under-minimum lines, including stale carts after a minimum changes. Existing products retain minimum 1.


## Customer notification foundation - 2026-10-09

Order notices from web and mobile now share the PostgreSQL inbox and delivery queue through src/lib/notify.ts. A successful order-notice response means persisted/queued, not provider acceptance. Custom direct-phone SMS remains synchronous and reports deliveryStatus: "accepted" only after provider acceptance. Receipt, custom-order and staff-resend responses report queued outcomes. No mobile screen reads the direct-phone deliveryStatus field.

Customer API contracts (active bearer account required, private/no-store):

- GET /api/app/notifications?before=<id>&limit=<1..50>: items, nextCursor, unreadCount. Each item contains id, eventKey, title, body, actionUrl, createdAt and readAt.
- GET /api/app/notifications/unread-count: count.
- PATCH /api/app/notifications/<id>/read: ok, or 404 for missing/foreign notification.
- POST /api/app/notifications/mark-all-read: ok and updated count.

Web /account uses the same inbox service with a bell count, pagination, read controls and authenticated order links. These APIs are available to mobile; a native inbox screen is not included in this change. Existing Expo order push routing remains unchanged, with notificationId added to its data payload. Guest orders receive provider jobs without a customer inbox. No new providers or marketing channels are activated.

Database migration 20261009000000_customer_notifications adds CustomerNotification, NotificationDelivery and NotificationAttempt. Run migrations before serving the updated account/admin pages. POST /api/cron/notifications uses CRON_SECRET to drain pending jobs and apply retention; npm run notifications:worker is an alternative queue runner. See [notification implementation and rollout](CUSTOMER_NOTIFICATIONS.md).
