import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { colors } from "../theme/colors";

export function SplashScreen() {
  return (
    <View style={styles.container}>
      {/* Centered Brand Title */}
      <View style={styles.brandBox}>
        <Text style={styles.brandEyebrow}>ATELIER & LIVING</Text>
        <Text style={styles.brandTitle}>LALUXURY</Text>
        <View style={styles.leafIconContainer}>
          <Feather name="compass" size={26} color={colors.gold} />
        </View>
      </View>

      {/* Bottom Loading Indicator */}
      <View style={styles.bottomBox}>
        <Text style={styles.tagline}>HANDCRAFTED FURNITURE · TIMELESS LIVING</Text>
        <Text style={styles.loadingLabel}>LOADING STORE...</Text>
        <View style={styles.progressBarBackground}>
          <View style={styles.progressBarFill} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.primary, // LaLuxury signature wine #7A2E3C
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 80,
    paddingHorizontal: 24,
  },
  brandBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  brandEyebrow: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.gold,
    letterSpacing: 4,
    marginBottom: 8,
  },
  brandTitle: {
    fontFamily: "serif",
    fontSize: 40,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 5,
  },
  leafIconContainer: {
    marginTop: 20,
    opacity: 0.9,
  },
  bottomBox: {
    alignItems: "center",
    width: "100%",
  },
  tagline: {
    fontSize: 9,
    fontWeight: "800",
    color: "rgba(255, 255, 255, 0.8)",
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  loadingLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: colors.gold,
    letterSpacing: 1.2,
    marginBottom: 10,
  },
  progressBarBackground: {
    width: 140,
    height: 3,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressBarFill: {
    width: 85,
    height: "100%",
    backgroundColor: colors.gold,
    borderRadius: 2,
  },
});
