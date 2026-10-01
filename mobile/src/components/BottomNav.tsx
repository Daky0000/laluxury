import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { colors } from "../theme/colors";

export type NavTab = "HOME" | "CATALOG" | "ADD" | "SETTINGS";

type Props = {
  activeTab: NavTab;
  onTabPress: (tab: NavTab) => void;
};

export function BottomNav({ activeTab, onTabPress }: Props) {
  const tabs = [
    { key: "HOME" as NavTab, label: "Home", icon: "🏛️" },
    { key: "CATALOG" as NavTab, label: "Catalog", icon: "📦" },
    { key: "ADD" as NavTab, label: "Add Piece", icon: "➕" },
    { key: "SETTINGS" as NavTab, label: "Settings", icon: "⚙️" },
  ];

  return (
    <View style={styles.container}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.key;
        return (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tabBtn, tab.key === "ADD" && styles.addTabBtn]}
            onPress={() => onTabPress(tab.key)}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabIcon, isActive && styles.tabIconActive]}>
              {tab.icon}
            </Text>
            <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingVertical: 8,
    paddingBottom: 16,
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
  },
  tabBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
  },
  addTabBtn: {
    transform: [{ translateY: -4 }],
  },
  tabIcon: {
    fontSize: 20,
    marginBottom: 2,
    opacity: 0.6,
  },
  tabIconActive: {
    opacity: 1,
    transform: [{ scale: 1.1 }],
  },
  tabLabel: {
    color: colors.textSubtle,
    fontSize: 10,
    fontWeight: "600",
  },
  tabLabelActive: {
    color: colors.gold,
    fontWeight: "700",
  },
});
