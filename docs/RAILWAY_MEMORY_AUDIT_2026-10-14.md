# Railway memory audit: 14 October 2026

The October egress work did its job. Memory is now the bill. This audit is based on the usage screenshot for project `discerning-recreation` and on measurements of this repository running locally. Nobody had access to the Railway account during the audit, so the items under "Dashboard checks" are still open.

## What the bill says

| Item | Usage | Cost | Share |
| --- | --- | --- | --- |
| Memory | 9,070.94 GB-minutes | $2.10 | 89% |
| Egress | 2.11 GB | $0.11 | 4% |
| CPU | 155.51 vCPU-minutes | $0.07 | 3% |
| Volume | 20,432.60 GB-minutes | $0.07 | 3% |
| Backup | 832.22 GB-minutes | $0.00 | — |
| **Total** | | **$2.35** | |

- Egress was $10.61 of $19.60 last cycle. It is now $0.11, so the R2/crawler changes are working. Nothing more is needed there.
- Elapsed time: the volume line sits flat at about 3.0–3.3 GB, so 20,432.60 GB-minutes is about 6,100–7,100 minutes (4.3–4.9 days). That fits a cycle that started on 10 October.
- Average RAM is therefore about 1.3–1.5 GB, held around the clock. At $10 per GB-month, memory alone is about $13–15 a month. The project is on pace for roughly $15–17 this cycle.
- Reading the RAM chart pixel by pixel: a flat line of about 1.4 GB covers about 85% of the period. Five short blocks rise to about 4, 10.4, 5, 4.4 and 2.4 GB. About 70% of the memory cost is the flat baseline, not the spikes.
- CPU and egress step up at the same moments as the RAM spikes. Builds are free on Railway. The repository has no pull requests (so no PR environments), and nothing was pushed to `main` after 10 October 19:14 UTC. So the 11 October spikes came from work the running app did. The candidates that also send data out are photo uploads to R2 and AI vision calls, which means Bulk Product Add and media uploads.

### When saving money actually shows on the invoice

Pro costs $20 a month and **includes $20 of usage**. Only usage above $20, across the whole workspace, is charged on top. Last cycle the workspace used about $27.98, and other projects contributed about $8.38 of that. Every dollar this project saves comes off the invoice until total workspace usage falls to $20. Below that line, savings don't reduce the bill.

## What the app itself needs (measured)

The production build was run locally with the exact `railway.json` start command (`node --max-old-space-size=384 … next start`, Next 16.3.8). It was hit with storefront traffic: home, shop, product pages, the store APIs and search.

| State | Resident memory |
| --- | --- |
| Idle after boot | ~205 MB |
| After storefront traffic | ~300–350 MB |
| Processes | 1 (no child workers) |

A healthy app is about 0.35 GB, and Railway Postgres is usually 0.1–0.3 GB. Together that's about 0.5–0.65 GB, against a billed baseline of about 1.4 GB. The finding below explains much of the gap. The dashboard checks cover the rest.

## Finding 1: photo processing ratchets memory up and never gives it back (fixed)

Each phone photo is decoded by sharp/libvips, which uses 35–50 MB of native memory per image. That memory is outside the JavaScript heap, so `--max-old-space-size=384` does not limit it. With default settings, glibc gives each busy thread its own memory arena and seldom returns freed memory from them. Every bulk-add or media-upload session therefore leaves the server holding hundreds of MB it no longer uses. That memory stays until the next deploy or restart, and it is billed every minute.

Measurements replay the real `addPhotoToBatch` and `prepareAiImage` code. Two uploaders send 5 photos per request, the way the web wizard does, and four AI jobs prepare 3 images each. The photos are 12 MP, about 3.7 MB each. "Held after" is resident memory once the work has finished and garbage has been collected.

| 60 photos + 32 AI previews | Peak | Held after |
| --- | --- | --- |
| Before (current production) | 834–863 MB | **820–838 MB** |
| `MALLOC_ARENA_MAX=2` only | 490 MB | 452 MB |
| New code only | 616–639 MB | 583–616 MB |
| **New code + `MALLOC_ARENA_MAX=2`** | 429–450 MB | **403–425 MB** |

On defaults, memory keeps growing as more photos go through. Running sharp alone held 535–578 MB after 60 photos and 734 MB after 180. With the new settings it held about 255 MB after 60 and 285–352 MB after 180. These numbers come from a 4-core machine. The exact figures in production will differ, but the pattern will not.

There was a second problem. Under the old code, the bulk-add replay twice failed with `Connection terminated due to connection timeout` from Postgres. Unbounded image jobs fill Node's four worker threads, and the DNS lookup for a new database connection waits behind them. The new limit leaves those threads free, and neither failure happened with the new code.

### Changes

- `src/lib/image-processing.ts`: `withSharp()` is now the only way server code reaches sharp. It sets one libvips thread per image and turns off the libvips operation cache. It also allows at most two images in flight across the whole process, whatever mix of web uploads, app uploads and AI preparation is running. Network fetches stay outside the slot.
- `src/lib/media.ts` (all uploads: media library, bulk add, preorders, app product photos) and `src/lib/bulk-ai/image-prep.ts` (AI previews and duplicate hashes) now go through it. The output is unchanged: 2048 px WebP at quality 82, and 1280 px JPEG for the AI.
- `nixpacks.toml` sets `MALLOC_ARENA_MAX=2` in the runtime image. sharp only picks single-threaded mode by itself when this variable is unset, which is why `withSharp()` now sets it explicitly.
- `scripts/test-cost-controls.ts`, run in CI by `npm run verify:egress`, now fails if anything under `src/` imports sharp directly. It also fails if more than two images run at once or a failed image keeps its slot.

## Dashboard checks (5 minutes, needs Railway access)

These cover the part of the 1.4 GB baseline that the code can't see.

1. **Usage → View Cost by Service.** This shows whether memory is the app, Postgres, or something else. It decides which of the next steps matters.
2. **Add `MALLOC_ARENA_MAX` = `2` as a variable on the app service.** `nixpacks.toml` already sets it, but a service variable survives the move off Nixpacks (Railway support for Nixpacks ends 1 December 2026).
3. **Look for extra always-on services.** `npm run catalog:worker` and `npm run notifications:worker` are optional, and each would run 24/7 as a `tsx` process holding 150–300 MB, polling Postgres every 5 seconds. The web process already drains both queues: after each request, while the review page is open, and through `/api/cron/bulk-import` and `/api/cron/notifications`. If either worker exists as a service, replace it with a Railway cron service that runs every 5–10 minutes. Cron services are billed only while they run. The command is `curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://<site>/api/cron/notifications`. Also remove any duplicate or abandoned services (Redis, an old copy of the app).
4. **Environments dropdown.** Every environment in the project (staging, dev, an old production copy) bills its own app and Postgres. Delete any you don't use.
5. **App service → Settings → Replicas** should be 1.
6. **Postgres → Metrics.** Check memory and disk. The volume is about 3 GB, but the database was 11 MB with 32 MB of WAL on 3 October. Run `node scripts/audit-database-storage.mjs` to see table, WAL and bloat sizes before anything is resized. A large WAL or dead-tuple count after bulk imports is the usual cause. Never delete files from `pg_wal` by hand.
7. **Redeploy once** after this change ships. That clears memory the old build accumulated. From then on, bulk-add sessions should not ratchet it back up.
8. **Workspace → Usage → Set limits.** Keep the $25 email alert. A hard limit stops every service when it is reached, including checkout.

## Options left as they are, and why

- **`experimental.preloadEntriesOnStart: false`** was measured: about 25 MB less at idle and no difference once storefront pages are served. Not applied.
- **Lowering the 384 MB heap cap.** The app peaked at about 340 MB under storefront traffic. Check production memory after this deploy before tightening it, because an out-of-memory restart during checkout costs more than the RAM.
- **Serverless (app sleeping) on the production app.** It would stop billing RAM after 10 idle minutes. The cost is a cold start for the first shopper, Paystack webhook or app request after a quiet spell, and crawlers would wake it often anyway. Worth enabling on any non-production environment you keep.

## Expected effect

- The app no longer holds 400–800+ MB extra after photo sessions. Each GB not held for a month is $10.
- If the dashboard checks bring the baseline down to just the app plus Postgres (about 0.6–0.7 GB), memory falls from about $13–15 to about $6–7 a month. That is a target, not a promise. It depends on what View Cost by Service shows.
- Charges already incurred this cycle do not go down.

## Re-measuring

`npm run verify:egress` (run by CI) includes the image-memory controls. On Railway, compare the app service's memory graph for 48 hours before and after the deploy, especially across a Bulk Product Add session. Before this change, the graph would step up after the session and stay up. After it, the graph should return to roughly where it started.
