import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

const file = process.argv[2];
if (!file) throw new Error("Usage: node scripts/analyze-railway-egress.mjs <http-logs.ndjson>");
const exact = new Map();
const grouped = new Map();
const agents = new Map();
let firstTimestamp;
let lastTimestamp;
let count = 0;
let invalid = 0;
let total = 0;
const prefixes = ["/catalog/", "/api/media/", "/downloads/", "/_next/static/", "/api/app/", "/api/store/", "/product/", "/admin/"];
for await (const line of createInterface({ input: createReadStream(file), crlfDelay: Infinity })) {
  if (!line.trim()) continue;
  let row;
  try { row = JSON.parse(line.replace(/^\uFEFF/, "")); } catch { invalid++; continue; }
  const bytes = Number(row.txBytes ?? row.attributes?.txBytes);
  if (!Number.isFinite(bytes) || bytes < 0) { invalid++; continue; }
  const path = String(row.path ?? row.attributes?.path ?? "(unknown)").split("?")[0];
  const prefix = prefixes.find((prefix) => path.startsWith(prefix));
  const group = prefix ? `${prefix}*` : path;
  const agent = String(row.clientUa ?? "(unknown)");
  if (row.timestamp) {
    const timestamp = new Date(row.timestamp).getTime();
    if (Number.isFinite(timestamp)) {
      firstTimestamp = Math.min(firstTimestamp ?? timestamp, timestamp);
      lastTimestamp = Math.max(lastTimestamp ?? timestamp, timestamp);
    }
  }
  for (const [map, key] of [[exact, path], [grouped, group], [agents, agent]]) {
    const previous = map.get(key) ?? { bytes: 0, requests: 0 };
    map.set(key, { bytes: previous.bytes + bytes, requests: previous.requests + 1 });
  }
  total += bytes;
  count++;
}
console.log(`${count} requests, ${(total / 1024 ** 3).toFixed(4)} GiB; ${invalid} invalid rows skipped.`);
console.log("This report covers only the supplied log sample, not total billed egress.");
if (firstTimestamp !== undefined) console.log(`Sample range: ${new Date(firstTimestamp).toISOString()} to ${new Date(lastTimestamp).toISOString()}`);
for (const [title, map] of [["Grouped paths", grouped], ["Exact paths", exact], ["User agents", agents]]) {
  console.log(`\n${title}`);
  for (const [path, { bytes, requests }] of [...map].sort((a, b) => b[1].bytes - a[1].bytes).slice(0, 50)) {
    console.log(`${(bytes / 1024 ** 3).toFixed(4).padStart(9)} GiB ${String(requests).padStart(7)} requests ${path}`);
  }
}
