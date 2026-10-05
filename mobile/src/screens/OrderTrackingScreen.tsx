import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, Linking } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { api } from "../services/api";
import { colors } from "../theme/colors";
import { formatCurrency, formatDate } from "../utils/format";
import { SmartImage } from "../components/SmartImage";
import type { Order } from "../types";

type Props = {
  orderNumber: string;
  /** Signed token from an SMS/email tracking link, for guests. */
  accessToken?: string;
  onBack: () => void;
};

const STEPS: { status: string; label: string; icon: keyof typeof Feather.glyphMap }[] = [
  { status: "PENDING", label: "Order placed", icon: "file-text" },
  { status: "PAID", label: "Payment received", icon: "credit-card" },
  { status: "PROCESSING", label: "Being prepared", icon: "package" },
  { status: "SHIPPED", label: "On the way", icon: "truck" },
  { status: "DELIVERED", label: "Delivered", icon: "check-circle" },
];
// FULFILLED sits between preparing and shipping for display purposes.
const RANK: Record<string, number> = { PENDING: 0, PAID: 1, PROCESSING: 2, FULFILLED: 2, SHIPPED: 3, DELIVERED: 4 };

function stepTime(order: Order, status: string): string | null {
  const at =
    status === "PENDING" ? order.placedAt
    : status === "PAID" ? order.paidAt
    : status === "SHIPPED" ? order.shippedAt
    : status === "DELIVERED" ? order.deliveredAt
    : null;
  return at ? formatDate(at) : null;
}

/** Order status as a timeline, driven by the order's own events. */
export function OrderTrackingScreen({ orderNumber, accessToken, onBack }: Props) {
  const query = useQuery({
    queryKey: ["order", orderNumber, accessToken],
    queryFn: () => api.getOrder(orderNumber, accessToken),
    refetchInterval: 60_000,
  });
  const order = query.data?.order;
  const cancelled = order?.status === "CANCELLED" || order?.status === "REFUNDED";
  const reached = order ? (RANK[order.status] ?? 0) : -1;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} accessibilityRole="button" accessibilityLabel="Back" hitSlop={12}>
          <Feather name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title} accessibilityRole="header">Order {orderNumber}</Text>
        <View style={{ width: 22 }} />
      </View>

      {query.isLoading ? (
        <ActivityIndicator style={{ marginTop: 48 }} color={colors.primary} />
      ) : !order ? (
        <View style={styles.empty}>
          <Feather name="search" size={36} color={colors.textMuted} />
          <Text style={styles.emptyText}>
            We couldn't open this order. Sign in with the account that placed it, or use the link in your SMS.
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={query.refetch} tintColor={colors.primary} />}
        >
          {cancelled ? (
            <View style={styles.cancelled} accessibilityRole="alert">
              <Feather name="x-circle" size={18} color={colors.primary} />
              <Text style={styles.cancelledText}>
                This order was {order.status === "REFUNDED" ? "refunded" : "cancelled"}
                {order.cancelledAt ? ` on ${formatDate(order.cancelledAt)}` : ""}.
              </Text>
            </View>
          ) : (
            <View style={styles.card}>
              {STEPS.map((step, idx) => {
                const done = idx <= reached;
                const last = idx === STEPS.length - 1;
                const time = done ? stepTime(order, step.status) : null;
                return (
                  <View
                    key={step.status}
                    style={styles.step}
                    accessible
                    accessibilityLabel={`${step.label}${done ? ", done" : ", not yet"}${time ? `, ${time}` : ""}`}
                  >
                    <View style={styles.rail}>
                      <View style={[styles.dot, done && styles.dotDone]}>
                        <Feather name={step.icon} size={14} color={done ? "#FFFFFF" : colors.textMuted} />
                      </View>
                      {!last ? <View style={[styles.line, idx < reached && styles.lineDone]} /> : null}
                    </View>
                    <View style={styles.stepBody}>
                      <Text style={[styles.stepLabel, done && styles.stepLabelDone]}>{step.label}</Text>
                      {time ? <Text style={styles.stepTime}>{time}</Text> : null}
                      {step.status === "SHIPPED" && done && order.trackingNumber ? (
                        <Text style={styles.stepTime}>
                          {order.trackingCompany ? `${order.trackingCompany} · ` : ""}Tracking {order.trackingNumber}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          <Text style={styles.section}>ITEMS</Text>
          <View style={styles.card}>
            {order.items.map((item) => (
              <View key={item.id} style={styles.item}>
                <SmartImage uri={item.imageUrl} alt={item.productTitle} style={styles.itemImage} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName} numberOfLines={2}>{item.productTitle}</Text>
                  <Text style={styles.itemMeta}>Qty {item.quantity}</Text>
                </View>
                <Text style={styles.itemPrice}>{formatCurrency(item.total, order.currency)}</Text>
              </View>
            ))}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>{formatCurrency(order.total, order.currency)}</Text>
            </View>
          </View>

          {order.events && order.events.length > 0 ? (
            <>
              <Text style={styles.section}>HISTORY</Text>
              <View style={styles.card}>
                {order.events
                  .filter((e) => !e.type.startsWith("notify.") && !e.type.startsWith("momo."))
                  .map((event) => (
                    <View key={event.id} style={styles.event}>
                      <Text style={styles.eventText}>{event.message}</Text>
                      <Text style={styles.stepTime}>{formatDate(event.createdAt)}</Text>
                    </View>
                  ))}
              </View>
            </>
          ) : null}

          {order.invoicePath ? (
            <TouchableOpacity
              style={styles.invoice}
              onPress={() => Linking.openURL(`${api.getBaseUrl()}${order.invoicePath}`)}
              accessibilityRole="link"
            >
              <Feather name="file-text" size={16} color={colors.primary} />
              <Text style={styles.invoiceText}>View invoice</Text>
            </TouchableOpacity>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: { fontSize: 17, fontWeight: "700", color: colors.text },
  card: { backgroundColor: colors.surface, borderRadius: 8, padding: 16, borderWidth: 1, borderColor: colors.borderLight },
  step: { flexDirection: "row", minHeight: 58 },
  rail: { alignItems: "center", width: 32 },
  dot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceWarm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dotDone: { backgroundColor: colors.primary, borderColor: colors.primary },
  line: { flex: 1, width: 2, backgroundColor: colors.border, marginVertical: 2 },
  lineDone: { backgroundColor: colors.primary },
  stepBody: { flex: 1, paddingLeft: 12, paddingBottom: 14 },
  stepLabel: { fontSize: 15, color: colors.textMuted, fontWeight: "600" },
  stepLabelDone: { color: colors.text },
  stepTime: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  section: { fontSize: 11, fontWeight: "800", letterSpacing: 1.4, color: colors.textMuted, marginTop: 24, marginBottom: 8 },
  item: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  itemImage: { width: 52, height: 62, borderRadius: 4, backgroundColor: colors.surfaceCard },
  itemName: { fontSize: 14, color: colors.text, fontWeight: "600" },
  itemMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  itemPrice: { fontSize: 14, color: colors.text, fontWeight: "700" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: colors.borderLight, paddingTop: 12 },
  totalLabel: { fontSize: 15, fontWeight: "700", color: colors.text },
  totalValue: { fontSize: 15, fontWeight: "800", color: colors.primary },
  event: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  eventText: { fontSize: 13, color: colors.text, lineHeight: 19 },
  cancelled: { flexDirection: "row", gap: 10, alignItems: "center", backgroundColor: colors.primaryTint, padding: 14, borderRadius: 8 },
  cancelledText: { flex: 1, color: colors.primary, fontWeight: "600" },
  invoice: { flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", marginTop: 24, padding: 14, borderWidth: 1, borderColor: colors.primary, borderRadius: 4 },
  invoiceText: { color: colors.primary, fontWeight: "700", letterSpacing: 0.5 },
  empty: { alignItems: "center", paddingTop: 80, paddingHorizontal: 40, gap: 14 },
  emptyText: { textAlign: "center", color: colors.textSecondary, fontSize: 14, lineHeight: 21 },
});
