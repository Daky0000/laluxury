import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../theme/colors";

export type StorefrontTab = "HOME" | "SHOP" | "BAG" | "ACCOUNT";
export type BackendTab = "DASHBOARD" | "PRODUCTS" | "ADD" | "SETTINGS";

type Props = {
  mode: "STOREFRONT" | "BACKEND";
  activeTab: string;
  cartCount: number;
  onTabPress: (tab: any) => void;
  onSwitchMode?: () => void;
};

export function BottomNav({
  mode,
  activeTab,
  cartCount,
  onTabPress,
  onSwitchMode,
}: Props) {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, 12);

  if (mode === "BACKEND") {
    const backendTabs = [
      { key: "DASHBOARD" as BackendTab, label: "Dashboard", icon: "bar-chart-2" as const },
      { key: "PRODUCTS" as BackendTab, label: "Products", icon: "box" as const },
      { key: "ADD" as BackendTab, label: "Add Piece", icon: "plus-circle" as const },
      { key: "SETTINGS" as BackendTab, label: "Settings", icon: "sliders" as const },
    ];

    return (
      <View style={[styles.backendContainer, { paddingBottom: bottomInset }]}>
        {backendTabs.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={styles.tabBtn}
              onPress={() => onTabPress(tab.key)}
              activeOpacity={0.7}
            >
              <Feather
                name={tab.icon}
                size={20}
                color={isActive ? colors.gold : "#8E9889"}
              />
              <Text style={[styles.tabLabel, isActive && styles.tabLabelActiveBackend]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}

        {/* Quick button to jump back to customer storefront */}
        {onSwitchMode && (
          <TouchableOpacity
            style={styles.switchModeBtn}
            onPress={onSwitchMode}
            activeOpacity={0.7}
          >
            <Feather name="eye" size={18} color="#FFFFFF" />
            <Text style={styles.switchModeText}>Store</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  // Storefront Tab Bar (Matching design mockup)
  const storefrontTabs = [
    { key: "HOME" as StorefrontTab, label: "HOME", icon: "home" as const },
    { key: "SHOP" as StorefrontTab, label: "SHOP", icon: "grid" as const },
    { key: "BAG" as StorefrontTab, label: "BAG", icon: "shopping-bag" as const },
    { key: "ACCOUNT" as StorefrontTab, label: "PROFILE", icon: "user" as const },
  ];

  return (
    <View style={[styles.container, { paddingBottom: bottomInset }]}>
      {storefrontTabs.map((tab) => {
        const isActive = activeTab === tab.key;
        return (
          <TouchableOpacity
            key={tab.key}
            style={styles.tabBtn}
            onPress={() => onTabPress(tab.key)}
            activeOpacity={0.7}
          >
            <View style={styles.iconWrapper}>
              <Feather
                name={tab.icon}
                size={21}
                color={isActive ? colors.primary : colors.textMuted}
              />
              {tab.key === "BAG" && cartCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {cartCount > 99 ? "99+" : cartCount}
                  </Text>
                </View>
              )}
            </View>
            <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
              {tab.label}
            </Text>
            {isActive && <View style={styles.activeIndicator} />}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8,
    paddingBottom: 16,
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  backendContainer: {
    flexDirection: "row",
    backgroundColor: colors.darkSurface,
    borderTopWidth: 1,
    borderTopColor: colors.darkBorder,
    paddingTop: 8,
    paddingBottom: 16,
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  tabBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
  },
  iconWrapper: {
    position: "relative",
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: -3,
    right: -7,
    backgroundColor: colors.primary,
    borderRadius: 9,
    minWidth: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  badgeText: {
    color: colors.textLight,
    fontSize: 9,
    fontWeight: "800",
  },
  tabLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: "600",
    marginTop: 3,
    letterSpacing: 0.5,
  },
  tabLabelActive: {
    color: colors.primary,
    fontWeight: "700",
  },
  tabLabelActiveBackend: {
    color: colors.gold,
    fontWeight: "700",
  },
  activeIndicator: {
    position: "absolute",
    bottom: -8,
    width: 14,
    height: 2,
    backgroundColor: colors.primary,
    borderRadius: 2,
  },
  switchModeBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 4,
  },
  switchModeText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
  },
});
