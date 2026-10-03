/** Read-only production audit. Railway credentials never leave this process. */
import { execFileSync } from "node:child_process";
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import pg from "pg";
import { join } from "node:path";

const windows = process.platform === "win32";
const cli = windows ? process.execPath : "railway";
function variables(service) {
  const args = ["variables", "--service", service, "--json"];
  if (windows) args.unshift(join(process.env.APPDATA, "npm/node_modules/@railway/cli/bin/railway.js"));
  return JSON.parse(execFileSync(cli, args, { encoding: "utf8" }));
}
const app = variables("laluxury");
const postgres = variables("Postgres");
console.log("Application uses private database:", new URL(app.DATABASE_URL).hostname.endsWith(".railway.internal"));
console.log("Configured variable names:", Object.keys(app).sort().join(", "));
for (const name of ["R2_PUBLIC_URL", "CATALOG_CDN_URL", "NEXT_PUBLIC_MEDIA_BASE_URL", "APK_DOWNLOAD_URL"]) {
  console.log(name, app[name] || "(not configured)");
}
if (!postgres.DATABASE_PUBLIC_URL) {
  const command = `psql -U postgres -d railway -c 'SELECT source, COUNT(*) AS count, COALESCE(SUM(size) FILTER (WHERE data IS NOT NULL), 0) AS "binaryBytes" FROM "MediaAsset" GROUP BY source;'`;
  const args = ["ssh", "--service", "Postgres", command];
  if (windows) args.unshift(join(process.env.APPDATA, "npm/node_modules/@railway/cli/bin/railway.js"));
  console.log(execFileSync(cli, args, { encoding: "utf8", timeout: 30000 }));
} else {
const pool = new pg.Pool({ connectionString: postgres.DATABASE_PUBLIC_URL, max: 1, connectionTimeoutMillis: 10000 });
try {
  const { rows } = await pool.query(`SELECT source, COUNT(*)::int AS count,
    COALESCE(SUM(size) FILTER (WHERE data IS NOT NULL), 0)::text AS "binaryBytes"
    FROM "MediaAsset" GROUP BY source`);
  console.log("Media storage:", JSON.stringify(rows));
} finally { await pool.end(); }
}
const s3 = new S3Client({ region: "auto", endpoint: `https://${app.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: app.R2_ACCESS_KEY_ID, secretAccessKey: app.R2_SECRET_ACCESS_KEY } });
try {
  const result = await s3.send(new ListObjectsV2Command({ Bucket: app.R2_BUCKET_NAME, Prefix: "downloads/" }));
  console.log("Release objects:", JSON.stringify(result.Contents?.map(({ Key, Size }) => ({ key: Key, size: Size })) || []));
  for (const path of ["catalog/hero-bedroom.webp", "catalog/fluffy-carpet.webp"]) {
    const response = await fetch(`${app.R2_PUBLIC_URL}/${path}`, { method: "HEAD" });
    console.log(path, response.status, response.headers.get("content-type"), response.headers.get("content-length"));
  }
  try {
    const response = await fetch("https://media.laluxurys.com/catalog/hero-bedroom.webp", { method: "HEAD", signal: AbortSignal.timeout(10000) });
    console.log("Custom media domain:", response.status);
  } catch { console.log("Custom media domain: unreachable"); }
} finally { s3.destroy(); }
