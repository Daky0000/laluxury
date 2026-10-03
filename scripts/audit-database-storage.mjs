/** Read-only volume diagnostics through Railway's private SSH connection. */
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const sql = `
SELECT current_database() AS database, pg_size_pretty(pg_database_size(current_database())) AS size;
SELECT relname, n_live_tup, n_dead_tup, pg_size_pretty(pg_total_relation_size(relid)) AS total,
 last_autovacuum, last_autoanalyze FROM pg_stat_user_tables
 ORDER BY pg_total_relation_size(relid) DESC LIMIT 20;
SELECT pg_size_pretty(COALESCE(SUM(size),0)::bigint) AS wal_size FROM pg_ls_waldir();
SELECT slot_name, active, pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(),restart_lsn)::bigint)
 AS retained_wal FROM pg_replication_slots;
SELECT name, setting, unit FROM pg_settings WHERE name IN
 ($$autovacuum$$,$$max_wal_size$$,$$min_wal_size$$,$$wal_keep_size$$,$$max_slot_wal_keep_size$$);
SELECT COUNT(*) AS expired_tokens_older_than_30_days FROM "VerificationToken"
 WHERE "expiresAt" < now() - interval $$30 days$$;
SELECT COUNT(*) AS empty_guest_carts_older_than_90_days FROM "Cart" c
 WHERE c."userId" IS NULL AND c.email IS NULL AND c."convertedOrderId" IS NULL
 AND c."lastActivityAt" < now() - interval $$90 days$$
 AND NOT EXISTS (SELECT 1 FROM "CartItem" i WHERE i."cartId"=c.id);
`;
const command = `psql -v ON_ERROR_STOP=1 -U postgres -d railway -c '${sql.replace(/\n/g, " ")}'`;
const windows = process.platform === "win32";
const args = ["ssh", "--service", "Postgres", command];
if (windows) args.unshift(join(process.env.APPDATA, "npm/node_modules/@railway/cli/bin/railway.js"));
console.log(execFileSync(windows ? process.execPath : "railway", args, { encoding: "utf8", timeout: 60000 }));
