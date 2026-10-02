import "dotenv/config";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function audit() {
  try {
    console.log("=== 1. DATABASE SIZE ===");
    const dbSize = await pool.query(`SELECT pg_size_pretty(pg_database_size(current_database())) as size`);
    console.log("Database size:", dbSize.rows[0].size);

    console.log("\n=== 2. LARGEST TABLES & INDEXES ===");
    const tables = await pool.query(`
      SELECT 
        relname AS "table",
        pg_size_pretty(pg_total_relation_size(relid)) AS "total_size",
        pg_size_pretty(pg_relation_size(relid)) AS "table_size",
        pg_size_pretty(pg_indexes_size(relid)) AS "indexes_size",
        n_live_tup AS "row_count"
      FROM pg_catalog.pg_stat_user_tables
      ORDER BY pg_total_relation_size(relid) DESC
      LIMIT 10;
    `);
    console.table(tables.rows);

    console.log("\n=== 3. ACTIVE CONNECTIONS ===");
    const conns = await pool.query(`
      SELECT 
        pid,
        client_addr,
        application_name,
        state,
        age(now(), state_change) as idle_duration,
        query
      FROM pg_stat_activity 
      WHERE datname = current_database();
    `);
    console.table(conns.rows.map(r => ({
      pid: r.pid,
      app: r.application_name,
      state: r.state,
      idle: r.idle_duration,
      query: r.query?.slice(0, 40)
    })));

    console.log("\n=== 4. POSTGRES CACHE HIT RATIO ===");
    const cacheHit = await pool.query(`
      SELECT 
        sum(heap_blks_hit) / nullif(sum(heap_blks_hit) + sum(heap_blks_read), 0) * 100 AS ratio
      FROM pg_statio_user_tables;
    `);
    console.log("Cache hit ratio:", Number(cacheHit.rows[0].ratio || 0).toFixed(2) + "%");

    console.log("\n=== 5. POSTGRES MEMORY CONFIGURATION ===");
    const settings = await pool.query(`
      SELECT name, setting, unit, short_desc 
      FROM pg_settings 
      WHERE name IN ('shared_buffers', 'work_mem', 'maintenance_work_mem', 'max_connections', 'effective_cache_size');
    `);
    console.table(settings.rows);

  } catch (err) {
    console.error("Audit error:", err);
  } finally {
    await pool.end();
  }
}

audit();
