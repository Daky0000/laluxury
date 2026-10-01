import React, { useState, useEffect } from "react";
import { StyleSheet, View, SafeAreaView, StatusBar, Alert } from "react-native";
import { StatusBar as ExpoStatusBar } from "expo-status-bar";
import { colors } from "./src/theme/colors";
import { api } from "./src/services/api";
import { User, Product, Variant, CartItem } from "./src/types";

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

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [mode, setMode] = useState<"STOREFRONT" | "BACKEND">("STOREFRONT");
  const [storefrontTab, setStorefrontTab] = useState<StorefrontTab>("HOME");
  const [backendTab, setBackendTab] = useState<BackendTab>("DASHBOARD");
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [shopFilter, setShopFilter] = useState<string | undefined>(undefined);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [confirmedOrder, setConfirmedOrder] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [notification, setNotification] = useState<PopNotificationData | null>(null);

  const notify = (data: PopNotificationData) => {
    setNotification(data);
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
    notify({
      title: "Added to Bag",
      message: `${qty}× ${product.title} added to your bag.`,
      type: "success",
      icon: "shopping-bag",
    });
  };

  const handleUpdateCartQty = (variantId: string, delta: number) => {
    const nextCart = cart
      .map((item) => {
        if (item.variant.id === variantId) {
          const newQty = item.quantity + delta;
          return newQty > 0 ? { ...item, quantity: newQty } : null;
        }
        return item;
      })
      .filter(Boolean) as CartItem[];
    updateCartState(nextCart);
  };

  const handleRemoveCartItem = (variantId: string) => {
    const itemToRemove = cart.find((i) => i.variant.id === variantId);
    const nextCart = cart.filter((item) => item.variant.id !== variantId);
    updateCartState(nextCart);
    notify({
      title: "Item Removed",
      message: itemToRemove ? `${itemToRemove.product.title} removed from bag.` : "Item removed from bag.",
      type: "info",
      icon: "trash-2",
    });
  };

  const handleClearCart = () => {
    updateCartState([]);
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

      <View style={styles.screenContent}>
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
                onOrderSuccess={(orderNum) => setConfirmedOrder(orderNum)}
                onBrowseProducts={() => setStorefrontTab("SHOP")}
                onNotify={notify}
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
        visible={Boolean(confirmedOrder)}
        orderNumber={confirmedOrder}
        onClose={() => {
          setConfirmedOrder(null);
          setStorefrontTab("HOME");
        }}
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
