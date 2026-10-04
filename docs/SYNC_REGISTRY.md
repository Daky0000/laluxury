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
| Shipping Zones & Rates | `db.shippingZone` / `src/lib/shipping.ts` | `quoteShipping` | `GET /api/app/shipping/rates` | Address/Region change | **Shared (Parity Achieved)** | Dynamic rates based on Ghanaian regions |
| Flat GH₵25 Removal | `src/lib/shipping.ts` | Eliminated | Eliminated | Build & API verification | **Shared (Parity Achieved)** | Real calculated shipping replacing hardcode |
| Pre-order 50% Deposit | `src/lib/orders.ts` | Supported | Supported in checkout API & cart | User selection | **Shared (Parity Achieved)** | Allows 50% advance for bespoke items |
| Discount Codes | `src/lib/discounts.ts` | Supported | Supported in checkout API & cart | User coupon entry | **Shared (Parity Achieved)** | Validated on backend against order subtotal |
| Payment methods | Direct Debit, Mobile Money, Bank Card | Supported | Supported | Checkout form / modal | **Shared (Parity Achieved)** | Direct Debit uses an instant phone prompt; Mobile Money and Bank Card use restricted hosted checkout channels. Provider identity is not customer-facing. |
| Paystack callback and webhook URLs | `NEXT_PUBLIC_SITE_URL` | `/checkout/confirm`, `/api/webhooks/paystack` | Same backend endpoints | Admin Settings > Integrations | **Shared (Parity Achieved)** | Public HTTPS URLs shown in settings; webhook signature uses active Paystack secret |
| Ghana delivery regions | `src/lib/constants.ts` | Checkout | `/api/store/config` consumed by mobile | Checkout address | **Shared (Parity Achieved)** | Mobile keeps a compile-time fallback only for offline startup |
| Direct Debit (`direct_debit`) | Paystack Charge API | Web & API | Native in-app phone prompt + polling | Checkout submission | **Shared (Parity Achieved)** | Remains pending until provider verification or a signed webhook confirms the exact amount and currency. |
| Payment success invariant | Provider verification / signed webhook | Enforced | Enforced | Confirmation, polling, order tracking | **Shared (Parity Achieved)** | Callback arrival, charge initialization, and test mode never mark an order paid. |
| SMS & Email Purchase Receipts | `src/lib/notify.ts:notifyOrder` | Sent on payment | Sent on app order placement & MoMo approval | Order creation / payment | **Shared (Parity Achieved)** | Dispatches SMS via Vynfy & Email receipt |
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
| Product Catalog CRUD | `db.product`, `db.variant` | `/admin/products` | ProductsList & CreateProduct | Mutation | **Shared (Parity Achieved)** | Create, edit price/stock, upload images |
| Direct Camera Image Upload | Device Camera / R2 CDN | Web file picker | Native Camera + Expo ImagePicker | User action | **App-Only (Documented Exception)** | Mobile camera snap uploaded to R2 |
| Order Status Transitions | `db.order` | `/admin/orders` | Mobile orders endpoint | Mutation | **Shared (Parity Achieved)** | View orders and payment statuses |
| Custom Notifications & SMS Broadcast | `/api/app/notifications/custom` / `src/lib/sms.ts` | `CustomNotificationPanel` | `CustomNotificationModal` in Dashboard | Mutation | **Shared (Parity Achieved)** | Owner can send targeted SMS or storewide announcements |
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
| App Release Version | Published release manifest (`1.3.3`, code 15); next source `mobile/app.json` (`1.3.3`, code 15) | Web direct download | `/api/app/version` | In-app update check | **Shared (Active Synchronization)** | API advertises only verified uploaded binaries. Source version matches verified uploaded release. |
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
