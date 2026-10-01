import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Modal } from "react-native";
import { Feather } from "@expo/vector-icons";
import { colors } from "../theme/colors";

type Props = {
  visible: boolean;
  orderNumber: string | null;
  onClose: () => void;
};

export function OrderConfirmationModal({
  visible,
  orderNumber,
  onClose,
}: Props) {
  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.iconCircle}>
            <Feather name="check" size={34} color="#FFFFFF" />
          </View>

          <Text style={styles.eyebrow}>LALUXURY ATELIER</Text>
          <Text style={styles.title}>ORDER CONFIRMED</Text>
          <Text style={styles.orderNumber}>#{orderNumber}</Text>

          <Text style={styles.subtitle}>
            Thank you for choosing LaLuxury. Your piece has been reserved and
            synced directly with the website atelier database.
          </Text>

          <View style={styles.infoBadge}>
            <Feather name="shield" size={13} color={colors.primary} />
            <Text style={styles.infoBadgeText}>
              Live Synchronization with LaLuxury.com
            </Text>
          </View>

          <TouchableOpacity style={styles.continueBtn} onPress={onClose}>
            <Text style={styles.continueBtnText}>CONTINUE EXPLORING</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: colors.background,
    borderRadius: 24,
    padding: 28,
    width: "100%",
    maxWidth: 360,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  eyebrow: {
    fontSize: 9,
    fontWeight: "800",
    color: colors.primary,
    letterSpacing: 2,
    marginBottom: 2,
  },
  title: {
    fontFamily: "serif",
    fontSize: 20,
    fontWeight: "700",
    color: colors.text,
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  orderNumber: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.primary,
    letterSpacing: 1,
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 18,
    marginBottom: 18,
  },
  infoBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceWarm,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 6,
    marginBottom: 22,
    borderWidth: 1,
    borderColor: colors.border,
  },
  infoBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.primary,
  },
  continueBtn: {
    backgroundColor: colors.primary,
    borderRadius: 22,
    paddingVertical: 14,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  continueBtnText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
});
