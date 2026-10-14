import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { proxy } from "../src/proxy";
import { createPublicTrafficLimiter, isBulkCrawler } from "../src/lib/public-traffic";
import { rateLimit } from "../src/lib/rate-limit";
import { MAX_IMAGES_IN_FLIGHT, withSharp } from "../src/lib/image-processing";

const limit = createPublicTrafficLimiter(2);
assert.equal(limit("one", 0, 2), true);
assert.equal(limit("one", 1, 2), true);
for (let i = 0; i < 50_000; i++) assert.equal(limit("one", 2, 2), false);
assert.equal(limit("two", 3), true);
assert.equal(limit("three", 4), false);
assert.equal(limit("three", 60_001), true);
assert.equal(isBulkCrawler("Mozilla/5.0 meta-externalagent/1.1"), true);
for (const agent of ["Googlebot", "bingbot", "facebookexternalhit", "WhatsApp", "Chrome/145"]) {
  assert.equal(isBulkCrawler(agent), false);
  assert.equal(proxy(new NextRequest("https://store.example/shop", { headers: { "user-agent": agent } })).status, 200);
}
assert.equal(proxy(new NextRequest("https://store.example/shop", { headers: { "user-agent": "GPTBot" } })).status, 403);
assert.equal(proxy(new NextRequest("https://store.example/shop", { method: "POST", headers: { "user-agent": "GPTBot" } })).status, 200);
for (let i = 0; i < 120; i++) {
  assert.equal(proxy(new NextRequest("https://store.example/shop", { headers: { "x-forwarded-for": "test-address" } })).status, 200);
}
const throttled = proxy(new NextRequest("https://store.example/shop", { headers: { "x-forwarded-for": "test-address" } }));
assert.equal(throttled.status, 429);
assert.equal(throttled.headers.get("retry-after"), "60");

const realNow = Date.now;
let now = realNow();
Date.now = () => now;
try {
  const key = `cost-control-test:${now}`;
  assert.equal(rateLimit(key, { limit: 1, windowMs: 1000 }).ok, true);
  for (let i = 0; i < 50_000; i++) assert.equal(rateLimit(key, { limit: 1, windowMs: 1000 }).ok, false);
  now += 1001;
  assert.equal(rateLimit(key, { limit: 1, windowMs: 1000 }).ok, true);
} finally { Date.now = realNow; }
// Image memory: every runtime sharp call goes through the bounded entry point.
const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? (e.name === "generated" ? [] : sourceFiles(join(dir, e.name))) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : [],
  );
const directSharp = sourceFiles("src").filter(
  (f) => !f.endsWith(join("lib", "image-processing.ts")) && /from\s+["']sharp["']|import\(\s*["']sharp["']\s*\)/.test(readFileSync(f, "utf8")),
);
assert.deepEqual(directSharp, [], "Use withSharp from src/lib/image-processing.ts instead of importing sharp directly.");

async function imageWorkIsBounded() {
  let running = 0;
  let most = 0;
  const tiny = { create: { width: 64, height: 64, channels: 3 as const, background: "#888" } };
  const jobs = Array.from({ length: 10 }, (_, i) =>
    withSharp(async (sharp) => {
      running++;
      most = Math.max(most, running);
      try {
        assert.equal(sharp.concurrency(), 1);
        assert.equal(sharp.cache().memory.max, 0);
        if (i === 3) throw new Error("decode failed");
        await new Promise((r) => setTimeout(r, 5));
        return (await sharp(tiny).jpeg().toBuffer()).length;
      } finally {
        running--;
      }
    }),
  );
  const results = await Promise.allSettled(jobs);
  assert.equal(most, MAX_IMAGES_IN_FLIGHT);
  // A failed image frees its slot; everything queued behind it still runs.
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 9);
  assert.equal(await withSharp(async () => "free"), "free");
}

imageWorkIsBounded().then(() => {
  console.log("Cost controls passed: crawler policy, shopping/preview access, bounded throttling, recovery after denied floods, bounded image memory.");
});
