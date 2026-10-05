import React, { useCallback, useEffect, useRef, useState } from "react";
import { AppState, View, Text, TouchableOpacity, StyleSheet } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { colors } from "../theme/colors";

/**
 * Locks the store backend behind the phone's fingerprint / face unlock.
 *
 * Asked when the backend is first opened and again after the app has been in
 * the background for a while. Phones without enrolled biometrics, or staff who
 * turned it off in Settings, go straight in.
 */

export const BIOMETRIC_PREF_KEY = "lx_biometric_lock";
const RELOCK_AFTER_MS = 5 * 60 * 1000;

export async function isBiometricLockEnabled(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(BIOMETRIC_PREF_KEY)) !== "off";
  } catch {
    return true;
  }
}

export async function setBiometricLockEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(BIOMETRIC_PREF_KEY, enabled ? "on" : "off");
}

export async function biometricsAvailable(): Promise<boolean> {
  try {
    return (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
  } catch {
    return false;
  }
}

let unlockedAt = 0;

export function BiometricGate({ children }: { children: React.ReactNode }) {
  const navigation = useNavigation();
  const [locked, setLocked] = useState<boolean | null>(null);
  const backgroundedAt = useRef(0);

  const unlock = useCallback(async () => {
    const enabled = await isBiometricLockEnabled();
    if (!enabled || !(await biometricsAvailable())) {
      setLocked(false);
      return;
    }
    if (Date.now() - unlockedAt < RELOCK_AFTER_MS) {
      setLocked(false);
      return;
    }
    setLocked(true);
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: "Unlock the store backend",
      fallbackLabel: "Use passcode",
    });
    if (result.success) {
      unlockedAt = Date.now();
      setLocked(false);
    }
  }, []);

  useEffect(() => {
    unlock();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "background") backgroundedAt.current = Date.now();
      if (state === "active" && backgroundedAt.current && Date.now() - backgroundedAt.current > RELOCK_AFTER_MS) {
        unlockedAt = 0;
        unlock();
      }
    });
    return () => sub.remove();
  }, [unlock]);

  if (locked === false) return <>{children}</>;
  return (
    <View style={styles.container}>
      <Feather name="lock" size={40} color={colors.gold} />
      <Text style={styles.title}>Store backend locked</Text>
      <Text style={styles.body}>Confirm it's you to manage orders and products.</Text>
      <TouchableOpacity style={styles.button} onPress={unlock} accessibilityRole="button" accessibilityLabel="Unlock with biometrics">
        <Text style={styles.buttonText}>UNLOCK</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => navigation.navigate("Storefront", { screen: "HOME" })}
        accessibilityRole="button"
        accessibilityLabel="Go to the storefront instead"
      >
        <Text style={styles.link}>Go to storefront</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, backgroundColor: colors.darkBg, gap: 12 },
  title: { color: "#FFFFFF", fontSize: 20, fontWeight: "700", marginTop: 8 },
  body: { color: "#B8B4AA", fontSize: 14, textAlign: "center" },
  button: { backgroundColor: colors.gold, paddingHorizontal: 36, paddingVertical: 14, borderRadius: 4, marginTop: 12 },
  buttonText: { color: colors.darkBg, fontWeight: "800", letterSpacing: 1.5 },
  link: { color: "#B8B4AA", marginTop: 8, textDecorationLine: "underline" },
});
