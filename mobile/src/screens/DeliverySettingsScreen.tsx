import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  Platform,
  RefreshControl,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { colors } from "../theme/colors";
import { api } from "../services/api";
import { formatCurrency } from "../utils/format";
import { PopNotificationData } from "../components/PopNotification";

type Props = {
  onBack: () => void;
  onNotify?: (data: PopNotificationData) => void;
};

/**
 * Delivery is one fixed fee for every region, the same setting as
 * Admin → Settings → Delivery on the website. Pickup stays free.
 */
export function DeliverySettingsScreen({ onBack, onNotify }: Props) {
  const [deliveryFee, setDeliveryFee] = useState<number | null>(null);
  const [freeShippingThreshold, setFreeShippingThreshold] = useState<number | null>(null);
  const [feeInput, setFeeInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchFee = useCallback(async () => {
    try {
      const res = await api.getDeliveryFee();
      if (res?.ok) {
        setDeliveryFee(res.deliveryFee);
        setFreeShippingThreshold(res.freeShippingThreshold);
        setFeeInput((res.deliveryFee / 100).toFixed(2));
      }
    } catch {
      // The screen shows "—" and pull-to-refresh tries again.
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchFee();
  }, [fetchFee]);

  const handleSave = async () => {
    const text = feeInput.trim();
    if (!/^\d+(\.\d{1,2})?$/.test(text)) {
      onNotify?.({ type: "error", title: "Check the fee", message: "Enter the fee in cedis, like 50 or 50.00." });
      return;
    }
    setSaving(true);
    try {
      const res = await api.saveDeliveryFee(Math.round(Number(text) * 100));
      if (res.ok) {
        onNotify?.({ type: "success", title: "Saved", message: res.message });
        fetchFee();
      } else {
        onNotify?.({ type: "error", title: "Error", message: res.message || "Failed to save the fee." });
      }
    } catch (err: unknown) {
      onNotify?.({
        type: "error",
        title: "Error",
        message: err instanceof Error ? err.message : "Failed to save the fee.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Back">
          <Feather name="arrow-left" size={20} color={colors.darkText} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={styles.headerSubtitle}>DELIVERY</Text>
          <Text style={styles.headerTitle}>Delivery fee</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.gold} />
          <Text style={styles.loadingText}>Loading delivery fee...</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                fetchFee();
              }}
              tintColor={colors.gold}
            />
          }
        >
          <Text style={styles.explanationText}>
            One delivery fee for every order and every region, on the website and in the app.
            Pickup is always free.
          </Text>

          <View style={styles.card}>
            <Text style={styles.currentLabel}>CURRENT FEE</Text>
            <Text style={styles.currentValue}>
              {deliveryFee === null ? "—" : deliveryFee === 0 ? "Free" : formatCurrency(deliveryFee)}
            </Text>

            <Text style={styles.inputLabel}>NEW FEE (GH₵)</Text>
            <TextInput
              style={styles.input}
              value={feeInput}
              onChangeText={setFeeInput}
              keyboardType="decimal-pad"
              placeholder="50.00"
              placeholderTextColor="#999"
            />

            {freeShippingThreshold !== null ? (
              <Text style={styles.noteText}>
                Orders of {formatCurrency(freeShippingThreshold)} or more still deliver free (website
                Settings → Free delivery threshold).
              </Text>
            ) : null}

            <TouchableOpacity
              style={[styles.submitBtn, saving && { opacity: 0.6 }]}
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.8}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.submitBtnText}>SAVE DELIVERY FEE</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.darkBg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "ios" ? 14 : 10,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.darkBorder,
  },
  backBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: colors.darkSurface,
    borderWidth: 1,
    borderColor: colors.darkBorder,
  },
  headerSubtitle: {
    fontSize: 9,
    fontWeight: "800",
    color: colors.gold,
    letterSpacing: 1.2,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.darkText,
    fontFamily: "serif",
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 90,
  },
  explanationText: {
    fontSize: 12,
    color: colors.darkTextMuted,
    lineHeight: 17,
    marginBottom: 16,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    color: colors.darkTextMuted,
    fontSize: 13,
    marginTop: 10,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 16,
  },
  currentLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.textSecondary,
    letterSpacing: 0.8,
  },
  currentValue: {
    fontSize: 24,
    fontWeight: "800",
    color: colors.text,
    marginTop: 4,
    marginBottom: 8,
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.textSecondary,
    letterSpacing: 0.8,
    marginBottom: 4,
    marginTop: 8,
  },
  input: {
    backgroundColor: "#F8F7F4",
    borderWidth: 1,
    borderColor: "#E5E1D8",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: colors.text,
  },
  noteText: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 17,
    marginTop: 10,
  },
  submitBtn: {
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 10,
    marginTop: 16,
  },
  submitBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
});
