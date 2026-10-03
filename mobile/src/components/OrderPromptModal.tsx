import React, { useState, useEffect } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Linking,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { colors } from "../theme/colors";
import { api } from "../services/api";
import { formatCurrency, formatDate } from "../utils/format";

export type OrderPromptData = {
  id: string;
  orderNumber: string;
  total: number;
  currency: string;
  status: string;
  paymentStatus: string;
  fulfillmentStatus?: string;
  placedAt: string;
  customerName: string;
  customerPhone?: string | null;
  customerEmail?: string | null;
  city?: string | null;
  line1?: string | null;
  items?: Array<{
    id: string;
    productTitle: string;
    variantTitle: string;
    quantity: number;
    unitPrice: number;
  }>;
};

type Props = {
  visible: boolean;
  order: OrderPromptData | null;
  onClose: () => void;
  onSuccess: (message: string) => void;
  onError: (error: string) => void;
};

export function OrderPromptModal({
  visible,
  order,
  onClose,
  onSuccess,
  onError,
}: Props) {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (order) {
      const firstName = order.customerName.split(" ")[0] || "Valued Client";
      setMessage(
        `Hello ${firstName}, your Noble Enclave order #${order.orderNumber} is being prepared for dispatch. Our delivery rider will contact you shortly.`
      );
    }
  }, [order]);

  if (!visible || !order) return null;

  const handleSelectTemplate = (text: string) => {
    setMessage(text);
  };

  const handleCall = () => {
    if (order.customerPhone) {
      Linking.openURL(`tel:${order.customerPhone}`).catch(() => {
        onError("Could not open phone dialer.");
      });
    }
  };

  const handleWhatsApp = () => {
    if (order.customerPhone) {
      const cleanPhone = order.customerPhone.replace(/[^0-9]/g, "");
      const waNumber = cleanPhone.startsWith("0")
        ? `233${cleanPhone.slice(1)}`
        : cleanPhone;
      Linking.openURL(
        `https://wa.me/${waNumber}?text=${encodeURIComponent(message)}`
      ).catch(() => {
        onError("Could not open WhatsApp.");
      });
    }
  };

  const handleSendPrompt = async () => {
    const trimmed = message.trim();
    if (!trimmed) {
      onError("Please write a message to prompt the customer.");
      return;
    }

    setLoading(true);
    try {
      // Dispatches direct SMS to customer and records audit event in database
      const res = await api.sendCustomNotification({
        target: order.customerPhone ? "phone" : "order",
        phone: order.customerPhone || undefined,
        orderId: order.id,
        title: `Order #${order.orderNumber}`,
        message: trimmed,
      });

      if (res.ok) {
        onSuccess(
          `Prompt sent to ${order.customerName} (${order.customerPhone || "Order #" + order.orderNumber}).`
        );
        onClose();
      } else {
        onError(res.message || "Failed to send prompt to customer.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to send prompt.";
      onError(msg);
    } finally {
      setLoading(false);
    }
  };

  const firstName = order.customerName.split(" ")[0] || "Client";

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.overlay}
      >
        <View style={styles.card}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <View style={styles.badgeRow}>
                <View style={styles.liveIndicator} />
                <Text style={styles.badge}>PENDING ORDER PROMPT</Text>
              </View>
              <Text style={styles.title}>Order #{order.orderNumber}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Feather name="x" size={20} color={colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Customer & Order Summary Card */}
            <View style={styles.summaryCard}>
              <View style={styles.summaryTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.customerName}>{order.customerName}</Text>
                  <Text style={styles.orderDate}>
                    Placed on {formatDate(order.placedAt)}
                  </Text>
                </View>
                <Text style={styles.orderTotal}>
                  {formatCurrency(order.total, order.currency)}
                </Text>
              </View>

              {/* Status Badges */}
              <View style={styles.statusRow}>
                <View
                  style={[
                    styles.statusPill,
                    order.paymentStatus === "PAID"
                      ? styles.statusPaid
                      : styles.statusPending,
                  ]}
                >
                  <Text style={styles.statusPillText}>
                    Payment: {order.paymentStatus || order.status}
                  </Text>
                </View>

                <View
                  style={[
                    styles.statusPill,
                    order.fulfillmentStatus === "FULFILLED"
                      ? styles.statusFulfilled
                      : styles.statusUnfulfilled,
                  ]}
                >
                  <Text style={styles.statusPillText}>
                    Pack: {order.fulfillmentStatus || "UNFULFILLED"}
                  </Text>
                </View>
              </View>

              {/* Customer Contact & Quick Actions */}
              {order.customerPhone ? (
                <View style={styles.phoneActionRow}>
                  <View style={styles.phoneInfo}>
                    <Feather name="phone" size={14} color={colors.primary} />
                    <Text style={styles.phoneText}>{order.customerPhone}</Text>
                  </View>
                  <View style={styles.quickContactBtns}>
                    <TouchableOpacity
                      style={styles.contactBtn}
                      onPress={handleCall}
                      activeOpacity={0.7}
                    >
                      <Feather name="phone-call" size={13} color="#FFFFFF" />
                      <Text style={styles.contactBtnText}>Call</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.contactBtn, { backgroundColor: "#25D366" }]}
                      onPress={handleWhatsApp}
                      activeOpacity={0.7}
                    >
                      <Feather name="message-circle" size={13} color="#FFFFFF" />
                      <Text style={styles.contactBtnText}>WhatsApp</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : null}

              {/* Delivery Destination */}
              {(order.city || order.line1) && (
                <View style={styles.destinationRow}>
                  <Feather name="map-pin" size={13} color={colors.textSecondary} />
                  <Text style={styles.destinationText} numberOfLines={1}>
                    {[order.line1, order.city].filter(Boolean).join(", ")}
                  </Text>
                </View>
              )}

              {/* Ordered Items Preview */}
              {order.items && order.items.length > 0 && (
                <View style={styles.itemsPreview}>
                  <Text style={styles.itemsPreviewLabel}>ORDERED ITEMS:</Text>
                  {order.items.map((item) => (
                    <Text key={item.id} style={styles.itemRowText} numberOfLines={1}>
                      • {item.quantity}x {item.productTitle}{" "}
                      {item.variantTitle && item.variantTitle !== "Default"
                        ? `(${item.variantTitle})`
                        : ""}
                    </Text>
                  ))}
                </View>
              )}
            </View>

            {/* Quick Template Prompts */}
            <Text style={styles.label}>QUICK PROMPT TEMPLATES</Text>
            <View style={styles.templatesContainer}>
              <TouchableOpacity
                style={styles.templateChip}
                onPress={() =>
                  handleSelectTemplate(
                    `Hello ${firstName}, your Noble Enclave order #${order.orderNumber} is packed and ready for dispatch today. Our rider will contact you soon.`
                  )
                }
              >
                <Text style={styles.templateChipText}>📦 Packed & Ready</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.templateChip}
                onPress={() =>
                  handleSelectTemplate(
                    `Hello ${firstName}, our dispatch rider is currently en route with your Noble Enclave order #${order.orderNumber}. Please keep your phone reachable.`
                  )
                }
              >
                <Text style={styles.templateChipText}>🛵 Rider En Route</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.templateChip}
                onPress={() =>
                  handleSelectTemplate(
                    `Hello ${firstName}, this is a gentle reminder regarding payment for your Noble Enclave order #${order.orderNumber} (${formatCurrency(order.total, order.currency)}). Kindly authorize to complete dispatch.`
                  )
                }
              >
                <Text style={styles.templateChipText}>💳 Payment Follow-up</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.templateChip}
                onPress={() =>
                  handleSelectTemplate(
                    `Hello ${firstName}, please confirm your delivery destination address for Noble Enclave order #${order.orderNumber} (${order.city || "your area"}). Thank you!`
                  )
                }
              >
                <Text style={styles.templateChipText}>📍 Confirm Address</Text>
              </TouchableOpacity>
            </View>

            {/* Editable Prompt Message */}
            <Text style={styles.label}>DIRECT SMS / PROMPT TEXT *</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={message}
              onChangeText={setMessage}
              placeholder="Enter message for customer..."
              placeholderTextColor="#999"
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
            <Text style={styles.charCount}>{message.length} characters</Text>

            {/* Send Direct Prompt Action Button */}
            <TouchableOpacity
              style={styles.submitBtn}
              onPress={handleSendPrompt}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Feather
                    name="send"
                    size={16}
                    color="#FFFFFF"
                    style={{ marginRight: 8 }}
                  />
                  <Text style={styles.submitBtnText}>SEND DIRECT PROMPT</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={onClose}
              activeOpacity={0.7}
            >
              <Text style={styles.cancelBtnText}>Dismiss</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
    justifyContent: "flex-end",
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: Platform.OS === "ios" ? 40 : 24,
    maxHeight: "92%",
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#EFECE6",
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  liveIndicator: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#F59E0B",
  },
  badge: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.primary,
    letterSpacing: 1,
  },
  title: {
    fontFamily: "serif",
    fontSize: 20,
    fontWeight: "700",
    color: colors.text,
  },
  closeBtn: {
    padding: 6,
    backgroundColor: "#F3F1EC",
    borderRadius: 20,
  },
  summaryCard: {
    backgroundColor: "#F8F7F4",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#EAE6DE",
    padding: 14,
    marginBottom: 16,
  },
  summaryTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  customerName: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
  },
  orderDate: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  orderTotal: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.primary,
  },
  statusRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusPaid: {
    backgroundColor: "rgba(16, 185, 129, 0.15)",
  },
  statusPending: {
    backgroundColor: "rgba(245, 158, 11, 0.15)",
  },
  statusFulfilled: {
    backgroundColor: "rgba(59, 130, 246, 0.15)",
  },
  statusUnfulfilled: {
    backgroundColor: "rgba(239, 68, 68, 0.12)",
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.text,
    letterSpacing: 0.4,
  },
  phoneActionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#EDE7D9",
  },
  phoneInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  phoneText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text,
  },
  quickContactBtns: {
    flexDirection: "row",
    gap: 6,
  },
  contactBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  contactBtnText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "700",
  },
  destinationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
    marginBottom: 4,
  },
  destinationText: {
    fontSize: 12,
    color: colors.textSecondary,
    flex: 1,
  },
  itemsPreview: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#EDE7D9",
  },
  itemsPreviewLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: colors.textSecondary,
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  itemRowText: {
    fontSize: 11,
    color: colors.text,
    lineHeight: 16,
  },
  label: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.textSecondary,
    letterSpacing: 1,
    marginBottom: 8,
    marginTop: 6,
  },
  templatesContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 14,
  },
  templateChip: {
    backgroundColor: "#F3F1EC",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E5E1D8",
  },
  templateChipText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.text,
  },
  input: {
    backgroundColor: "#F8F7F4",
    borderWidth: 1,
    borderColor: "#E5E1D8",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 13,
    color: colors.text,
  },
  textArea: {
    height: 90,
  },
  charCount: {
    fontSize: 10,
    color: colors.textSecondary,
    marginTop: 4,
    textAlign: "right",
  },
  submitBtn: {
    backgroundColor: colors.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 10,
    marginTop: 16,
    marginBottom: 8,
  },
  submitBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 1,
  },
  cancelBtn: {
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textSecondary,
  },
});
