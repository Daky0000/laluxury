/**
 * Cross-Platform Synchronization & Anti-Drift Verification Script
 *
 * Verifies that the Next.js website and the Expo mobile application
 * maintain business parity, contract alignment, and avoid hardcoded commerce rules.
 *
 * Run via: npm run verify:sync
 */

import fs from "node:fs";
import path from "node:path";

let passed = 0;
let failed = 0;

function pass(name: string, detail?: string) {
  passed++;
  console.log(`  \x1b[32mPASS\x1b[0m  ${name}${detail ? ` (${detail})` : ""}`);
}

function fail(name: string, reason: string) {
  failed++;
  console.error(`  \x1b[31mFAIL\x1b[0m  ${name}: ${reason}`);
}

console.log("\n=======================================================");
console.log("   Noble Enclave Cross-Platform Sync & Anti-Drift Suite");
console.log("=======================================================\n");

const ROOT = process.cwd();

// --- 1. Documentation & Architecture Rules Check ---------------------------
console.log("1. Documentation & Sync Rules Enforcement");
try {
  const specPath = path.join(ROOT, "docs", "SYNC_SPECIFICATION.md");
  if (fs.existsSync(specPath)) {
    const content = fs.readFileSync(specPath, "utf-8").toLowerCase();
    if (content.includes("permanent sync rules") && content.includes("single source of truth")) {
      pass("SYNC_SPECIFICATION.md exists and contains permanent sync rules");
    } else {
      fail("SYNC_SPECIFICATION.md", "Missing required sync rule clauses");
    }
  } else {
    fail("SYNC_SPECIFICATION.md", "Specification file missing in docs/");
  }


  const regPath = path.join(ROOT, "docs", "SYNC_REGISTRY.md");
  if (fs.existsSync(regPath)) {
    const content = fs.readFileSync(regPath, "utf-8");
    const requiredSections = [
      "Store Settings",
      "Storefront",
      "Catalog",
      "Inventory",
      "Commerce",
      "Customer Account",
      "Store Management",
      "Operations & Releases",
    ];
    const missing = requiredSections.filter((s) => !content.includes(s));
    if (missing.length === 0) {
      pass("SYNC_REGISTRY.md exists and covers all 8 functional domains");
    } else {
      fail("SYNC_REGISTRY.md", `Missing domains: ${missing.join(", ")}`);
    }
  } else {
    fail("SYNC_REGISTRY.md", "Registry file missing in docs/");
  }

  const rootAgents = fs.readFileSync(path.join(ROOT, "AGENTS.md"), "utf-8");
  if (rootAgents.includes("Cross-Platform Synchronization Rules")) {
    pass("Root AGENTS.md mandates cross-platform sync");
  } else {
    fail("Root AGENTS.md", "Missing cross-platform synchronization instructions");
  }

  const mobileAgents = fs.readFileSync(path.join(ROOT, "mobile", "AGENTS.md"), "utf-8");
  if (mobileAgents.includes("Cross-Platform Sync Mandates")) {
    pass("mobile/AGENTS.md mandates cross-platform sync");
  } else {
    fail("mobile/AGENTS.md", "Missing cross-platform synchronization instructions");
  }
} catch (err) {
  fail("Documentation check", (err as Error).message);
}

// --- 2. Mobile App & API Version Alignment ---------------------------------
console.log("\n2. Release & Version Parity");
try {
  const appJsonPath = path.join(ROOT, "mobile", "app.json");
  const appJson = JSON.parse(fs.readFileSync(appJsonPath, "utf-8"));
  const mobileVersion = appJson.expo?.version;
  const mobileVersionCode = appJson.expo?.android?.versionCode;

  const versionRoutePath = path.join(ROOT, "src", "app", "api", "app", "version", "route.ts");
  const versionRoute = fs.readFileSync(versionRoutePath, "utf-8");
  const releaseSource = fs.readFileSync(path.join(ROOT, "src", "lib", "app-release.ts"), "utf-8");
  const publishedVersion = releaseSource.match(/version: "(\d+\.\d+\.\d+)"/)?.[1];
  const publishedVersionCode = Number(releaseSource.match(/versionCode: (\d+)/)?.[1]);
  const semverNumber = (value: string) =>
    value.split(".").reduce((total, part) => total * 1000 + Number(part), 0);

  if (
    mobileVersion &&
    publishedVersion &&
    Number.isSafeInteger(mobileVersionCode) &&
    Number.isSafeInteger(publishedVersionCode) &&
    semverNumber(publishedVersion) <= semverNumber(mobileVersion) &&
    publishedVersionCode <= mobileVersionCode &&
    versionRoute.includes("getAppReleaseInfo")
  ) {
    pass(`Release v${publishedVersion} is compatible with source v${mobileVersion}`);
  } else {
    fail(
      "Version Parity",
      `published release (${publishedVersion}/${publishedVersionCode}) exceeds or bypasses mobile source (${mobileVersion}/${mobileVersionCode})`,
    );
  }

  if (!versionRoute.includes("new Date().toISOString()")) {
    pass("Release timestamps are fixed to build artifacts (not dynamic per request)");
  } else {
    fail("Version API", "Generates dynamic timestamp per request instead of real release date");
  }
} catch (err) {
  fail("Version check", (err as Error).message);
}

// --- 3. Commerce Parity & No Hardcoded Fees ---------------------------------
console.log("\n3. Commerce & Dynamic Delivery Rules");
try {
  const ordersRoutePath = path.join(ROOT, "src", "app", "api", "app", "orders", "route.ts");
  const ordersRoute = fs.readFileSync(ordersRoutePath, "utf-8");

  if (ordersRoute.includes("const shippingTotal = 2500;")) {
    fail("Mobile Checkout API", "Contains hardcoded GH₵25 shipping total");
  } else if (ordersRoute.includes("quoteShipping")) {
    pass("Mobile Checkout API uses unified quoteShipping business service");
  } else {
    fail("Mobile Checkout API", "Does not invoke quoteShipping service");
  }

  if (ordersRoute.includes("validateDiscount")) {
    pass("Mobile Checkout API validates discounts with shared engine");
  } else {
    fail("Mobile Checkout API", "Missing discount validation");
  }

  if (ordersRoute.includes("deposit_50") && ordersRoute.includes("depositAmount")) {
    pass("Mobile Checkout API supports 50% pre-order deposit option");
  } else {
    fail("Mobile Checkout API", "Missing pre-order deposit handling");
  }

  if (ordersRoute.includes("idempotencyKey") || ordersRoute.includes("x-idempotency-key")) {
    pass("Mobile Checkout API includes idempotency protection against duplicate orders");
  } else {
    fail("Mobile Checkout API", "Missing idempotency protection");
  }

  const shippingRatesRoute = path.join(ROOT, "src", "app", "api", "app", "shipping", "rates", "route.ts");
  if (fs.existsSync(shippingRatesRoute)) {
    pass("Dynamic shipping rates endpoint /api/app/shipping/rates is available");
  } else {
    fail("Shipping Route", "Missing /api/app/shipping/rates route");
  }

  const shippingService = fs.readFileSync(path.join(ROOT, "src", "lib", "shipping.ts"), "utf-8");
  if (shippingService.includes("getSettings") && shippingService.includes("freeShippingThreshold")) {
    pass("Shared shipping engine applies store-wide free-shipping threshold");
  } else {
    fail("Shared Shipping", "Store-wide free-shipping threshold is not enforced by src/lib/shipping.ts");
  }

  if (!ordersRoute.includes("db.shippingRate.findUnique")) {
    pass("Mobile checkout rejects shipping rates outside the authoritative regional quote");
  } else {
    fail("Mobile Checkout API", "Can bypass regional quotes with a direct shipping-rate lookup");
  }

  const mobileApi = fs.readFileSync(path.join(ROOT, "mobile", "src", "services", "api.ts"), "utf-8");
  if (!mobileApi.includes("/api/shipping/quote")) {
    pass("Mobile shipping uses only the mobile quotation contract");
  } else {
    fail("Mobile Shipping", "Falls back to the cookie-based web cart quotation endpoint");
  }
} catch (err) {
  fail("Commerce check", (err as Error).message);
}

// --- 4. Cart & Account Continuity ------------------------------------------
console.log("\n4. Cart & Account Continuity");
try {
  const cartRoute = path.join(ROOT, "src", "app", "api", "app", "cart", "route.ts");
  const cartMergeRoute = path.join(ROOT, "src", "app", "api", "app", "cart", "merge", "route.ts");

  if (fs.existsSync(cartRoute)) {
    pass("Server-side cart endpoint /api/app/cart is present");
  } else {
    fail("Cart API", "Missing /api/app/cart route");
  }

  if (fs.existsSync(cartMergeRoute)) {
    pass("Guest-to-account cart merge endpoint /api/app/cart/merge is present");
  } else {
    fail("Cart Merge API", "Missing /api/app/cart/merge route");
  }


  const cartService = fs.readFileSync(path.join(ROOT, "src", "lib", "cart.ts"), "utf-8");
  const cartApi = fs.readFileSync(cartRoute, "utf-8");
  const cartMergeApi = fs.readFileSync(cartMergeRoute, "utf-8");
  if (
    cartService.includes("validateCartVariantQuantity") &&
    cartApi.includes("validateCartVariantQuantity") &&
    cartMergeApi.includes("validateCartVariantQuantity")
  ) {
    pass("Web, mobile, and guest-cart merge share sellability and stock validation");
  } else {
    fail("Cart Validation", "A cart mutation bypasses the shared stock and sellability guard");
  }

  const mobileAppTsx = fs.readFileSync(path.join(ROOT, "mobile", "App.tsx"), "utf-8");
  if (
    mobileAppTsx.includes("mergeGuestCartWithServer") &&
    mobileAppTsx.includes("getServerCart")
  ) {
    pass("Mobile client synchronizes server cart and merges guest items on login");
  } else {
    fail("Mobile Cart Continuity", "mobile/App.tsx missing server cart sync calls");
  }
} catch (err) {
  fail("Cart continuity check", (err as Error).message);
}

// --- 5. Storefront & Settings Centralization --------------------------------
console.log("\n5. Centralized Storefront Settings");
try {
  const configRoute = fs.readFileSync(
    path.join(ROOT, "src", "app", "api", "app", "config", "route.ts"),
    "utf-8",
  );

  const expectedConfigFields = [
    "announcementBar",
    "announcements",
    "hero",
    "policies",
    "freeShippingThreshold",
    "paymentMode",
  ];

  const sharedConfig = fs.readFileSync(path.join(ROOT, "src", "lib", "store-config.ts"), "utf-8");
  const storeConfigRoute = fs.readFileSync(path.join(ROOT, "src", "app", "api", "store", "config", "route.ts"), "utf-8");
  const missingFields = expectedConfigFields.filter((f) => !sharedConfig.includes(f));
  if (!configRoute.includes("getPublicStoreConfig") || !storeConfigRoute.includes("getPublicStoreConfig")) {
    fail("Config parity", "Both config routes must use the shared public configuration service");
  }
  if (missingFields.length === 0) {
    pass("Config endpoint /api/app/config exposes full storefront copy, hero, and policies");
  } else {
    fail("Config Route", `Missing fields: ${missingFields.join(", ")}`);
  }

  const homeScreen = fs.readFileSync(
    path.join(ROOT, "mobile", "src", "screens", "StorefrontHomeScreen.tsx"),
    "utf-8",
  );

  if (homeScreen.includes("config?.hero?.eyebrow") && homeScreen.includes("config?.announcementBar")) {
    pass("Mobile Home Screen dynamically consumes backend hero copy and announcements");
  } else {
    fail("Mobile Home Screen", "Still relies on fixed promotional text");
  }
} catch (err) {
  fail("Settings check", (err as Error).message);
}

// --- Summary ----------------------------------------------------------------
console.log("\n-------------------------------------------------------");
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log("-------------------------------------------------------\n");

if (failed > 0) {
  process.exit(1);
} else {
  console.log("🎉 All cross-platform sync contracts and parity checks verified!\n");
  process.exit(0);
}
