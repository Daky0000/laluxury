<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Cross-Platform Synchronization Rules (Website & Mobile App)

This repository contains both the **Next.js Web Storefront/Backend** (`src/`) and the **React Native / Expo Mobile App** (`mobile/`).

### Permanent Architectural Rules
1. **Single Source of Truth**: All shared business data (catalog, stock, orders, settings, users, carts) lives in the PostgreSQL database via Prisma.
2. **Unified Business Services**: Never duplicate pricing, discount math, shipping calculations, or order creation logic in API routes. Always import and call the central services in `src/lib/` (`orders.ts`, `shipping.ts`, `cart.ts`, `inventory.ts`, `settings.ts`, `discounts.ts`).
3. **No Hardcoded Commerce Values**: Delivery fees, thresholds, promotional banners, or discounts must never be hardcoded in mobile screens or API routes. Mobile must query backend settings and quotation endpoints (`/api/app/config`, `/api/app/shipping/rates`).
4. **Cart and Account Continuity**: Authenticated users share one synchronized cart across web and mobile via `db.cart`. Guest mobile carts must merge on login.
5. **Contract Parity**: When updating a setting or schema, both web and `/api/app/*` contracts must be kept in sync and documented in `docs/SYNC_REGISTRY.md`.
6. **Verification**: Always run `npm run verify:sync` and `npx tsc --noEmit` before concluding work.

