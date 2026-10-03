import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { proxy } from "../src/proxy";
import { createPublicTrafficLimiter, isBulkCrawler } from "../src/lib/public-traffic";
import { rateLimit } from "../src/lib/rate-limit";

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
console.log("Cost controls passed: crawler policy, shopping/preview access, bounded throttling, recovery after denied floods.");
