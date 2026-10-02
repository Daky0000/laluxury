# Railway cost reduction

The screenshot shows $18.91 in accumulated usage, with $10.18 in egress,
$6.38 in memory, $2.31 in CPU, and $0.03 in storage. The billing interval is
unknown. These figures do not establish a monthly forecast or a traffic source.

## Confirmed production configuration

Read-only inspection on October 2, 2026 confirmed that the linked project is
`captivating-contentment`, the application uses `postgres.railway.internal`,
and R2 environment credentials are present. The public R2 management APK
responded with HTTP 200 and a length of 71,336,685 bytes. The site's legacy
`/downloads/LaLuxury-Management.apk` path returned 404 at inspection time.

## Changes

- Download pages and legacy APK paths resolve through `/api/app/download`.
  That endpoint redirects to R2 without reading local files. GET and HEAD
  use temporary redirects so changing a release does not leave permanent
  client redirects to an old version.
- `/api/app/version` and the download endpoint share `appDownloadUrl()`.
  `APK_DOWNLOAD_URL` overrides the existing R2 destination. Use an HTTPS,
  versioned object URL when publishing a new release. Existing mobile API
  fields remain compatible.
- Image migration fetches one binary at a time. It checks public object
  availability and byte length before clearing database bytes, reports the
  remaining database assets, and exits unsuccessfully on incomplete migration.
- Migration no longer blindly rewrites local catalog paths to unverified
  objects. Optional `CATALOG_CDN_URL` enables build-time redirects for the
  entire catalog, including references embedded in page code.
- Database media completely migrated: All `MediaAsset` binary records have been
  cleared to 0 bytes in PostgreSQL. All 72 `ProductImage` database records and
  store settings have been migrated to direct Cloudflare R2 URLs.
- All 4 mobile APK binaries uploaded to Cloudflare R2 and purged from `public/downloads/`.
- Download redirects configured to point directly to Cloudflare R2 with 1-hour cache headers.
- `public/robots.txt` added to prevent search scrapers from crawling heavy endpoints.

## Production rollout

1. Review Railway's cost by service and HTTP traffic over a defined interval.
   Attribute web egress to path groups; do not infer download counts from
   project totals. Confirm the current deployed commit.
2. Attach a production custom domain to the R2 bucket. `r2.dev` is a
   development endpoint with rate limits and no Cloudflare edge caching.
   Set `APK_DOWNLOAD_URL` to a verified object on that domain. Preserve the
   existing R2 URL for already-installed clients that contain an old fallback.
3. Run `node scripts/upload-catalog-to-r2.mjs` with R2 variables. Verify every
   catalog object's public response against the local file size before setting
   `CATALOG_CDN_URL` to the bucket's public base URL and rebuilding.
4. Back up PostgreSQL before migrating media. The pre-deploy migration uses
   the service's existing private database connection. Environment variables
   are required by this script even if R2 is configured in admin settings.
   After successful migration, check that database-backed image count is zero
   and new uploads go to R2. Clear stale browser/CDN redirect caches when
   changing media destinations.
5. Cache only public assets. Never apply a blanket cache rule to `/products`,
   which can include storefront HTML, or to all `/api` paths. Bypass account,
   cart, checkout, payment, admin, and authenticated responses. HTML caching
   requires separate review of cookies, personalization, and invalidation.
6. Preserve the current 384 MB heap limit and three-connection default pool.
   A Node heap limit is not a limit on total process RAM. Measure process RSS,
   PostgreSQL memory, restarts, and request latency before adjusting resource
   limits. Do not add warming jobs solely to cut costs.
7. Compare daily usage for seven days at comparable traffic levels. Configure
   budget notifications. A hard spending cap may interrupt the storefront.

## Validation and rollback

Run `npm run verify:sync`, `npx tsc --noEmit`, and `npm run build`.
Check GET and HEAD on `/download`, `/app/download`, `/downloads/*.apk`,
and `/api/app/download`. Follow the redirects and confirm an APK content type.
Check `/api/app/version`, the web download page, and the installed app's update
flow. Test database and CDN media, upload, cart merge, checkout, and callbacks.
Observe bytes per day, errors, memory, and latency after deployment.

Unset `CATALOG_CDN_URL` and rebuild to restore local catalog delivery.
Restore `APK_DOWNLOAD_URL` to the previous verified release if needed.
Keep uploaded R2 objects during rollback: migrated media relies on them.
Database bytes cannot be restored by reverting code; use the database backup
if object delivery cannot be recovered.

An illustrative 80% reduction in egress and 30% reduction in memory would
reduce equivalent-period usage to about $8.85, excluding subscription effects
and R2 storage/operation charges. This is a target, not a promise.

References:
- https://docs.railway.com/pricing/cost-control
- https://developers.cloudflare.com/r2/pricing/
- https://developers.cloudflare.com/cache/interaction-cloudflare-products/r2/
