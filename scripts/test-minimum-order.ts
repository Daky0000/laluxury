import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";
import { validateCartVariantQuantity } from "../src/lib/cart";
import { minimumOrderProblem } from "../src/lib/minimum-order";

async function main() {
  assert.equal(minimumOrderProblem("Chair", 1, 1), null);
  assert.equal(minimumOrderProblem("Chair", 4, 4), null);
  assert.equal(minimumOrderProblem("Chair", 5, 4), null);
  assert.match(minimumOrderProblem("Chair", 3, 4)!, /minimum of 4/);
  for (const quantity of [0, -1, 1.5, NaN, Infinity]) {
    assert.match(minimumOrderProblem("Chair", quantity, 1)!, /positive whole number/);
  }

  const token = randomUUID();
  const product = await db.product.create({
    data: {
      title: "Minimum quantity regression test", slug: `minimum-test-${token}`,
      status: "ACTIVE", minimumOrderQuantity: 4,
      variants: { create: { title: "Default", sku: `minimum-test-${token}`, price: 100,
        inventory: { create: { onHand: 6, reserved: 0, trackInventory: true } } } },
    }, include: { variants: true },
  });
  const variantId = product.variants[0].id;
  try {
    await assert.rejects(validateCartVariantQuantity(variantId, 3), /minimum of 4/);
    await validateCartVariantQuantity(variantId, 4);
    await validateCartVariantQuantity(variantId, 5);
    await assert.rejects(validateCartVariantQuantity(variantId, 7), /Only 6/);
    await db.product.update({ where: { id: product.id }, data: { minimumOrderQuantity: 5 } });
    await assert.rejects(validateCartVariantQuantity(variantId, 4), /minimum of 5/);
    await db.product.update({ where: { id: product.id }, data: { isPreorder: true } });
    await validateCartVariantQuantity(variantId, 10);
    await assert.rejects(validateCartVariantQuantity(variantId, 4), /minimum of 5/);
    await assert.rejects(db.product.update({ where: { id: product.id }, data: { minimumOrderQuantity: 0 } }));
  } finally {
    await db.product.delete({ where: { id: product.id } });
  }
  console.log("Minimum quantity rules, stock, preorders, changed minimums and database constraint passed.");
}
main().finally(() => db.$disconnect()).catch((error) => { console.error(error); process.exitCode = 1; });
