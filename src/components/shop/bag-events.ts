/**
 * The mini-bag drawer lives in the shop layout, while the buttons that open it
 * are scattered across the header and every product grid. Rather than thread a
 * context through server components, they talk over one window event.
 */

export const BAG_OPEN_EVENT = "nobleenclave:bag-open";
export const CART_CHANGED_EVENT = "nobleenclave:cart-changed";
export const CART_COUNT_EVENT = "nobleenclave:cart-count";

export function notifyCartChanged(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CART_CHANGED_EVENT));
}

export function publishCartCount(count: number): void {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(CART_COUNT_EVENT, { detail: count }));
}

export function openBag(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(BAG_OPEN_EVENT));
}
