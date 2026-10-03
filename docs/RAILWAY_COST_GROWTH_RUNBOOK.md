# Railway cost growth controls

This runbook covers the Laluxury production project. It is an operational guide, not an instruction to remove customer or accounting records. Measurements below were taken on 3 October 2026.

## Measured baseline

The billing cycle is 10 September–10 October. The project has approximately $19.60 usage: app egress 212.27 GB ($10.61), RAM $6.55, CPU $2.40, and volume $0.029. PostgreSQL public egress is zero and the app has no attached volume. Workspace usage includes other projects: approximately $27.98, with a $29 hard limit. A $25 compute email alert is enabled; the owner explicitly retained the $29 shutdown limit.

PostgreSQL's database is 11 MB; its volume uses approximately 0.237 GB including filesystem and server overhead. WAL is 32 MB, autovacuum is enabled, there are no replication slots, and no expired tokens or old empty guest carts are currently eligible for pruning. Table statistics are estimates, not exact row counts. Media auditing found no database image bytes.

A capped 5,000-request HTTP sample covers **07:24:57–07:33:13 UTC**, not seven days. It contains 0.043 GiB. GPTBot, PerplexityBot, and Meta's `meta-externalagent` dominate it. A steady sample-rate extrapolation would be speculative; compare complete daily metrics after rollout instead.

## Cost growth and controls

| Growth path | Implemented control or reduction procedure |
| --- | --- |
| Bulk AI and backlink crawling of catalog pages | A live Railway edge rule rejects nine identified bulk crawlers before they reach the application; the proxy provides a fallback. The portable rule is `scripts/railway-edge-rules.json`. Robots excludes those crawlers and query-driven shop/search URLs. Google/Bing and `facebookexternalhit`/WhatsApp previews remain allowed. `BULK_CRAWLER_BLOCK_ENABLED=false` restores application crawler access; disable the matching edge rule too. Blocking these crawlers reduces their ability to use/index the catalog. |
| Distributed traffic or spoofed crawler agents | Public catalog reads are capped at 120 requests/minute per forwarded address, per server instance; maps and counts are bounded. This is a cost guard, not a distributed firewall. Use an edge rule for observed bulk agents and edge rate limits when DNS access is available. Monitor legitimate 429 responses. |
| Large cumulative catalog responses and speculative prefetch | Shop grows only to 48 products, then uses pages. Query terms/filter values are bounded. Product tiles and catalog navigation disable speculative prefetch. |
| APK files served by the application | All legacy APK routes redirect to the configured versioned R2 object. No application binary stream or arbitrary file query. Upload script streams data, hashes the file, and rejects overwriting an existing release with different bytes. Retain older releases for installed clients; delete only explicitly retired versions. |
| Images crossing Railway on every view | Catalog URLs resolve directly to R2. Production uploads require R2; preorder reference photos use the same compressed/deduplicated pipeline. Existing media records redirect externally. Preserve legacy R2 URLs until clients stop using them. |
| Repeated catalog/API reads | Successful catalog/home/product queries cache for five minutes. Anonymous mobile reads use `/api/store/*`, with bounded config/taxonomy memory caches. Public JSON has edge-cache headers. Management/cart/account/payment data remains private and uncacheable. |
| Cart writes causing expensive storefront rerenders | Cart actions invalidate cart/checkout paths instead of the root layout. Private header state refreshes independently; drawer counts update by event. |
| Cache mistakes exposing customer data or serving stale checkout | Use CDN Auto mode, never global Force HTML caching. Honor private/no-store, Set-Cookie, authorization, and Vary. Public API caches can remain stale for their published SWR interval; stock, prices, discounts and shipping are revalidated by central checkout services. |
| Spam growing newsletter/contact/preorder/trade tables and notification costs | Public form rate limits and field length caps prevent unbounded writes. Preorders retain the existing 12/hour guard; newsletter/contact allow 6/hour, trade 3/hour per address. Limits reset on restart and are not shared across replicas. |
| Rate limiter memory growing under denied traffic | Denied attempts are not retained. Maximum 10,000 keys, long key hashing, bounded address strings, and expiry sweeps keep process memory bounded. New keys fail closed at capacity. |
| Repeated staff CSV downloads | Both export endpoints share a 12/hour/user allowance, 5,000-row and 5 MiB ceilings. Oversized exports fail explicitly instead of silently truncating. Use date-filtered order exports or a private offline job for larger datasets. Never put customer exports in the public media bucket. |
| Old tokens and abandoned empty guest carts | `scripts/prune-ephemeral-data.mjs` defaults to dry-run. It considers tokens expired for 30 days and empty anonymous carts inactive for 90 days with no email or converted order. Each serializable transaction processes at most 500 rows. Nonempty/customer-linked carts and commerce history are preserved. |
| PostgreSQL dead tuples/index bloat | Run the read-only storage audit monthly. Keep autovacuum on; investigate rising dead tuples and long transactions. Regular VACUUM allows space reuse but generally does not shrink the filesystem. Use a verified backup and maintenance window for VACUUM FULL or a restore into a new volume; the current database does not justify either. |
| Retained WAL from replication slots or failed archiving | Audit WAL and slots. Investigate growing WAL and inactive slots. Remove only a confirmed retired replication slot. Never delete files from `pg_wal` or alter live replication blindly. The current instance has no slots. |
| Audit, agent, payment payload and customer history growth | Measure largest tables/TOAST with the audit. Keep financial/order/inventory records. Define retention with the owner, archive old nonessential agent/debug records to private storage, verify restoration, then prune in batches. Avoid logging binaries/base64 or complete provider responses. No history deletion was performed. |
| Database dumps, logs or generated exports on a mounted volume | Keep the app stateless and without a volume. Write temporary files to ephemeral storage, clean on completion, and stream archives to private object storage. Keep dumps out of the PostgreSQL data directory. |
| Repeated image migration or heavy seed work on deployment | Binary migration was removed from automatic pre-deploy. Seed checks skip unchanged catalog revisions. Run migrations manually only after a verified backup and object validation. Keep demo seed flags disabled in production. |
| CPU/RAM spikes from images, queries or agents | Images stay unoptimized at request time and compress once on upload. DB pool is explicitly 3 connections; Node heap remains 384 MiB. A heap cap does not cap total RAM. Compare RSS/CPU/error rates after crawler rejection before reducing memory limits. |
| Excess replicas, preview environments or unrelated workspace services | Production app currently has one replica. Review workspace usage by project and remove only confirmed unused environments/services. Other projects contribute about $8.38 this cycle and are outside this repository's scope. |
| Idle compute, health traffic, cron and keepalive connections | After crawler rejection, evaluate Railway sleep for noncritical environments. Production sleep adds cold-start latency and may affect mobile checkout/payment hooks; do not enable without measuring. Avoid frequent DB-pinging health checks and keepalive monitors. Pool connections release after five seconds. |
| R2 storage and operation bills | Current bucket is approximately 807 MB with a seven-day multipart-abort rule already enabled. Preserve that rule, use versioned immutable keys, deduplicate media, and enable custom-domain caching once DNS is managed through Cloudflare. Do not move frequently read catalog/APK objects to infrequent-access storage without calculating retrieval/minimum-retention charges. |
| Subscription floor, backups and paid add-ons | Pro has a subscription floor even when resource usage falls. Keep backups; compare retention and duplicate backup costs. Review paid agent/API/SMS services separately. No new paid service was added and no plan was downgraded. |
| Build configuration becoming obsolete | The dashboard marks Nixpacks and Config-as-Code deprecated; existing config files are supported until 1 December 2026. Before that deadline, migrate the current commands to Railway Infrastructure-as-Code/Railpack in a preview environment, verify migrations/health/startup, then cut over. Do not wait for failed rebuild loops to reveal this dependency. |

## Weekly checks for the first month

1. Compare egress GB/day, app RAM/CPU, HTTP bytes, bot rate, and checkout errors against equivalent traffic windows. Use billed project totals for cost; HTTP samples are diagnostic only.
2. Check crawler 403s are tiny and customer/private endpoints behave normally. Inspect 429s for shared-office/mobile-carrier false positives.
3. Check cache HIT/MISS with identical URLs, then verify authenticated management and account responses remain private/no-store. Do not infer cache behavior from one response.
4. Run storage audits and record volume GB, database/table sizes, WAL, backup size, and eligible ephemeral records. Investigate growth before resizing or deleting.
5. Review the whole workspace budget: the $29 hard limit stops all resources, even if this project's egress improves. Already incurred charges do not decrease after a fix.

```powershell
node scripts/audit-railway-storage.mjs
node scripts/audit-database-storage.mjs
railway logs --service laluxury --http --json --since 24h --lines 5000 |
  Set-Content -Encoding UTF8 "$env:TEMP/laluxury-http.ndjson"
node scripts/analyze-railway-egress.mjs "$env:TEMP/laluxury-http.ndjson"
railway ssh --service laluxury "node scripts/prune-ephemeral-data.mjs"
```

The log cap can represent minutes under heavy traffic. Always read the analyzer's timestamp range. Empty input means no matched rows, not proof of zero billed egress.

## Optional housekeeping

Before applying housekeeping, create and verify a PostgreSQL backup and review the dry-run counts. Run inside the app container so `DATABASE_URL` stays private:

```powershell
railway ssh --service laluxury "node scripts/prune-ephemeral-data.mjs --apply"
```

Repeat bounded batches if needed. A serialization failure rolls the transaction back; retry after concurrent cart activity settles. Use an existing scheduler or operator session weekly rather than adding a continuously running paid service. Do not add blanket retention rules for products, orders, payments, audit logs or all guest carts.

## DNS and media CDN follow-up

Cloudflare has the R2 bucket but no domain zones in the connected account. `media.laluxurys.com` cannot be attached until the owner's DNS zone is added and active. Direct HTTPS `r2.dev` downloads still avoid Railway binary egress during this transition, but that endpoint has development rate limits and no Cloudflare cache/WAF. When DNS is ready, attach the custom domain, verify images and the APK with HEAD/GET, update public media/release variables, rebuild, and retain legacy endpoints for old clients. DNS onboarding must preserve existing mail and Railway records.

## Official references

- [Railway pricing](https://docs.railway.com/pricing): egress $0.05/GB, RAM $10/GB-month, CPU $20/vCPU-month, volume $0.15/GB-month.
- [Railway volume billing](https://docs.railway.com/volumes/reference): actual occupied storage, including filesystem metadata, determines usage.
- [Railway CDN](https://docs.railway.com/networking/cdn): cache hits avoid service compute and network egress; Auto respects origin cache policy.
- [Railway WAF](https://docs.railway.com/networking/waf): service-wide Under Attack Mode blocks non-browser traffic, so it is unsuitable as a permanent setting for this combined website/mobile API.
- [Cloudflare public R2 buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/): custom domains enable production caching; `r2.dev` is rate limited.
