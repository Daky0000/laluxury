import React, { useState, useEffect } from "react";
import { StyleSheet, View, SafeAreaView, StatusBar, Alert, BackHandler, ToastAndroid } from "react-native";
import { StatusBar as ExpoStatusBar } from "expo-status-bar";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "./src/theme/colors";
import { api } from "./src/services/api";
import { User, Product, Variant, CartItem, ServerCartItem } from "./src/types";

// Helper to convert server cart line items into mobile CartItem format
function serverCartToLocalCart(items: ServerCartItem[]): CartItem[] {
  return items.map((item) => ({
    product: {
      id: item.variant.productId,
      title: item.variant.product.title,
      slug: item.variant.product.slug,
      status: "ACTIVE" as const,
      minPrice: item.variant.price,
      maxPrice: item.variant.price,
      compareAtPrice: item.variant.compareAtPrice,
      brand: null,
      material: null,
      isFeatured: false,
      isPreorder: Boolean(item.variant.product.isPreorder),
      tags: [],
      totalStock: item.availableStock ?? 10,
      variantCount: 1,
      imageCount: item.variant.product.imageUrl ? 1 : 0,
      images: item.variant.product.imageUrl
        ? [{ id: "img-1", url: item.variant.product.imageUrl, alt: null, position: 0 }]
        : [],
      categories: [],
      collections: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    variant: {
      id: item.variant.id,
      title: item.variant.title,
      sku: item.variant.sku,
      price: item.variant.price,
      compareAtPrice: item.variant.compareAtPrice,
      costPrice: null,
      isActive: true,
    },
    quantity: item.quantity,
  }));
}

// Storefront Screens

import { StorefrontHomeScreen } from "./src/screens/StorefrontHomeScreen";
import { StorefrontShopScreen } from "./src/screens/StorefrontShopScreen";
import { StorefrontCartScreen } from "./src/screens/StorefrontCartScreen";
import { StorefrontProductDetailScreen } from "./src/screens/StorefrontProductDetailScreen";
import { AccountScreen } from "./src/screens/AccountScreen";

// Store Backend (Owner/Staff) Screens
import { BackendDashboardScreen } from "./src/screens/BackendDashboardScreen";
import { ProductsListScreen } from "./src/screens/ProductsListScreen";
import { ProductDetailScreen } from "./src/screens/ProductDetailScreen";
import { CreateProductScreen } from "./src/screens/CreateProductScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";

// Components
import { BottomNav, StorefrontTab, BackendTab } from "./src/components/BottomNav";
import { SplashScreen } from "./src/components/SplashScreen";
import { OrderConfirmationModal } from "./src/components/OrderConfirmationModal";
import { PopNotification, PopNotificationData } from "./src/components/PopNotification";
import { AppUpdateModal, AppUpdateInfo } from "./src/components/AppUpdateModal";
import AsyncStorage from "@react-native-async-storage/async-storage";

const CURRENT_APP_VERSION = "1.2.3";

function isNewerVersion(current: string, latest: string): boolean {
  const cParts = current.split(".").map((n) => parseInt(n, 10) || 0);
  const lParts = latest.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(cParts.length, lParts.length); i++) {
    const c = cParts[i] || 0;
    const l = lParts[i] || 0;
    if (l > c) return true;
    if (l < c) return false;
  }
  return false;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <MainApp />
    </SafeAreaProvider>
  );
}

function MainApp() {
  const insets = useSafeAreaInsets();
  const [user, setUser] = useState<User | null>(null);
  const [mode, setMode] = useState<"STOREFRONT" | "BACKEND">("STOREFRONT");
  const [storefrontTab, setStorefrontTab] = useState<StorefrontTab>("HOME");
  const [backendTab, setBackendTab] = useState<BackendTab>("DASHBOARD");
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [shopFilter, setShopFilter] = useState<string | undefined>(undefined);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [confirmedOrderNumber, setConfirmedOrderNumber] = useState<string | null>(null);
  const [confirmedOrderPhone, setConfirmedOrderPhone] = useState<string | null>(null);
  const [confirmedOrderEmail, setConfirmedOrderEmail] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [notification, setNotification] = useState<PopNotificationData | null>(null);
  const [updateInfo, setUpdateInfo] = useState<AppUpdateInfo | null>(null);
  const [showUpdateModal, setShowUpdateModal] = useState(false);

  const notify = (data: PopNotificationData) => {
    setNotification(data);
  };

  // Check for app updates on launch and prompt user
  useEffect(() => {
    async function checkAppUpdates() {
      try {
        const info = await api.checkAppVersion();
        if (info && info.latestVersion) {
          setUpdateInfo(info);
          if (isNewerVersion(CURRENT_APP_VERSION, info.latestVersion)) {
            const dismissed = await AsyncStorage.getItem("@laluxury_dismissed_update_v");
            if (dismissed !== info.latestVersion) {
              setShowUpdateModal(true);
            }
          }
        }
      } catch {
        // Non-blocking fallback when offline
      }
    }
    checkAppUpdates();
  }, []);

  const handleDismissUpdate = async () => {
    setShowUpdateModal(false);
    if (updateInfo) {
      try {
        await AsyncStorage.setItem("@laluxury_dismissed_update_v", updateInfo.latestVersion);
      } catch {
        // ignore
      }
    }
  };

  // Initialize Auth & Cart
  useEffect(() => {
    async function init() {
      try {
        const [{ token, user: cachedUser }, savedCart] = await Promise.all([
          api.init(),
          api.getSavedCart(),
        ]);

        if (savedCart && savedCart.length > 0) {
          setCart(savedCart);
        }

        if (token && cachedUser) {
          setUser(cachedUser);
          const isOwnerUser = ["OWNER", "ADMIN", "MANAGER", "STAFF"].includes(
            cachedUser.role,
          );
          if (isOwnerUser) {
            setMode("BACKEND");
            setBackendTab("DASHBOARD");
          }

          api
            .getMe()
            .then((res) => {
              setUser(res.user);
            })
            .catch(() => {
              // Retain cached session
            });

          // Server-side cart synchronization for authenticated user
          if (savedCart && savedCart.length > 0) {
            api
              .mergeGuestCartWithServer(
                savedCart.map((i) => ({ variantId: i.variant.id, quantity: i.quantity })),
              )
              .then((res) => {
                if (res.ok && res.cart?.items) {
                  const synced = serverCartToLocalCart(res.cart.items);
                  setCart(synced);
                  api.saveCart(synced);
                }
              })
              .catch(() => null);
          } else {
            api
              .getServerCart()
              .then((res) => {
                if (res.ok && res.cart?.items && res.cart.items.length > 0) {
                  const synced = serverCartToLocalCart(res.cart.items);
                  setCart(synced);
                  api.saveCart(synced);
                }
              })
              .catch(() => null);
          }
        }
      } catch {
        setUser(null);
      } finally {

        // Keep splash screen visible for a moment for smooth branded intro
        setTimeout(() => {
          setInitializing(false);
        }, 1200);
      }
    }
    init();
  }, []);

  // Handle Android Hardware Back Button navigation
  useEffect(() => {
    let lastBackPressTime = 0;

    const onHardwareBackPress = () => {
      // 1. If viewing product detail, go back to previous view
      if (selectedProductId) {
        setSelectedProductId(null);
        return true;
      }

      // 2. If order confirmation modal is open, close it
      if (confirmedOrderNumber) {
        setConfirmedOrderNumber(null);
        setConfirmedOrderPhone(null);
        setConfirmedOrderEmail(null);
        setStorefrontTab("HOME");
        return true;
      }

      // 3. Storefront mode navigation
      if (mode === "STOREFRONT") {
        if (storefrontTab !== "HOME") {
          // If on BAG, SHOP, or ACCOUNT, return to HOME
          setStorefrontTab("HOME");
          return true;
        }

        // On HOME: double-press back to exit gracefully
        const now = Date.now();
        if (now - lastBackPressTime < 2000) {
          BackHandler.exitApp();
          return false;
        }
        lastBackPressTime = now;
        if (ToastAndroid?.show) {
          ToastAndroid.show("Press back again to exit", ToastAndroid.SHORT);
        }
        return true;
      }

      // 4. Backend mode navigation
      if (mode === "BACKEND") {
        if (backendTab !== "DASHBOARD") {
          setBackendTab("DASHBOARD");
          return true;
        }

        // If on DASHBOARD, return to Storefront
        setMode("STOREFRONT");
        setStorefrontTab("HOME");
        return true;
      }

      return false;
    };

    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      onHardwareBackPress,
    );

    return () => subscription.remove();
  }, [selectedProductId, confirmedOrderNumber, mode, storefrontTab, backendTab]);

  // Sync Cart with Storage
  const updateCartState = (newCart: CartItem[]) => {
    setCart(newCart);
    api.saveCart(newCart);
  };

  // Cart operations
  const handleAddToCart = (product: Product, variant?: Variant, qty: number = 1) => {
    const activeVariant =
      variant ||
      (product.variants && product.variants.length > 0
        ? product.variants[0]
        : {
            id: `${product.id}-default`,
            title: "Default",
            sku: product.slug,
            price: product.minPrice,
            compareAtPrice: product.compareAtPrice,
            costPrice: null,
            isActive: true,
          });

    const existingIndex = cart.findIndex(
      (item) => item.variant.id === activeVariant.id,
    );

    let nextCart: CartItem[];
    if (existingIndex > -1) {
      nextCart = [...cart];
      nextCart[existingIndex] = {
        ...nextCart[existingIndex],
        quantity: nextCart[existingIndex].quantity + qty,
      };
    } else {
      nextCart = [...cart, { product, variant: activeVariant, quantity: qty }];
    }
    updateCartState(nextCart);

    if (user && !activeVariant.id.endsWith("-default")) {
      api.addToServerCart(activeVariant.id, qty).catch(() => null);
    }

    // If product had no variants in memory, resolve real variant from API to avoid -default IDs
    if (!variant && (!product.variants || product.variants.length === 0)) {
      api
        .getProduct(product.id)
        .then((res) => {
          if (res?.product?.variants && res.product.variants.length > 0) {
            const realVar = res.product.variants[0];
            setCart((curr) => {
              const updated = curr.map((c) =>
                c.variant.id === `${product.id}-default` ? { ...c, variant: realVar } : c,
              );
              api.saveCart(updated);
              return updated;
            });
            if (user) {
              api.addToServerCart(realVar.id, qty).catch(() => null);
            }
          }
        })
        .catch(() => null);
    }

    notify({
      title: "Added to Bag",
      message: `${qty}× ${product.title} added to your bag.`,
      type: "success",
      icon: "shopping-bag",
    });
  };

  const handleBulkAddToCart = (
    items: Array<{ product: Product; variant: Variant; quantity: number }>,
  ) => {
    if (!items || items.length === 0) return;
    let nextCart = [...cart];

    for (const { product, variant, quantity } of items) {
      if (quantity <= 0) continue;
      const existingIndex = nextCart.findIndex((i) => i.variant.id === variant.id);
      if (existingIndex > -1) {
        nextCart[existingIndex] = {
          ...nextCart[existingIndex],
          quantity: nextCart[existingIndex].quantity + quantity,
        };
      } else {
        nextCart.push({ product, variant, quantity });
      }

      if (user && !variant.id.endsWith("-default")) {
        api.addToServerCart(variant.id, quantity).catch(() => null);
      }
    }

    updateCartState(nextCart);

    const totalAdded = items.reduce((sum, i) => sum + i.quantity, 0);
    notify({
      title: "Bulk Added to Bag",
      message: `${totalAdded} items added to your bag.`,
      type: "success",
      icon: "shopping-bag",
    });
  };

  const handleUpdateCartQty = (variantId: string, delta: number) => {
    let nextQty = 0;
    const nextCart = cart
      .map((item) => {
        if (item.variant.id === variantId) {
          nextQty = item.quantity + delta;
          return nextQty > 0 ? { ...item, quantity: nextQty } : null;
        }
        return item;
      })
      .filter(Boolean) as CartItem[];
    updateCartState(nextCart);

    if (user) {
      api.updateServerCartItem(variantId, nextQty).catch(() => null);
    }
  };

  const handleRemoveCartItem = (variantId: string) => {
    const itemToRemove = cart.find((i) => i.variant.id === variantId);
    const nextCart = cart.filter((item) => item.variant.id !== variantId);
    updateCartState(nextCart);

    if (user) {
      api.removeServerCartItem(variantId).catch(() => null);
    }

    notify({
      title: "Item Removed",
      message: itemToRemove ? `${itemToRemove.product.title} removed from bag.` : "Item removed from bag.",
      type: "info",
      icon: "trash-2",
    });
  };

  const handleClearCart = () => {
    updateCartState([]);

    if (user) {
      api.removeServerCartItem().catch(() => null);
    }

    notify({
      title: "Bag Cleared",
      message: "All items have been removed.",
      type: "info",
      icon: "trash-2",
    });
  };

  // Auth Handling
  const handleLoginSuccess = (signedInUser: User) => {
    setUser(signedInUser);
    const isOwnerUser = ["OWNER", "ADMIN", "MANAGER", "STAFF"].includes(
      signedInUser.role,
    );

    // Merge local guest cart or pull active server cart upon login
    if (cart.length > 0) {
      api
        .mergeGuestCartWithServer(
          cart.map((i) => ({ variantId: i.variant.id, quantity: i.quantity })),
        )
        .then((res) => {
          if (res.ok && res.cart?.items) {
            const synced = serverCartToLocalCart(res.cart.items);
            setCart(synced);
            api.saveCart(synced);
          }
        })
        .catch(() => null);
    } else {
      api
        .getServerCart()
        .then((res) => {
          if (res.ok && res.cart?.items && res.cart.items.length > 0) {
            const synced = serverCartToLocalCart(res.cart.items);
            setCart(synced);
            api.saveCart(synced);
          }
        })
        .catch(() => null);
    }

    if (isOwnerUser) {
      setMode("BACKEND");
      setBackendTab("DASHBOARD");
      notify({
        title: "Store Backend Active",
        message: `Welcome ${signedInUser.firstName || "Owner"}. Catalog & orders ready.`,
        type: "success",
        icon: "shield",
      });
    } else {
      setMode("STOREFRONT");
      setStorefrontTab("ACCOUNT");
      notify({
        title: "Welcome Back",
        message: `Signed in as ${signedInUser.firstName || "Customer"}.`,
        type: "success",
        icon: "user-check",
      });
    }
  };


  const handleLogout = async () => {
    await api.clearSession();
    setUser(null);
    setSelectedProductId(null);
    setMode("STOREFRONT");
    setStorefrontTab("HOME");
    notify({
      title: "Signed Out",
      message: "You have been safely signed out.",
      type: "info",
      icon: "log-out",
    });
  };

  const isOwnerStaff =
    user && ["OWNER", "ADMIN", "MANAGER", "STAFF"].includes(user.role);

  // Splash Screen on cold start
  if (initializing) {
    return <SplashScreen />;
  }

  // Active Product Detail View in Storefront (Customer view)
  if (mode === "STOREFRONT" && selectedProductId) {
    return (
      <SafeAreaView style={styles.container}>
        <ExpoStatusBar style="dark" />
        <StorefrontProductDetailScreen
          productId={selectedProductId}
          cartCount={cart.length}
          onBack={() => setSelectedProductId(null)}
          onNavigateToBag={() => {
            setSelectedProductId(null);
            setStorefrontTab("BAG");
          }}
          onAddToCart={(product, variant, qty) => {
            handleAddToCart(product, variant, qty);
          }}
          onBulkAddToCart={(items) => {
            handleBulkAddToCart(items);
          }}
          onNotify={notify}
        />
        <PopNotification
          notification={notification}
          onDismiss={() => setNotification(null)}
        />
      </SafeAreaView>
    );
  }

  // Active Product Detail Editor in Backend (Staff/Owner editor view)
  if (mode === "BACKEND" && selectedProductId) {
    return (
      <SafeAreaView style={styles.containerDark}>
        <ExpoStatusBar style="light" />
        <ProductDetailScreen
          productId={selectedProductId}
          onBack={() => setSelectedProductId(null)}
          onDeleted={() => setSelectedProductId(null)}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={mode === "BACKEND" ? styles.containerDark : styles.container}
    >
      <ExpoStatusBar style={mode === "BACKEND" ? "light" : "dark"} />

      <View style={[styles.screenContent, { paddingBottom: 64 + Math.max(insets.bottom, 12) }]}>
        {/* ================================================================ */}
        {/* STOREFRONT MODE (E-Commerce Customer Experience)                  */}
        {/* ================================================================ */}
        {mode === "STOREFRONT" && (
          <>
            {storefrontTab === "HOME" && (
              <StorefrontHomeScreen
                user={user}
                cartCount={cart.length}
                onNavigateToShop={(filter) => {
                  setShopFilter(filter);
                  setStorefrontTab("SHOP");
                }}
                onNavigateToBag={() => setStorefrontTab("BAG")}
                onNavigateToAccount={() => setStorefrontTab("ACCOUNT")}
                onSelectProduct={(id) => setSelectedProductId(id)}
                onAddToCart={(prod) => handleAddToCart(prod)}
                onNotify={notify}
                onSwitchToBackend={
                  isOwnerStaff
                    ? () => {
                        setMode("BACKEND");
                        setBackendTab("DASHBOARD");
                        notify({
                          title: "Store Backend Active",
                          message: "Switched to owner management mode.",
                          type: "info",
                          icon: "shield",
                        });
                      }
                    : undefined
                }
              />
            )}

            {storefrontTab === "SHOP" && (
              <StorefrontShopScreen
                initialFilter={shopFilter}
                cartCount={cart.length}
                onBack={() => setStorefrontTab("HOME")}
                onNavigateToBag={() => setStorefrontTab("BAG")}
                onSelectProduct={(id) => setSelectedProductId(id)}
                onAddToCart={(prod) => handleAddToCart(prod)}
                onNotify={notify}
              />
            )}

            {storefrontTab === "BAG" && (
              <StorefrontCartScreen
                cart={cart}
                user={user}
                onBack={() => setStorefrontTab("SHOP")}
                onUpdateQuantity={handleUpdateCartQty}
                onRemoveItem={handleRemoveCartItem}
                onClearCart={handleClearCart}
                onOrderSuccess={(orderNum, phone, email) => {
                  setConfirmedOrderNumber(orderNum);
                  setConfirmedOrderPhone(phone || null);
                  setConfirmedOrderEmail(email || null);
                }}
                onBrowseProducts={() => setStorefrontTab("SHOP")}
                onNotify={notify}
                onAuthSuccess={(loggedUser) => {
                  setUser(loggedUser);
                  notify({
                    title: "Account Linked",
                    message: `Welcome ${loggedUser.firstName || "Customer"}! Account created and linked to ${loggedUser.phone || "your phone"}.`,
                    type: "success",
                    icon: "user-check",
                  });
                }}
              />
            )}

            {storefrontTab === "ACCOUNT" && (
              <AccountScreen
                user={user}
                onLoginSuccess={handleLoginSuccess}
                onLogout={handleLogout}
                onOpenBackend={() => {
                  setMode("BACKEND");
                  setBackendTab("DASHBOARD");
                  notify({
                    title: "Store Backend",
                    message: "Switched to owner management mode.",
                    type: "info",
                    icon: "shield",
                  });
                }}
              />
            )}
          </>
        )}

        {/* ================================================================ */}
        {/* STORE BACKEND MODE (Owner / Management Experience)                */}
        {/* ================================================================ */}
        {mode === "BACKEND" && user && (
          <>
            {backendTab === "DASHBOARD" && (
              <BackendDashboardScreen
                user={user}
                onNavigateToProducts={() => setBackendTab("PRODUCTS")}
                onNavigateToCreate={() => setBackendTab("ADD")}
                onSelectProduct={(id) => setSelectedProductId(id)}
                onSwitchToStorefront={() => {
                  setMode("STOREFRONT");
                  setStorefrontTab("HOME");
                  notify({
                    title: "Storefront View",
                    message: "Viewing catalog as a customer.",
                    type: "info",
                    icon: "shopping-bag",
                  });
                }}
                onLogout={handleLogout}
                onNotify={notify}
              />
            )}

            {backendTab === "PRODUCTS" && (
              <ProductsListScreen
                user={user}
                onSelectProduct={(id) => setSelectedProductId(id)}
                onCreateProduct={() => setBackendTab("ADD")}
                onLogout={handleLogout}
              />
            )}

            {backendTab === "ADD" && (
              <CreateProductScreen
                onBack={() => setBackendTab("PRODUCTS")}
                onCreated={(newId) => {
                  setSelectedProductId(newId);
                }}
              />
            )}

            {backendTab === "SETTINGS" && (
              <SettingsScreen user={user} onLogout={handleLogout} />
            )}
          </>
        )}
      </View>

      {/* Persistent Mode-Aware Bottom Nav Tab Bar */}
      <BottomNav
        mode={mode}
        activeTab={mode === "BACKEND" ? backendTab : storefrontTab}
        cartCount={cart.length}
        onTabPress={(tab) => {
          if (mode === "BACKEND") {
            setBackendTab(tab);
          } else {
            setStorefrontTab(tab);
          }
        }}
        onSwitchMode={
          isOwnerStaff
            ? () => {
                if (mode === "BACKEND") {
                  setMode("STOREFRONT");
                  setStorefrontTab("HOME");
                  notify({
                    title: "Storefront View",
                    message: "Viewing store as customer.",
                    type: "info",
                    icon: "shopping-bag",
                  });
                } else {
                  setMode("BACKEND");
                  setBackendTab("DASHBOARD");
                  notify({
                    title: "Store Backend Active",
                    message: "Management mode enabled.",
                    type: "info",
                    icon: "shield",
                  });
                }
              }
            : undefined
        }
      />

      {/* Order Confirmation Receipt Modal */}
      <OrderConfirmationModal
        visible={Boolean(confirmedOrderNumber)}
        orderNumber={confirmedOrderNumber}
        customerPhone={confirmedOrderPhone}
        customerEmail={confirmedOrderEmail}
        onClose={() => {
          setConfirmedOrderNumber(null);
          setConfirmedOrderPhone(null);
          setConfirmedOrderEmail(null);
          setStorefrontTab("HOME");
        }}
      />

      {/* In-App Update Prompt Modal */}
      <AppUpdateModal
        visible={showUpdateModal}
        updateInfo={updateInfo}
        currentVersion={CURRENT_APP_VERSION}
        onDismiss={handleDismissUpdate}
      />

      {/* Floating Pop Notifications */}
      <PopNotification
        notification={notification}
        onDismiss={() => setNotification(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: StatusBar.currentHeight || 0,
  },
  containerDark: {
    flex: 1,
    backgroundColor: colors.darkBg,
    paddingTop: StatusBar.currentHeight || 0,
  },
  screenContent: {
    flex: 1,
    paddingBottom: 64, // Space for BottomNav
  },
});
