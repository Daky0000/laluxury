import React, { useState, useEffect } from "react";
import { StyleSheet, View, ActivityIndicator, SafeAreaView, StatusBar } from "react-native";
import { StatusBar as ExpoStatusBar } from "expo-status-bar";
import { colors } from "./src/theme/colors";
import { api } from "./src/services/api";
import { User } from "./src/types";
import { LoginScreen } from "./src/screens/LoginScreen";
import { HomeScreen } from "./src/screens/HomeScreen";
import { ProductsListScreen } from "./src/screens/ProductsListScreen";
import { ProductDetailScreen } from "./src/screens/ProductDetailScreen";
import { CreateProductScreen } from "./src/screens/CreateProductScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { BottomNav, NavTab } from "./src/components/BottomNav";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<NavTab>("HOME");
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [catalogInitialFilter, setCatalogInitialFilter] = useState<string | undefined>(undefined);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    async function checkAuth() {
      try {
        const { token, user: cachedUser } = await api.init();
        if (token && cachedUser) {
          setUser(cachedUser);
          api.getMe().then((res) => {
            setUser(res.user);
          }).catch(() => {
            api.clearSession();
            setUser(null);
          });
        }
      } catch {
        setUser(null);
      } finally {
        setInitializing(false);
      }
    }
    checkAuth();
  }, []);

  const handleLoginSuccess = (signedInUser: User) => {
    setUser(signedInUser);
    setActiveTab("HOME");
  };

  const handleLogout = async () => {
    await api.clearSession();
    setUser(null);
    setSelectedProductId(null);
  };

  const handleBrowseCatalog = () => {
    setUser({
      id: "guest",
      email: "guest@laluxury.com",
      phone: null,
      firstName: "Guest",
      lastName: "Shopper",
      role: "STAFF",
      permissions: ["products:read"],
    });
    setActiveTab("CATALOG");
  };

  if (initializing) {
    return (
      <View style={styles.splashContainer}>
        <ActivityIndicator size="large" color={colors.gold} />
      </View>
    );
  }

  // Unauthenticated: Show Login
  if (!user) {
    return (
      <SafeAreaView style={styles.container}>
        <ExpoStatusBar style="light" />
        <LoginScreen
          onLoginSuccess={handleLoginSuccess}
          onBrowseCatalog={handleBrowseCatalog}
        />
      </SafeAreaView>
    );
  }

  // Active Detail View (Takes full focus)
  if (selectedProductId) {
    return (
      <SafeAreaView style={styles.container}>
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
    <SafeAreaView style={styles.container}>
      <ExpoStatusBar style="light" />
      <View style={styles.screenContent}>
        {activeTab === "HOME" && (
          <HomeScreen
            user={user}
            onNavigateToCatalog={(filter) => {
              setCatalogInitialFilter(filter);
              setActiveTab("CATALOG");
            }}
            onNavigateToCreate={() => setActiveTab("ADD")}
            onSelectProduct={(id) => setSelectedProductId(id)}
            onLogout={handleLogout}
          />
        )}

        {activeTab === "CATALOG" && (
          <ProductsListScreen
            user={user}
            onSelectProduct={(id) => setSelectedProductId(id)}
            onCreateProduct={() => setActiveTab("ADD")}
            onLogout={handleLogout}
          />
        )}

        {activeTab === "ADD" && (
          <CreateProductScreen
            onBack={() => setActiveTab("HOME")}
            onCreated={(newId) => {
              setSelectedProductId(newId);
            }}
          />
        )}

        {activeTab === "SETTINGS" && (
          <SettingsScreen user={user} onLogout={handleLogout} />
        )}
      </View>

      {/* Persistent Bottom Nav Tab Bar */}
      <BottomNav activeTab={activeTab} onTabPress={(tab) => setActiveTab(tab)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: StatusBar.currentHeight || 0,
  },
  screenContent: {
    flex: 1,
    paddingBottom: 60, // Space for BottomNav
  },
  splashContainer: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
});
