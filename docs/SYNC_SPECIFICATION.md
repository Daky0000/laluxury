# LaLuxury Cross-Platform Synchronization Specification

This specification establishes permanent rules and architectural boundaries to ensure that the **LaLuxury Website** (Next.js storefront & administration console) and **LaLuxury Mobile Application** (Expo / React Native for Android & iOS) operate under **one single source of truth**, execute identical business logic, and maintain cross-platform continuity.

---

## 1. Core Principles & Permanent Sync Rules

1. **Shared Database as Authoritative Source**
   All business records—catalog items, variants, inventory, customer profiles, shipping zones & rates, promotional discounts, orders, transactions, and store configuration—reside in the shared PostgreSQL database managed via Prisma. No client (web or mobile) may invent, cache indefinitely, or compute independent business truths.

2. **Unified Business Services**
   Website Server Actions (`src/app/actions/*`) and Mobile API Route Handlers (`src/app/api/app/*`) MUST call the exact same business logic modules in `src/lib/*`:
   - Cart calculations & line item validation: `src/lib/cart.ts`
   - Order creation, totals, & deposit rules: `src/lib/orders.ts`
   - Inventory tracking & stock reservations: `src/lib/inventory.ts`
   - Shipping zone & rate computation: `src/lib/shipping.ts`
   - Discount code validation & proportional allocation: `src/lib/discounts.ts`
   - Payment provider initialization & verification: `src/lib/paystack.ts`
   - Settings & feature flags: `src/lib/settings.ts`

3. **Authoritative Server Calculation**
   Clients submit desires (line items, desired quantities, destination region/address, selected shipping rate ID, coupon code). The backend calculates authoritative totals, delivery fees, taxes, and deposit splits. The backend rejects invalid calculations or out-of-stock items. Clients must never hardcode delivery fees (e.g. GH₵ 25) or discount percentages.

4. **Cart and Customer Continuity**
   - A single customer identity exists across both web and mobile (`User` table with role `CUSTOMER`, `STAFF`, `MANAGER`, `ADMIN`, or `OWNER`).
   - Authenticated shoppers share a persistent server-side cart (`Cart` and `CartItem` tables keyed by `userId`).
   - Guest carts stored on device or in browser cookies MUST merge deterministically upon sign-in into the customer's server-side cart.
   - When a customer adds an item on the website and opens the mobile app under the same account (or vice versa), the same active bag is presented.

5. **Shared Dynamic Settings & Homepage Configuration**
   - Store settings defined in `src/lib/settings.ts` (announcements, hero headlines, promo bundles, policies, contact info, shipping thresholds, and payment modes) are exposed authoritatively to both platforms via `GET /api/app/config`.
   - The mobile storefront must dynamically consume and render these settings rather than hardcoding static promotional copy.
   - Any new setting added to the website administrative panel must declare its mobile counterpart or explicitly document why it is web-only.

6. **Version Parity & Deployment Compatibility**
   - Mobile app release metadata reported by `/api/app/version` must match the actual native binary release (`mobile/app.json` version and versionCode).
   - Backend APIs must remain backward-compatible with supported older app versions.
   - Static release timestamps must be recorded from actual build artifacts rather than generated dynamically on request.

7. **Automated Drift Prevention**
   - Continuous integration and pre-commit checks (`npm run verify:sync`) automatically detect hardcoded commerce values, outdated version identifiers, and unregistered schema drifts.

---

## 2. API Contract Standards

- **Monetary Values**: All monetary values in API requests and responses are strictly expressed as integers in **minor units (Ghana Pesewas, GHp)**. `GH₵ 150.00` = `15000`.
- **Authentication**:
  - Web: HTTP-only session cookies (`lx_session`).
  - Mobile: Bearer JWT token header (`Authorization: Bearer <token>`) signed with `AUTH_SECRET`.
  - Both resolve to the same `User` entity and enforce identical RBAC permissions.
- **Idempotency**: All payment and checkout mutation endpoints accept an `Idempotency-Key` or validate the order reference to prevent duplicate orders and double billing on network retry.
- **Cache Headers**: Dynamic configuration and cart endpoints emit `Cache-Control: no-cache, no-store, must-revalidate` to avoid stale pricing or stock numbers on mobile devices.

---

## 3. Enforcement & Maintenance

Any Pull Request or commit that introduces a new business rule, modifies checkout pricing, or adds storefront settings must update:
1. `docs/SYNC_REGISTRY.md` (registering the module classification)
2. `src/lib/*` (authoritative service)
3. Both web consumers and `/api/app/*` mobile consumers.
