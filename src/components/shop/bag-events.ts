/**
 * The mini-bag drawer lives in the shop layout, while the buttons that open it
 * are scattered across the header and every product grid. Rather than thread a
 * context through server components, they talk over one window event.
 */

export const BAG_OPEN_EVENT = "laluxury:bag-open";

export function openBag(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(BAG_OPEN_EVENT));
}
