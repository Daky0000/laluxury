import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import * as Notifications from "expo-notifications";
import { api } from "../services/api";
import type { CartItem, Product, ServerCartItem, User, Variant } from "../types";
import type { PopNotificationData } from "../components/PopNotification";
import { serverCartToLocalCart, addLine, addLines, changeQuantity } from "./cart";
import { detachPushDevice, registerForPush } from "../lib/push";
import { setTelemetryUser } from "../lib/telemetry";
import { track } from "../lib/analytics";
import { setToastListener } from "../lib/toast";

/**
 * App-wide state: who is signed in, the bag, saved pieces and pop-up notices.
 * Screens read it with `useApp()` instead of receiving a dozen callbacks.
 */

export const STAFF_ROLES = ["OWNER", "ADMIN", "MANAGER", "STAFF"];
export const isStaffUser = (user: User | null) => Boolean(user && STAFF_ROLES.includes(user.role));

type ConfirmedOrder = { orderNumber: string; phone: string | null; email: string | null };

type AppState = {
  ready: boolean;
  user: User | null;
  isStaff: boolean;
  setUser: (user: User | null) => void;
  cart: CartItem[];
  addToCart: (product: Product, variant?: Variant, qty?: number) => void;
  bulkAddToCart: (items: { product: Product; variant: Variant; quantity: number }[]) => void;
  updateCartQty: (variantId: string, delta: number) => void;
  removeCartItem: (variantId: string) => void;
  clearCart: (opts?: { silent?: boolean }) => void;
  wishlistIds: Set<string>;
  toggleWishlist: (productId: string) => Promise<boolean | null>;
  refreshWishlist: () => void;
  notification: PopNotificationData | null;
  notify: (data: PopNotificationData) => void;
  dismissNotification: () => void;
  confirmedOrder: ConfirmedOrder | null;
  setConfirmedOrder: (order: ConfirmedOrder | null) => void;
  signIn: (user: User) => void;
  signOut: () => Promise<void>;
};

const AppContext = createContext<AppState | null>(null);

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>.");
  return ctx;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUserState] = useState<User | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [wishlistIds, setWishlistIds] = useState<Set<string>>(new Set());
  const [notification, setNotification] = useState<PopNotificationData | null>(null);
  const [confirmedOrder, setConfirmedOrder] = useState<ConfirmedOrder | null>(null);
  const cartRef = useRef(cart);
  cartRef.current = cart;

  const setUser = useCallback((next: User | null) => {
    setUserState(next);
    setTelemetryUser(next ? { id: next.id, role: next.role } : null);
  }, []);

  const notify = useCallback((data: PopNotificationData) => {
    setNotification(data);
    // Mirror important notices into the system tray when allowed.
    Notifications.getPermissionsAsync()
      .then(({ status }) => {
        if (status !== "granted") return;
        return Notifications.scheduleNotificationAsync({
          content: { title: data.title || "Noble Enclave", body: data.message, color: "#7A2E3C" },
          trigger: null,
        });
      })
      .catch(() => {});
  }, []);

  const saveCart = useCallback((next: CartItem[]) => {
    setCart(next);
    api.saveCart(next);
  }, []);

  const applyServerCart = useCallback(
    (items: ServerCartItem[]) => saveCart(serverCartToLocalCart(items)),
    [saveCart],
  );

  const resync = useCallback(() => {
    api
      .getServerCart()
      .then((res) => applyServerCart(res.cart.items))
      .catch(() => null);
  }, [applyServerCart]);

  const refreshWishlist = useCallback(() => {
    api
      .getWishlist()
      .then((res) => setWishlistIds(new Set(res.productIds)))
      .catch(() => null);
  }, []);

  // Screens raise simple notices through toast(); show them here.
  useEffect(() => {
    setToastListener(setNotification);
    return () => setToastListener(null);
  }, []);

  // Restore session, bag and saved pieces on launch.
  useEffect(() => {
    (async () => {
      try {
        const [{ token, user: cachedUser }, savedCart] = await Promise.all([
          api.init(),
          api.getSavedCart(),
        ]);
        if (savedCart && savedCart.length > 0) setCart(savedCart);
        if (token && cachedUser) {
          setUser(cachedUser);
          api.getMe().then((res) => setUser(res.user)).catch(() => {});
          // The server bag is authoritative for a signed-in session.
          resync();
          refreshWishlist();
          registerForPush(false).catch(() => null);
        }
      } catch {
        setUser(null);
      } finally {
        setReady(true);
        track("app_open");
      }
    })();
  }, [resync, refreshWishlist, setUser]);

  const addToCart = useCallback(
    (product: Product, variant?: Variant, qty = 1) => {
      const { cart: next, variant: line } = addLine(cartRef.current, product, variant, qty);
      saveCart(next);
      track("add_to_bag", { productId: product.id, quantity: qty });

      if (user && !line.id.endsWith("-default")) {
        api.addToServerCart(line.id, qty).then((res) => applyServerCart(res.cart.items)).catch(resync);
      }

      // A product added from a list may not carry its variants yet.
      if (!variant && (!product.variants || product.variants.length === 0)) {
        api
          .getProduct(product.id)
          .then((res) => {
            const real = res?.product?.variants?.[0];
            if (!real) return;
            setCart((curr) => {
              const updated = curr.map((c) =>
                c.variant.id === `${product.id}-default` ? { ...c, variant: real } : c,
              );
              api.saveCart(updated);
              return updated;
            });
            if (user) api.addToServerCart(real.id, qty).catch(() => null);
          })
          .catch(() => null);
      }

      notify({
        title: "Added to Bag",
        message: `${qty}× ${product.title} added to your bag.`,
        type: "success",
        icon: "shopping-bag",
      });
    },
    [user, saveCart, applyServerCart, resync, notify],
  );

  const bulkAddToCart = useCallback(
    (items: { product: Product; variant: Variant; quantity: number }[]) => {
      if (!items.length) return;
      saveCart(addLines(cartRef.current, items));
      if (user) {
        Promise.all(
          items
            .filter(({ variant, quantity }) => quantity > 0 && !variant.id.endsWith("-default"))
            .map(({ variant, quantity }) => api.addToServerCart(variant.id, quantity)),
        )
          .then(resync)
          .catch(resync);
      }
      const total = items.reduce((sum, i) => sum + i.quantity, 0);
      notify({ title: "Added to Bag", message: `${total} items added to your bag.`, type: "success", icon: "shopping-bag" });
    },
    [user, saveCart, resync, notify],
  );

  const updateCartQty = useCallback(
    (variantId: string, delta: number) => {
      const { cart: next, quantity } = changeQuantity(cartRef.current, variantId, delta);
      saveCart(next);
      if (user) {
        api.updateServerCartItem(variantId, quantity).then((res) => applyServerCart(res.cart.items)).catch(resync);
      }
    },
    [user, saveCart, applyServerCart, resync],
  );

  const removeCartItem = useCallback(
    (variantId: string) => {
      const removed = cartRef.current.find((i) => i.variant.id === variantId);
      saveCart(cartRef.current.filter((i) => i.variant.id !== variantId));
      if (user) {
        api.removeServerCartItem(variantId).then((res) => applyServerCart(res.cart.items)).catch(resync);
      }
      notify({
        title: "Item Removed",
        message: removed ? `${removed.product.title} removed from bag.` : "Item removed from bag.",
        type: "info",
        icon: "trash-2",
      });
    },
    [user, saveCart, applyServerCart, resync, notify],
  );

  const clearCart = useCallback(
    (opts?: { silent?: boolean }) => {
      saveCart([]);
      api.clearLocalCart().catch(() => {});
      if (user) api.removeServerCartItem().catch(() => null);
      if (!opts?.silent) {
        notify({ title: "Bag Cleared", message: "All items have been removed.", type: "info", icon: "trash-2" });
      }
    },
    [user, saveCart, notify],
  );

  const toggleWishlist = useCallback(
    async (productId: string): Promise<boolean | null> => {
      if (!user) {
        notify({ title: "Sign in to save", message: "Create an account or sign in to keep saved pieces.", type: "info", icon: "heart" });
        return null;
      }
      // Optimistic, rolled back if the server refuses.
      const wasSaved = wishlistIds.has(productId);
      setWishlistIds((curr) => {
        const next = new Set(curr);
        if (wasSaved) next.delete(productId);
        else next.add(productId);
        return next;
      });
      try {
        const res = await api.toggleWishlist(productId);
        if (res.saved) track("wishlist_add", { productId });
        return res.saved;
      } catch (error) {
        setWishlistIds((curr) => {
          const next = new Set(curr);
          if (wasSaved) next.add(productId);
          else next.delete(productId);
          return next;
        });
        notify({ title: "Could not save", message: error instanceof Error ? error.message : "Try again.", type: "error", icon: "alert-circle" });
        return null;
      }
    },
    [user, wishlistIds, notify],
  );

  const signIn = useCallback(
    (signedIn: User) => {
      setUser(signedIn);
      const guestCart = cartRef.current;
      const merge = guestCart.length
        ? api.mergeGuestCartWithServer(guestCart.map((i) => ({ variantId: i.variant.id, quantity: i.quantity })))
        : api.getServerCart();
      merge
        .then((res) => {
          if (res.ok && res.cart?.items) applyServerCart(res.cart.items);
        })
        .catch(() => null);
      refreshWishlist();
      registerForPush(true).catch(() => null);
    },
    [setUser, applyServerCart, refreshWishlist],
  );

  const signOut = useCallback(async () => {
    await detachPushDevice();
    await api.clearSession();
    // The bag belongs to the account (kept on the server); the next person on
    // this phone starts with an empty one.
    await api.clearLocalCart();
    setCart([]);
    setWishlistIds(new Set());
    setUser(null);
    notify({ title: "Signed Out", message: "You have been safely signed out.", type: "info", icon: "log-out" });
  }, [setUser, notify]);

  const value = useMemo<AppState>(
    () => ({
      ready,
      user,
      isStaff: isStaffUser(user),
      setUser,
      cart,
      addToCart,
      bulkAddToCart,
      updateCartQty,
      removeCartItem,
      clearCart,
      wishlistIds,
      toggleWishlist,
      refreshWishlist,
      notification,
      notify,
      dismissNotification: () => setNotification(null),
      confirmedOrder,
      setConfirmedOrder,
      signIn,
      signOut,
    }),
    [ready, user, setUser, cart, addToCart, bulkAddToCart, updateCartQty, removeCartItem, clearCart, wishlistIds, toggleWishlist, refreshWishlist, notification, notify, confirmedOrder, signIn, signOut],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
