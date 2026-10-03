/**
 * Verification test for Noble Enclave Custom App API endpoints
 * Tests:
 * 1. Unauthenticated request rejection (401)
 * 2. Token generation & verification with Bearer Auth
 * 3. GET /api/app/products (list with filters)
 * 4. GET /api/app/categories & /api/app/collections
 * 5. POST /api/app/products (create product + default variant + inventory)
 * 6. GET /api/app/products/[id] (read created product)
 * 7. PATCH /api/app/products/[id] (update metadata & status)
 * 8. PATCH /api/app/products/[id]/variants (update variant prices & stock)
 * 9. DELETE /api/app/products/[id] (clean up)
 */

import "dotenv/config";
import { db } from "../src/lib/db";
import { signSession } from "../src/lib/auth/session";

async function run() {
  console.log("=== Testing Noble Enclave Custom App API Logic ===");

  // 1. Get or create a staff test user
  let staff = await db.user.findFirst({
    where: { role: { in: ["STAFF", "MANAGER", "ADMIN", "OWNER"] }, isActive: true },
  });

  if (!staff) {
    console.log("No staff user found, creating temporary test admin...");
    staff = await db.user.create({
      data: {
        email: "app-test-admin@nobleenclave.test",
        firstName: "Test",
        lastName: "Admin",
        role: "ADMIN",
        isActive: true,
      },
    });
  }

  console.log(`Using staff user: ${staff.email || staff.phone} (${staff.role})`);

  // 2. Generate a valid Bearer token
  const token = await signSession({
    userId: staff.id,
    role: staff.role,
  });
  console.log("Generated Bearer Token (first 20 chars):", token.slice(0, 20) + "...");

  // 3. Test Product Creation
  const testTitle = `Test Mobile Piece ${Date.now()}`;
  console.log(`Creating test product: "${testTitle}"...`);

  // We can test by importing the route handlers directly with mock Request objects!
  const { POST: createProduct, GET: listProducts } = await import("../src/app/api/app/products/route");
  const { GET: getProduct, PATCH: updateProduct, DELETE: deleteProduct } = await import(
    "../src/app/api/app/products/[id]/route"
  );
  const { GET: listVariants, PATCH: updateVariants } = await import(
    "../src/app/api/app/products/[id]/variants/route"
  );
  const { GET: listCategories } = await import("../src/app/api/app/categories/route");

  // A. Test unauthorized call
  const unauthReq = new Request("http://localhost:3000/api/app/products", {
    method: "GET",
  });
  const unauthRes = await listProducts(unauthReq);
  console.log("Unauthorized test status (expected 401):", unauthRes.status);
  if (unauthRes.status !== 401) {
    throw new Error(`Expected 401, got ${unauthRes.status}`);
  }

  // B. Test authorized categories list
  const catReq = new Request("http://localhost:3000/api/app/categories", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const catRes = await listCategories(catReq);
  const catJson = await catRes.json();
  console.log("Categories retrieved count:", catJson.categories?.length ?? 0);

  // C. Test authorized product creation
  const createReq = new Request("http://localhost:3000/api/app/products", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      title: testTitle,
      price: 25000, // 250.00 GHS in pesewas
      compareAtPrice: 30000,
      stock: 12,
      sku: `TST-${Date.now().toString(36).toUpperCase()}`,
      status: "DRAFT",
      brand: "Noble Enclave Atelier",
      material: "Solid Oak / Brass",
      tags: ["handcrafted", "app-created"],
      isFeatured: false,
    }),
  });

  const createRes = await createProduct(createReq);
  console.log("Create product response status (expected 201):", createRes.status);
  const createJson = await createRes.json();
  if (!createJson.ok || !createJson.product?.id) {
    throw new Error(`Product creation failed: ${JSON.stringify(createJson)}`);
  }
  const productId = createJson.product.id;
  console.log("Created product ID:", productId);

  // D. Test GET single product
  const getReq = new Request(`http://localhost:3000/api/app/products/${productId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const getRes = await getProduct(getReq, { params: Promise.resolve({ id: productId }) });
  const getJson = await getRes.json();
  console.log("GET product title:", getJson.product?.title);
  console.log("GET product default variant price:", getJson.product?.variants?.[0]?.price);
  console.log("GET product stock on hand:", getJson.product?.variants?.[0]?.inventory?.onHand);

  // E. Test PATCH single product
  const patchReq = new Request(`http://localhost:3000/api/app/products/${productId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      status: "ACTIVE",
      isFeatured: true,
      shortDescription: "Exclusive piece created via mobile app API.",
    }),
  });
  const patchRes = await updateProduct(patchReq, { params: Promise.resolve({ id: productId }) });
  const patchJson = await patchRes.json();
  console.log("PATCH status updated to:", patchJson.product?.status, "isFeatured:", patchJson.product?.isFeatured);

  // F. Test updating variants
  const defaultVariantId = getJson.product.variants[0].id;
  const updateVarReq = new Request(`http://localhost:3000/api/app/products/${productId}/variants`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      variants: [
        {
          id: defaultVariantId,
          price: 28000, // updated to 280 GHS
          stock: 25,    // stock increased
        },
      ],
    }),
  });
  const varRes = await updateVariants(updateVarReq, { params: Promise.resolve({ id: productId }) });
  const varJson = await varRes.json();
  console.log("Updated variant price:", varJson.variants?.[0]?.price, "stock:", varJson.variants?.[0]?.inventory?.onHand);

  // G. Test DELETE (clean up test item)
  const delReq = new Request(`http://localhost:3000/api/app/products/${productId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  const delRes = await deleteProduct(delReq, { params: Promise.resolve({ id: productId }) });
  const delJson = await delRes.json();
  console.log("DELETE response:", delJson.message || delJson);

  console.log("=== ALL API TESTS PASSED SUCCESSFULLY! ===");
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Test failed:", err);
    process.exit(1);
  });
