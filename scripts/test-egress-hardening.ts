import assert from "node:assert/strict";

async function main() {
  process.env.DATABASE_URL = "postgresql://unused:unused@localhost:5432/unused";
  process.env.CATALOG_CDN_URL = "https://media.example.com";
  delete process.env.NEXT_PUBLIC_MEDIA_BASE_URL;
  const { db } = await import("../src/lib/db");
  const { publicAssetUrl } = await import("../src/lib/media-url");
  const { appDownloadUrl } = await import("../src/lib/app-release");
  const { GET: list } = await import("../src/app/api/store/products/route");
  const { GET: detail } = await import("../src/app/api/store/products/[id]/route");
  const { GET: download } = await import("../src/app/api/app/download/route");
  const { GET: version } = await import("../src/app/api/app/version/route");
  const { storeUpload, UploadError } = await import("../src/lib/media");
  assert.equal(publicAssetUrl("/catalog/a.webp"), "https://media.example.com/catalog/a.webp");
  assert.equal(publicAssetUrl("https://other.example/a.webp"), "https://other.example/a.webp");
  assert.equal(publicAssetUrl("/api/media/a"), "/api/media/a");

  const fixture = {
    id: "active", title: "Product", slug: "product", status: "ACTIVE", minPrice: 100, maxPrice: 100,
    compareAtPrice: null, brand: null, material: null, isFeatured: false, isPreorder: false,
    preorderLeadTime: null, preorderDepositPercent: null, preorderNote: null,
    tags: [], createdAt: new Date(), updatedAt: new Date(),
    images: [{ id: "image", url: "/catalog/a.webp", alt: null, position: 0, optionValueId: null }],
    categories: [], collections: [],
    variants: [{ id: "variant", title: "Default", sku: "SKU", price: 100, compareAtPrice: null,
      isActive: true, optionValues: [], inventory: { onHand: 5, reserved: 5, trackInventory: true, allowBackorder: false } }],
  };
  const original = { count: db.product.count, findMany: db.product.findMany, findFirst: db.product.findFirst, setting: db.setting.findUnique };
  try {
    db.product.count = (async () => 1) as typeof db.product.count;
    db.product.findMany = (async (args: { where: { status: string }; take: number; skip: number }) => {
      assert.equal(args.where.status, "ACTIVE");
      assert.equal(args.take, 12);
      assert.equal(args.skip, 0);
      return [fixture];
    }) as unknown as typeof db.product.findMany;
    const response = await list(new Request("https://store.example/api/store/products?page=bad&limit=bad&status=DRAFT", { headers: { Authorization: "Bearer staff" } }));
    assert.match(response.headers.get("cache-control")!, /public.*s-maxage=300/);
    assert.equal(response.headers.get("set-cookie"), null);
    const payload = await response.json();
    assert.equal(payload.products[0].inStock, false);
    assert.equal(payload.products[0].variants[0].available, 0);
    assert.equal(payload.products[0].images[0].url, "https://media.example.com/catalog/a.webp");
    assert.equal(payload.products[0].variants[0].inventory, undefined);
    assert.equal(payload.products[0].variants[0].costPrice, undefined);

    db.product.findFirst = (async (args: { where: { status: string } }) => {
      assert.equal(args.where.status, "ACTIVE");
      return null;
    }) as unknown as typeof db.product.findFirst;
    const missing = await detail(new Request("https://store.example"), { params: Promise.resolve({ id: "draft" }) });
    assert.equal(missing.status, 404);
    assert.equal(missing.headers.get("cache-control"), "no-store");

    Object.assign(process.env, { NODE_ENV: "production" });
    delete process.env.APK_DOWNLOAD_URL;
    assert.throws(appDownloadUrl, /required/);
    assert.equal(download().status, 503);
    assert.equal((await version()).status, 503);
    process.env.APK_DOWNLOAD_URL = "https://pub-test.r2.dev/downloads/app-v1.apk";
    assert.equal(appDownloadUrl(), process.env.APK_DOWNLOAD_URL);
    process.env.APK_DOWNLOAD_URL = "http://media.example.com/app.apk";
    assert.throws(appDownloadUrl, /HTTPS/);
    process.env.APK_DOWNLOAD_URL = "https://media.example.com/downloads/app-v1.2.6.apk";
    assert.equal(appDownloadUrl(), process.env.APK_DOWNLOAD_URL);
    const redirect = download();
    assert.equal(redirect.status, 307);
    assert.equal(redirect.headers.get("location"), process.env.APK_DOWNLOAD_URL);
    assert.equal(await redirect.text(), "");
    const release = await (await version()).json();
    assert.equal(release.downloadUrl, process.env.APK_DOWNLOAD_URL);
    assert.equal(release.directUrl, release.downloadUrl);

    for (const key of ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_PUBLIC_URL"]) delete process.env[key];
    db.setting.findUnique = (async () => null) as typeof db.setting.findUnique;
    await assert.rejects(storeUpload(new File(["image"], "image.png", { type: "image/png" })), UploadError);
    console.log("PASS: public isolation, payload privacy, pagination, inventory, CDN URLs, APK policy, production upload guard.");
  } finally {
    Object.assign(db.product, { count: original.count, findMany: original.findMany, findFirst: original.findFirst });
    db.setting.findUnique = original.setting;
    await db.$disconnect();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
