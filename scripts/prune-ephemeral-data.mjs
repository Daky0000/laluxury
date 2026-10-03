/** Run inside the application service. Dry-run by default; never deletes commerce history. */
import pg from "pg";

const apply = process.argv.includes("--apply");
const batch = 500;
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required. Run inside the application service.");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 10000 });
const tokenWhere = '"expiresAt" < now() - interval \'30 days\'';
const cartWhere = `"userId" IS NULL AND email IS NULL AND "convertedOrderId" IS NULL
  AND "lastActivityAt" < now() - interval '90 days'
  AND NOT EXISTS (SELECT 1 FROM "CartItem" i WHERE i."cartId"="Cart".id)`;
try {
  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    await client.query("SET LOCAL statement_timeout = '10s'");
    for (const [table, where] of [["VerificationToken", tokenWhere], ["Cart", cartWhere]]) {
      const { rows } = await client.query(`SELECT id FROM "${table}" WHERE ${where} ORDER BY id LIMIT $1 FOR UPDATE SKIP LOCKED`, [batch]);
      console.log(`${table}: ${rows.length} eligible in this batch (${apply ? "apply" : "dry-run"}).`);
      if (apply && rows.length) {
        const result = await client.query(`DELETE FROM "${table}" WHERE id=ANY($1::text[]) AND ${where}`, [rows.map((row) => row.id)]);
        console.log(`${table}: ${result.rowCount} removed.`);
      }
    }
    await client.query(apply ? "COMMIT" : "ROLLBACK");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
} finally { await pool.end(); }
