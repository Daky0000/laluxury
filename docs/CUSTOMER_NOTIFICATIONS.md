# Customer notification foundation

## Implemented scope

Existing order/payment notices now persist an account inbox entry and channel jobs in one PostgreSQL transaction. Provider delivery runs after the request. The queue reuses SMTP, Vynfy SMS and registered Expo devices; it adds no provider or marketing campaign.

Concurrent enqueues use PostgreSQL conflict handling and a unique dedupe key. Automatic lifecycle notices deduplicate by order/event; payments also include the provider reference, and refunds use the cumulative refunded total. Explicit staff resends, receipts and custom messages are separate intentional requests.

Workers claim one job with `FOR UPDATE SKIP LOCKED`, a lock token and an attempt record. Known temporary SMTP rejection/connection failures retry with exponential backoff, up to five attempts. Accepted jobs never retry automatically. Ambiguous SMTP/SMS/push outcomes and interrupted workers become `UNKNOWN` for review. SMS nonfatal errors cannot establish nonacceptance and therefore do not retry. Completion only updates the matching claim.

The worker rechecks account activity and order state, suppressing obsolete milestones. Inbox entries remain historical records. Push acceptance means at least one device ticket was accepted; partial batches are not resent. No delivery callback integration is added.

Web `/account` includes a bell count, pagination, read controls and order links. Mobile bearer APIs use the same inbox and ownership rules; no native inbox screen is included. Customer responses exclude destinations, provider payloads and guest access tokens. Admin settings show the latest 25 channel jobs, pending/review counts and safe retry controls for missing provider configuration. Unknown outcomes cannot be replayed through these controls.

## Applicability matrix

Each row covers its named family from the conditional reference specification. Other events within each family inherit its deferred/not-applicable classification.

| Events or capability | Decision | Evidence and disposition |
| --- | --- | --- |
| Phone OTP, password reset | ALREADY IMPLEMENTED | `src/lib/sms.ts`, `src/app/actions/password-reset.ts`; existing authentication remains. |
| Welcome, verification, password/profile-change notices | OPTIONAL / DEFERRED | Account actions exist; no extra messaging workflow activated. |
| Device-risk, suspicious activity, account deletion/deactivation | NOT APPLICABLE | No dependable publisher for these milestones identified. |
| Placed, processing/fulfilled, shipped, delivered, cancelled; payment success/failure; refund and receipt | REQUIRED NOW | Existing `src/lib/orders.ts` and `src/lib/notify.ts` events now use durable jobs and inbox. Failure claiming is atomic and scoped to order/reference. |
| Remaining order/payment milestones and deadline reminders | OPTIONAL / DEFERRED | No new status transitions, schedules or provider milestones created. |
| Carrier ETA, milestones, pickup, delivery exceptions | NOT APPLICABLE | Tracking fields exist, but no carrier callback integration identified. |
| Existing manual cart recovery | REQUIRED NOW | `sendCartRecoveryNotice` checks active-account consent, suppresses converted/prior-notified carts and records provider acceptance. It remains synchronous. |
| Automated recovery, cart stock/price alerts, retry campaigns | OPTIONAL / DEFERRED | No delayed marketing jobs or campaign scheduler activated. |
| Product/wishlist offers, new arrivals, preorder alerts, recall | OPTIONAL / DEFERRED | Supporting data exists; subscription/campaign workflows are outside this foundation. |
| Returns/exchanges, support cases | NOT APPLICABLE | No structured lifecycle identified. |
| Promotions, reviews and feedback campaigns | OPTIONAL / DEFERRED | Supporting data exists; no campaign activated. |
| Loyalty, referral, gift cards | NOT APPLICABLE | No supporting models identified. |
| Platform/service/policy broadcasts | OPTIONAL / DEFERRED | Existing announcements remain; no campaign added. |
| SMTP, Vynfy, registered-device push | ALREADY IMPLEMENTED | Existing adapters reused; bounded SMTP timeouts and reduced diagnostic PII. |
| WhatsApp, browser push, extra providers | OPTIONAL / DEFERRED | No provider activation, account or new expense. |
| Inbox, shared mobile APIs | REQUIRED NOW | `src/lib/notifications/inbox.ts`, `/account`, `/api/app/notifications/*`; active authenticated account only. |
| Granular preferences, consent history, native inbox screen | OPTIONAL / DEFERRED | Existing marketing toggle remains; these need separate contracts/UI. |
| Admin templates and manual notices | ALREADY IMPLEMENTED | Existing editor/RBAC retained. Test SMS gets `[TEST]`; results distinguish queueing from acceptance. |
| Queue, deduplication, attempts, safe retries, history, retention | REQUIRED NOW | `src/lib/notifications/*`, cron endpoint and optional worker command. |
| Transactional business-event outbox, delivery receipts/failover, analytics, template versioning | OPTIONAL / DEFERRED | Notice/jobs persist atomically with each other, not with every commerce state transaction. |

## Limits and privacy

Business state and notification enqueue remain separate transactions. A crash between them can omit a notice; durability begins after enqueue succeeds. This is not exactly-once external delivery. Existing order timeline and explicit staff resends support review. State can change after the worker's check and before provider acceptance.

Recovery checks consent when the manual send begins. Guests without recorded consent are suppressed. The current model has one marketing flag, not channel-specific evidence. Manual recovery's prior-send check is not a concurrency lock. No marketing automation is introduced.

Terminal transport destinations/content are scrubbed after 30 days. Inbox entries and transport metadata expire after 180 days if no delivery is queued/sending. Existing order timeline status summaries remain under order retention. User/order deletion cascades notification rows. Retention runs on notification cron; the dedicated worker only drains jobs. Inbox bodies use concise order summaries rather than address/token-bearing email payloads.

## Rollout

1. Deploy source and run `npm run db:migrate`. The existing production start command also applies migrations. `20261009000000_customer_notifications` must run before new account/admin queries execute.
2. Keep existing verified provider credentials. Missing providers create failed configuration jobs, not simulated sends.
3. Schedule authenticated `POST /api/cron/notifications` every minute with `Authorization: Bearer <CRON_SECRET>`. It reports processed jobs and retention counts.
4. Alternatively run `npm run notifications:worker`. Use cron as well for retention. Request `after()` starts jobs promptly; an independent runner is needed for retries when no new requests arrive.
5. Review pending/failed/unknown counts in `/admin/settings/messages`. Configure a host alert for cron failure or growing backlog. No external monitoring integration was provisioned.

The migration ran only on isolated local PostgreSQL. Production migration, provider smoke tests and scheduler activation were not performed. No real customer messages were sent.

## Verification

- `npm run test:notifications`: consent/suppression, SMTP classification, bounded retries, ambiguous outcomes, stale-state suppression and safe URLs.
- `scripts/test-notifications-integration.ts`: real PostgreSQL concurrent enqueue/claim, unique jobs, attempts, retry timing, interrupted workers, fencing, pagination, ownership and retention. It refuses any URL except a local database named `noble_notifications_test` and clears that database's notification fixtures on each run.
- Optional `NOTIFICATION_TEST_BASE_URL` enables HTTP authentication, disabled-account, foreign-read, cache and cron rejection tests against an isolated local server.
- `npm run verify:sync`, `npx tsc --noEmit`, Prisma validation and changed-file ESLint.
- Browser checks used isolated fixtures: desktop/mobile account layout, mark-all-read/count update and admin history. Mobile web viewport had no horizontal overflow.

Uses existing [Nodemailer SMTP transport](https://nodemailer.com/smtp) and PostgreSQL [row locking](https://www.postgresql.org/docs/current/sql-select.html). Production state and provider accounts were not changed.
