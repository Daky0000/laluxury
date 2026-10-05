import { addLine, addLines, changeQuantity, cartSubtotal, cartItemCount, defaultVariantFor, serverCartToLocalCart } from "../state/cart";
import type { Product, ServerCartItem, Variant } from "../types";

const variant = (id: string, price: number): Variant => ({
  id,
  title: id,
  sku: id,
  price,
  compareAtPrice: null,
  costPrice: null,
  isActive: true,
});

const product = (id: string, variants?: Variant[]): Product =>
  ({
    id,
    title: `Product ${id}`,
    slug: `product-${id}`,
    status: "ACTIVE",
    minPrice: 10_000,
    maxPrice: 10_000,
    compareAtPrice: null,
    brand: null,
    material: null,
    isFeatured: false,
    isPreorder: false,
    tags: [],
    totalStock: 5,
    variantCount: variants?.length ?? 0,
    imageCount: 0,
    images: [],
    categories: [],
    collections: [],
    createdAt: "",
    updatedAt: "",
    variants,
  }) as Product;

describe("bag operations", () => {
  it("adds a new line, then increases it on a second add", () => {
    const p = product("a", [variant("a1", 5_000)]);
    const first = addLine([], p, undefined, 1).cart;
    expect(first).toHaveLength(1);
    const second = addLine(first, p, undefined, 2).cart;
    expect(second).toHaveLength(1);
    expect(second[0].quantity).toBe(3);
  });

  it("falls back to a placeholder variant when a product has none loaded", () => {
    const v = defaultVariantFor(product("b"));
    expect(v.id).toBe("b-default");
    expect(v.price).toBe(10_000);
  });

  it("bulk add skips zero quantities and merges duplicates", () => {
    const p = product("c");
    const v = variant("c1", 2_000);
    const cart = addLines([], [
      { product: p, variant: v, quantity: 2 },
      { product: p, variant: v, quantity: 0 },
      { product: p, variant: v, quantity: 1 },
    ]);
    expect(cart).toEqual([expect.objectContaining({ quantity: 3 })]);
  });

  it("removes a line when its quantity reaches zero", () => {
    const p = product("d");
    const cart = addLine([], p, variant("d1", 1_000), 1).cart;
    const { cart: after, quantity } = changeQuantity(cart, "d1", -1);
    expect(after).toHaveLength(0);
    expect(quantity).toBe(0);
  });

  it("totals subtotal and item count in minor units", () => {
    let cart = addLine([], product("e"), variant("e1", 1_250), 2).cart;
    cart = addLine(cart, product("f"), variant("f1", 500), 3).cart;
    expect(cartSubtotal(cart)).toBe(4_000);
    expect(cartItemCount(cart)).toBe(5);
  });

  it("maps server cart lines into app lines", () => {
    const items = [
      {
        quantity: 2,
        availableStock: 4,
        variant: {
          id: "v1",
          productId: "p1",
          title: "Queen",
          sku: "Q-1",
          price: 30_000,
          compareAtPrice: null,
          product: { title: "Duvet", slug: "duvet", isPreorder: false, imageUrl: "/catalog/duvet.jpg" },
        },
      },
    ] as unknown as ServerCartItem[];
    const [line] = serverCartToLocalCart(items);
    expect(line.variant.id).toBe("v1");
    expect(line.product.id).toBe("p1");
    expect(line.quantity).toBe(2);
    expect(line.product.images[0].url).toBe("/catalog/duvet.jpg");
  });
});
