# Railway egress hardening

## Repository implementation

Production uploads require R2 and fail before reading the file when configuration is missing. R2 upload failures cannot fall back to PostgreSQL. Existing assets remain readable during migration.

`publicAssetUrl` resolves catalog URLs directly. Catalog redirects remain compatible. Set `NEXT_PUBLIC_MEDIA_BASE_URL` before building to normalize photos used inside client components.

APK releases require `APK_DOWNLOAD_URL`. Non-HTTPS URLs, credentials in URLs, and non-APK destinations are rejected. An explicitly configured `r2.dev` URL is permitted during DNS cutover so downloads remain available without Railway binary egress; a custom media domain remains preferred for caching and production rate limits. Legacy download paths lead to the redirect endpoint; missing configuration returns 503. Version metadata uses the external release URL for both `downloadUrl` and legacy `directUrl`. The uploader requires an explicit versioned filename, streams uploads, refuses overwrites, records SHA-256 metadata, and verifies public content length.

Public `/api/store/config`, `/categories`, `/collections`, `/products`, and `/products/[id]` responses are independent of sessions. Only active products and active taxonomy are exposed. Detail accepts an ID or slug; lists are bounded to 48 products. Raw inventory, cost prices, and sales statistics are excluded. Successful responses advertise `s-maxage=300, stale-while-revalidate=3600`; errors remain uncached. Checkout validates authoritative stock, pricing, discounts, and shipping through existing services.

Mobile storefront screens use these public endpoints without bearer tokens, cookies, or `no-store`. Config uses a five-minute memory TTL; categories and collections use fifteen minutes. Cache keys include the backend URL, with capacity bounded to 64 entries. Product reads and version checks remain fresh on explicit refresh. Management APIs retain bearer authentication and `private, no-store`; legacy mixed catalog reads remain compatible with older apps.

Web catalog queries, home products/rooms, and product detail data use a five-minute Next.js data cache. Catalog writes expire the shared tag. Wishlist/own-review and header account/cart state load through separate private endpoints. Cart writes no longer invalidate the root layout. The header waits for a request before reading settings because Railway builds cannot reliably reach the private database; this avoids prerendering a fallback storefront. HTML remains dynamic and private at the origin: do not force global HTML caching. The ambiguous immutable `/products/*` rule was removed.

## Production audit: 3 October 2026

- The application uses the private Railway PostgreSQL hostname.
- `MediaAsset` contains 15 CDN records, 62 EXTERNAL records, zero binary bytes, and no DATABASE records. No binary migration is needed for this snapshot.
- R2 contains `downloads/NobelEnclave-v1.2.6.apk`, size 72,937,018 bytes.
- Configured catalog/media origins use `r2.dev`. The versioned `APK_DOWNLOAD_URL`, matching `NEXT_PUBLIC_MEDIA_BASE_URL`, and `DATABASE_POOL_MAX=3` have now been set for the next deployment.
- `media.laluxurys.com` was unreachable.
- A seven-day HTTP query capped at 5,000 requests returned only **8 minutes 16 seconds** of traffic: 0.0430 GiB. `/shop` accounts for 3,494 requests and 0.0422 GiB, mostly bulk crawlers. This is not a seven-day total.
- Billing shows approximately 212.27 GB application egress this cycle ($10.61), zero PostgreSQL egress, and $0.029 project volume usage. Database diagnostics show 11 MB database, 32 MB WAL, autovacuum enabled and no replication slots.
- Railway CDN is already enabled in Auto mode with SWR honored; no forced HTML cache or service-wide challenge is needed.

Production release/media/pool variables were configured without triggering an intermediate redeploy. A $25 compute email alert was saved. The owner explicitly retained the existing $29 workspace shutdown limit. A targeted Railway edge rule now blocks nine bulk AI/backlink crawler agents before requests reach the application. Live checks confirmed GPTBot, PerplexityBot and Meta's bulk agent receive 403, while Googlebot, social previews and mobile user agents receive 200. The edge currently renders a 594-byte denial page; the application fallback returns an 18-byte body. A portable copy of the edge rule is in `scripts/railway-edge-rules.json`. DNS, media objects and database rows have not been changed. See `RAILWAY_COST_GROWTH_RUNBOOK.md` for the complete growth-path review and conservative housekeeping procedures.

Repository checks pass: production build, web/mobile TypeScript, all 16 synchronization checks, and the egress isolation tests. Real local HTTP checks confirm legacy APK redirects are 17-byte responses and a missing release URL returns a 55-byte 503 response. Changed web modules have no lint errors. The mobile lint run reports nine errors on unchanged source lines; those pre-existing issues remain outside this change. Build-time catalog queries logged database connectivity errors in the local environment, so a successful build alone does not validate live checkout.

## Production cutover prerequisites

The Railway improvements can deploy using the verified direct R2 release URL. Complete these for the preferred custom-domain cutover:

1. Add and activate the owner's DNS zone in Cloudflare, preserving mail and Railway records, then connect `media.laluxurys.com` to the existing R2 bucket. Cloudflare currently has no domain zones in the connected account. Verify every catalog object and the versioned APK through the domain, including content type and length.
2. Set `R2_PUBLIC_URL`, `CATALOG_CDN_URL`, and `NEXT_PUBLIC_MEDIA_BASE_URL` to `https://media.laluxurys.com`. Set `APK_DOWNLOAD_URL` to the verified versioned release URL. Keep existing credentials and unrelated integrations.
3. Cache the media hostname and `/_next/static/*` in Cloudflare. Bypass private/customer/admin routes and session cookies. An explicit `/api/store/*` GET rule must take precedence over a general API bypass. Respect origin headers and never cache errors or HTML globally.
4. Enable appropriate bot/WAF controls for authentication, search, and payment verification. Preserve payment webhooks and legitimate crawlers.
5. Deploy web changes and verify uploads, redirects, private headers, active-only reads, checkout, and catalog invalidation. Build/release the updated mobile application separately. Older mobile versions retain their legacy endpoints.
6. Review the saved $25 Railway email alert and owner-retained $29 hard limit. Workspace usage was already about $27.98, so other projects and remaining compute can still reach the shutdown threshold after egress is reduced.
7. Observe comparable traffic for seven days: egress, RAM, CPU, R2 operations, HTTP errors, checkout, images, and mobile updates. Review weekly for one month.

Create and verify a PostgreSQL backup before any future binary migration. Reverting code cannot restore cleared binaries.

## Validation and monitoring

```sh
npm run verify:sync
npm run verify:egress
npx tsc --noEmit
npm run build
cd mobile
npx tsc --noEmit
```

```sh
node scripts/audit-railway-storage.mjs
railway logs --http --json --since 7d --lines 5000 > railway-http.ndjson
node scripts/analyze-railway-egress.mjs railway-http.ndjson
node scripts/upload-apk-to-r2.mjs public/downloads/NobelEnclave-v1.2.6.apk
```

The audit and analyzer are read-only. The upload command changes R2 and should run only for a new release object. Keep raw HTTP logs outside Git because they can contain customer IPs and query strings.

## Rollback

Restore the previous verified external APK URL and retain old R2 objects for installed clients. A catalog rollback requires clearing client media configuration and rebuilding; merely clearing a runtime variable cannot change compiled client values. Keep local catalog assets. Restoring cleared database binaries requires a database backup, although no rows were modified here.
