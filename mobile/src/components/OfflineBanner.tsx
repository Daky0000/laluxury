import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { Feather } from "@expo/vector-icons";
import { colors } from "../theme/colors";

/**
 * A slim banner while the phone has no internet. The bag lives on the device,
 * so shoppers can keep browsing what is loaded and check out once back online.
 */
export function OfflineBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    return NetInfo.addEventListener((state) => {
      setOffline(state.isConnected === false || state.isInternetReachable === false);
    });
  }, []);

  if (!offline) return null;
  return (
    <View style={styles.banner} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <Feather name="wifi-off" size={14} color="#FFFFFF" />
      <Text style={styles.text}>You're offline. Your bag is saved on this phone.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.text,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  text: { color: "#FFFFFF", fontSize: 12, fontWeight: "600" },
});
