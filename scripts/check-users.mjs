import dotenv from "dotenv";
dotenv.config();
import pg from "pg";
const { Client } = pg;

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    const res = await client.query('SELECT id, phone, email, "firstName", "lastName", role FROM "User";');
    console.log("Current users count:", res.rows.length);
    console.log(JSON.stringify(res.rows, null, 2));
  } catch (err) {
    console.error("Error full:", err);
  } finally {
    await client.end();
  }
}

run();
