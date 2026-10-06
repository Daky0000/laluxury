import React, { useCallback } from "react";
import { BackHandler, StatusBar, StyleSheet, ToastAndroid, View } from "react-native";
import { useFocusEffect, useNavigation, type NavigationProp } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator, type BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { StatusBar as ExpoStatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../theme/colors";
import { useApp } from "../state/AppContext";
import { BottomNav } from "../components/BottomNav";
import { OfflineBanner } from "../components/OfflineBanner";
import { BiometricGate } from "../components/BiometricGate";
import type { BackendTabParamList, RootStackParamList, StorefrontTabParamList } from "./types";

import { StorefrontHomeScreen } from "../screens/StorefrontHomeScreen";
import { StorefrontShopScreen } from "../screens/StorefrontShopScreen";
import { StorefrontCartScreen } from "../screens/StorefrontCartScreen";
import { StorefrontProductDetailScreen } from "../screens/StorefrontProductDetailScreen";
import { AccountScreen } from "../screens/AccountScreen";
import { BackendDashboardScreen } from "../screens/BackendDashboardScreen";
import { ProductsListScreen } from "../screens/ProductsListScreen";
import { ProductDetailScreen } from "../screens/ProductDetailScreen";
import { CreateProductScreen } from "../screens/CreateProductScreen";
import { SettingsScreen } from "../screens/SettingsScreen";
import { StoreDesignScreen } from "../screens/StoreDesignScreen";
import { OrdersScreen } from "../screens/OrdersScreen";
import { DeliverySettingsScreen } from "../screens/DeliverySettingsScreen";
import { BulkAddScreen } from "../screens/BulkAddScreen";
import { WishlistScreen } from "../screens/WishlistScreen";
import { OrderTrackingScreen } from "../screens/OrderTrackingScreen";

const Stack = createNativeStackNavigator<RootStackParamList>();
const StoreTabs = createBottomTabNavigator<StorefrontTabParamList>();
const AdminTabs = createBottomTabNavigator<BackendTabParamList>();

type RootNav = NavigationProp<RootStackParamList>;

/** Status bar + top inset + the offline banner, themed per area. */
function Screen({
  dark,
  withTabBar,
  children,
}: {
  dark?: boolean;
  withTabBar?: boolean;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        dark ? styles.dark : styles.light,
        {
          paddingTop: Math.max(insets.top, StatusBar.currentHeight || 0),
          paddingBottom: withTabBar ? 64 + Math.max(insets.bottom, 12) : 0,
        },
      ]}
    >
      <ExpoStatusBar style={dark ? "light" : "dark"} />
      <OfflineBanner />
      {children}
    </View>
  );
}

/** Root tabs exit on a second back press instead of leaving silently. */
function useDoubleBackToExit() {
  useFocusEffect(
    useCallback(() => {
      let last = 0;
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        const now = Date.now();
        if (now - last < 2000) {
          BackHandler.exitApp();
          return true;
        }
        last = now;
        ToastAndroid?.show?.("Press back again to exit", ToastAndroid.SHORT);
        return true;
      });
      return () => sub.remove();
    }, []),
  );
}

// --- Storefront tabs ---------------------------------------------------------

function StorefrontTabBar({ state, navigation }: BottomTabBarProps) {
  const { cart, isStaff } = useApp();
  const root = useNavigation<RootNav>();
  return (
    <BottomNav
      mode="STOREFRONT"
      activeTab={state.routes[state.index].name}
      cartCount={cart.length}
      onTabPress={(tab: string) => navigation.navigate(tab)}
      onSwitchMode={isStaff ? () => root.navigate("Backend", { screen: "DASHBOARD" }) : undefined}
    />
  );
}

function HomeTab() {
  useDoubleBackToExit();
  const { user, cart, isStaff, addToCart } = useApp();
  const nav = useNavigation<RootNav>();
  return (
    <Screen withTabBar>
      <StorefrontHomeScreen
        user={user}
        cartCount={cart.length}
        onNavigateToShop={(filter) => nav.navigate("Storefront", { screen: "SHOP", params: { filter } })}
        onNavigateToBag={() => nav.navigate("Storefront", { screen: "BAG" })}
        onNavigateToAccount={() => nav.navigate("Storefront", { screen: "ACCOUNT" })}
        onSelectProduct={(id) => nav.navigate("ProductDetail", { id })}
        onAddToCart={(p) => addToCart(p)}
        onSwitchToBackend={isStaff ? () => nav.navigate("Backend", { screen: "DASHBOARD" }) : undefined}
      />
    </Screen>
  );
}

function ShopTab({ route }: { route: { params?: { filter?: string } } }) {
  const { cart, addToCart } = useApp();
  const nav = useNavigation<RootNav>();
  return (
    <Screen withTabBar>
      <StorefrontShopScreen
        key={route.params?.filter ?? "all"}
        initialFilter={route.params?.filter}
        cartCount={cart.length}
        onBack={() => nav.navigate("Storefront", { screen: "HOME" })}
        onNavigateToBag={() => nav.navigate("Storefront", { screen: "BAG" })}
        onSelectProduct={(id) => nav.navigate("ProductDetail", { id })}
        onAddToCart={(p) => addToCart(p)}
      />
    </Screen>
  );
}

function BagTab() {
  const { cart, user, updateCartQty, removeCartItem, clearCart, notify, setUser, setConfirmedOrder } = useApp();
  const nav = useNavigation<RootNav>();
  return (
    <Screen withTabBar>
      <StorefrontCartScreen
        cart={cart}
        user={user}
        onBack={() => nav.navigate("Storefront", { screen: "SHOP" })}
        onUpdateQuantity={updateCartQty}
        onRemoveItem={removeCartItem}
        onClearCart={() => clearCart()}
        onOrderSuccess={(orderNumber, phone, email) => {
          clearCart({ silent: true });
          setConfirmedOrder({ orderNumber, phone: phone || null, email: email || null });
        }}
        onBrowseProducts={() => nav.navigate("Storefront", { screen: "SHOP" })}
        onNotify={notify}
        onAuthSuccess={(loggedUser) => {
          setUser(loggedUser);
          notify({
            title: "Account Linked",
            message: `Welcome ${loggedUser.firstName || "Customer"}! Your account is ready.`,
            type: "success",
            icon: "user-check",
          });
        }}
      />
    </Screen>
  );
}

function AccountTab() {
  const { user, signIn, signOut, notify } = useApp();
  const nav = useNavigation<RootNav>();
  return (
    <Screen withTabBar>
      <AccountScreen
        user={user}
        onLoginSuccess={(signedIn) => {
          signIn(signedIn);
          if (["OWNER", "ADMIN", "MANAGER", "STAFF"].includes(signedIn.role)) {
            nav.navigate("Backend", { screen: "DASHBOARD" });
            notify({ title: "Store Backend Active", message: `Welcome ${signedIn.firstName || "Owner"}.`, type: "success", icon: "shield" });
          } else {
            notify({ title: "Welcome Back", message: `Signed in as ${signedIn.firstName || "Customer"}.`, type: "success", icon: "user-check" });
          }
        }}
        onLogout={signOut}
        onOpenBackend={() => nav.navigate("Backend", { screen: "DASHBOARD" })}
        onOpenWishlist={() => nav.navigate("Wishlist")}
        onTrackOrder={(order) => nav.navigate("OrderTracking", { order })}
      />
    </Screen>
  );
}

function StorefrontNavigator() {
  return (
    <StoreTabs.Navigator screenOptions={{ headerShown: false }} tabBar={(props) => <StorefrontTabBar {...props} />}>
      <StoreTabs.Screen name="HOME" component={HomeTab} />
      <StoreTabs.Screen name="SHOP" component={ShopTab} />
      <StoreTabs.Screen name="BAG" component={BagTab} />
      <StoreTabs.Screen name="ACCOUNT" component={AccountTab} />
    </StoreTabs.Navigator>
  );
}

// --- Backend tabs ------------------------------------------------------------

function BackendTabBar({ state, navigation }: BottomTabBarProps) {
  const { cart } = useApp();
  const root = useNavigation<RootNav>();
  return (
    <BottomNav
      mode="BACKEND"
      activeTab={state.routes[state.index].name}
      cartCount={cart.length}
      onTabPress={(tab: string) => navigation.navigate(tab)}
      onSwitchMode={() => root.navigate("Storefront", { screen: "HOME" })}
    />
  );
}

function DashboardTab() {
  useDoubleBackToExit();
  const { user, notify, signOut } = useApp();
  const nav = useNavigation<RootNav>();
  if (!user) return null;
  return (
    <Screen dark withTabBar>
      <BackendDashboardScreen
        user={user}
        onNavigateToProducts={() => nav.navigate("Backend", { screen: "PRODUCTS" })}
        onNavigateToCreate={() => nav.navigate("Backend", { screen: "ADD" })}
        onNavigateToOrders={() => nav.navigate("Backend", { screen: "ORDERS" })}
        onNavigateToDeliverySettings={() => nav.navigate("DeliverySettings")}
        onNavigateToBulkAdd={["OWNER", "ADMIN"].includes(user.role) ? () => nav.navigate("BulkAdd") : undefined}
        onNavigateToStoreDesign={() => nav.navigate("StoreDesign")}
        onSelectProduct={(id) => nav.navigate("BackendProduct", { id })}
        onSwitchToStorefront={() => nav.navigate("Storefront", { screen: "HOME" })}
        onLogout={async () => {
          await signOut();
          nav.reset({ index: 0, routes: [{ name: "Storefront" }] });
        }}
        onNotify={notify}
      />
    </Screen>
  );
}

function OrdersTab() {
  const { user, notify } = useApp();
  if (!user) return null;
  return (
    <Screen dark withTabBar>
      <OrdersScreen user={user} onNotify={notify} />
    </Screen>
  );
}

function ProductsTab() {
  const { user, signOut } = useApp();
  const nav = useNavigation<RootNav>();
  if (!user) return null;
  return (
    <Screen dark withTabBar>
      <ProductsListScreen
        user={user}
        onSelectProduct={(id) => nav.navigate("BackendProduct", { id })}
        onCreateProduct={() => nav.navigate("Backend", { screen: "ADD" })}
        onLogout={async () => {
          await signOut();
          nav.reset({ index: 0, routes: [{ name: "Storefront" }] });
        }}
      />
    </Screen>
  );
}

function AddTab() {
  const { user } = useApp();
  const nav = useNavigation<RootNav>();
  return (
    <Screen dark withTabBar>
      <CreateProductScreen
        onBulkAdd={user && ["OWNER", "ADMIN"].includes(user.role) ? () => nav.navigate("BulkAdd") : undefined}
        onBack={() => nav.navigate("Backend", { screen: "PRODUCTS" })}
        onCreated={(id) => nav.navigate("BackendProduct", { id })}
      />
    </Screen>
  );
}

function SettingsTab() {
  const { user, signOut } = useApp();
  const nav = useNavigation<RootNav>();
  if (!user) return null;
  return (
    <Screen dark withTabBar>
      <SettingsScreen
        user={user}
        onLogout={async () => {
          await signOut();
          nav.reset({ index: 0, routes: [{ name: "Storefront" }] });
        }}
        onNavigateToDeliverySettings={() => nav.navigate("DeliverySettings")}
      />
    </Screen>
  );
}

function BackendNavigator() {
  return (
    <BiometricGate>
      <AdminTabs.Navigator screenOptions={{ headerShown: false }} tabBar={(props) => <BackendTabBar {...props} />}>
        <AdminTabs.Screen name="DASHBOARD" component={DashboardTab} />
        <AdminTabs.Screen name="ORDERS" component={OrdersTab} />
        <AdminTabs.Screen name="PRODUCTS" component={ProductsTab} />
        <AdminTabs.Screen name="ADD" component={AddTab} />
        <AdminTabs.Screen name="SETTINGS" component={SettingsTab} />
      </AdminTabs.Navigator>
    </BiometricGate>
  );
}

// --- Stack screens -----------------------------------------------------------

function ProductDetailRoute({ route }: { route: { params: { id: string } } }) {
  const { cart, addToCart, bulkAddToCart, notify } = useApp();
  const nav = useNavigation<RootNav>();
  return (
    <Screen>
      <StorefrontProductDetailScreen
        productId={route.params.id}
        cartCount={cart.length}
        onBack={() => (nav.canGoBack() ? nav.goBack() : nav.navigate("Storefront", { screen: "HOME" }))}
        onNavigateToBag={() => nav.navigate("Storefront", { screen: "BAG" })}
        onSelectProduct={(id) => nav.navigate("ProductDetail", { id })}
        onAddToCart={(p, v, q) => addToCart(p, v, q)}
        onBulkAddToCart={bulkAddToCart}
        onNotify={notify}
      />
    </Screen>
  );
}

function BackendProductRoute({ route }: { route: { params: { id: string } } }) {
  const nav = useNavigation<RootNav>();
  return (
    <Screen dark>
      <ProductDetailScreen productId={route.params.id} onBack={() => nav.goBack()} onDeleted={() => nav.goBack()} />
    </Screen>
  );
}

function StoreDesignRoute() {
  const { user, notify } = useApp();
  const nav = useNavigation<RootNav>();
  if (!user) return null;
  return (
    <Screen dark>
      <StoreDesignScreen user={user} onBack={() => nav.goBack()} onNotify={notify} />
    </Screen>
  );
}

function BulkAddRoute() {
  const nav = useNavigation<RootNav>();
  return (
    <Screen dark>
      <BulkAddScreen onBack={() => nav.goBack()} onOpenProduct={(id) => nav.navigate("BackendProduct", { id })} />
    </Screen>
  );
}

function DeliverySettingsRoute() {
  const { notify } = useApp();
  const nav = useNavigation<RootNav>();
  return (
    <Screen dark>
      <DeliverySettingsScreen onBack={() => nav.goBack()} onNotify={notify} />
    </Screen>
  );
}

function WishlistRoute() {
  const nav = useNavigation<RootNav>();
  return (
    <Screen>
      <WishlistScreen
        onBack={() => (nav.canGoBack() ? nav.goBack() : nav.navigate("Storefront", { screen: "ACCOUNT" }))}
        onSelectProduct={(id) => nav.navigate("ProductDetail", { id })}
      />
    </Screen>
  );
}

function OrderTrackingRoute({ route }: { route: { params: { order: string; t?: string; email?: string } } }) {
  const nav = useNavigation<RootNav>();
  return (
    <Screen>
      <OrderTrackingScreen
        orderNumber={route.params.order}
        accessToken={route.params.t}
        onBack={() => (nav.canGoBack() ? nav.goBack() : nav.navigate("Storefront", { screen: "ACCOUNT" }))}
      />
    </Screen>
  );
}

export function RootNavigator() {
  const { isStaff } = useApp();
  return (
    <Stack.Navigator
      initialRouteName={isStaff ? "Backend" : "Storefront"}
      screenOptions={{ headerShown: false, animation: "slide_from_right" }}
    >
      <Stack.Screen name="Storefront" component={StorefrontNavigator} options={{ animation: "fade" }} />
      <Stack.Screen name="Backend" component={BackendNavigator} options={{ animation: "fade" }} />
      <Stack.Screen name="ProductDetail" component={ProductDetailRoute} />
      <Stack.Screen name="BackendProduct" component={BackendProductRoute} />
      <Stack.Screen name="StoreDesign" component={StoreDesignRoute} />
      <Stack.Screen name="DeliverySettings" component={DeliverySettingsRoute} />
      <Stack.Screen name="BulkAdd" component={BulkAddRoute} />
      <Stack.Screen name="Wishlist" component={WishlistRoute} />
      <Stack.Screen name="OrderTracking" component={OrderTrackingRoute} />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  light: { flex: 1, backgroundColor: colors.background },
  dark: { flex: 1, backgroundColor: colors.darkBg },
});
