import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated,
} from "react-native";
import { Image } from "expo-image";
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
      {/* Centered Brand Emblem + Title */}
      <View style={styles.brandBox}>
        <Image
          source={require("../../assets/emblem-white.png")}
          contentFit="contain"
          accessibilityLabel="Noble Enclave"
          style={styles.emblemImage}
        />
        <Text style={styles.brandTitle}>NOBLE ENCLAVE</Text>
        <Text style={styles.brandSubtitle}>HOME TEXTILES • LIVING ESSENTIALS</Text>
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
  emblemImage: {
    width: 120,
    height: 82,
    resizeMode: "contain",
    marginBottom: 18,
  },
  brandTitle: {
    fontFamily: "serif",
    fontSize: 32,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 4,
    textAlign: "center",
  },
  brandSubtitle: {
    fontSize: 10,
    fontWeight: "600",
    color: colors.gold,
    letterSpacing: 2.5,
    marginTop: 8,
    textAlign: "center",
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

