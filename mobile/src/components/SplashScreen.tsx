import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Animated } from "react-native";
import { Feather } from "@expo/vector-icons";
import { colors } from "../theme/colors";

export function SplashScreen() {
  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: 1,
      duration: 2200,
      useNativeDriver: false,
    }).start();
  }, [progressAnim]);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  return (
    <View style={styles.container}>
      {/* Centered Brand Title with Compass Icon */}
      <View style={styles.brandBox}>
        <Text style={styles.brandTitle}>NOBEL ENCLAVE</Text>
        <View style={styles.leafIconContainer}>
          <Feather name="compass" size={26} color={colors.gold} />
        </View>
      </View>

      {/* Bottom Loading Progress Bar */}
      <View style={styles.bottomBox}>
        <View style={styles.progressBarBackground}>
          <Animated.View style={[styles.progressBarFill, { width: progressWidth }]} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 90,
    paddingHorizontal: 24,
  },
  brandBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  brandTitle: {
    fontFamily: "serif",
    fontSize: 34,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 4,
    textAlign: "center",
  },
  leafIconContainer: {
    marginTop: 22,
    opacity: 0.9,
  },
  bottomBox: {
    alignItems: "center",
    width: "100%",
    paddingBottom: 20,
  },
  progressBarBackground: {
    width: 160,
    height: 3,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: colors.gold,
    borderRadius: 2,
  },
});

