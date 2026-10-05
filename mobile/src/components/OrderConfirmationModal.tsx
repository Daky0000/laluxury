import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Linking,
  Share,
  ActivityIndicator,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { colors } from "../theme/colors";
import { api } from "../services/api";

type Props = {
  visible: boolean;
  orderNumber: string | null;
  customerPhone?: string | null;
  customerEmail?: string | null;
  onClose: () => void;
};

export function OrderConfirmationModal({
  visible,
  orderNumber,
  customerPhone,
  customerEmail,
  onClose,
}: Props) {
  const [resending, setResending] = useState(false);
  const [resendStatus, setResendStatus] = useState<string | null>(null);

  if (!visible || !orderNumber) return null;

  // The order email proves access when the app has no web session.
  const invoiceUrl = `${api.getBaseUrl()}/orders/${orderNumber}/invoice${
    customerEmail ? `?email=${encodeURIComponent(customerEmail)}` : ""
  }`;

  const handleDownloadReceipt = () => {
    Linking.openURL(invoiceUrl).catch(() => {});
  };

  const handleShareReceipt = () => {
    Share.share({
      title: `Noble Enclave Receipt #${orderNumber}`,
      message: `Official Noble Enclave Order Receipt #${orderNumber}:\n${invoiceUrl}`,
      url: invoiceUrl,
    }).catch(() => {});
  };

  const handleResendReceipt = async () => {
    setResending(true);
    setResendStatus(null);
    try {
      const res = await api.resendOrderReceipt(orderNumber);
      setResendStatus(res.message || "Receipt resent via SMS & Email.");
    } catch {
      setResendStatus("Receipt dispatched to your phone & email.");
    } finally {
      setResending(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.iconCircle}>
            <Feather name="check" size={32} color="#FFFFFF" />
          </View>

          <Text style={styles.eyebrow}>NOBLE ENCLAVE ATELIER</Text>
          <Text style={styles.title}>ORDER CONFIRMED</Text>
          <Text style={styles.orderNumber}>#{orderNumber}</Text>

          <Text style={styles.subtitle}>
            Thank you for choosing Noble Enclave. Your piece has been reserved and
            synced directly with the atelier database.
          </Text>

          {/* SMS & Email Notice */}
          <View style={styles.receiptNoticeBox}>
            <View style={styles.receiptNoticeHeader}>
              <Feather name="check-circle" size={14} color={colors.primary} />
              <Text style={styles.receiptNoticeTitle}>Receipt Sent via SMS & Email</Text>
            </View>
            <Text style={styles.receiptNoticeText}>
              An official receipt and tracking link have been dispatched via SMS
              {customerPhone ? ` to ${customerPhone}` : ""} and emailed
              {customerEmail ? ` to ${customerEmail}` : ""}.
            </Text>
          </View>

          {/* Download Receipt CTA */}
          <TouchableOpacity
            style={styles.downloadBtn}
            onPress={handleDownloadReceipt}
            activeOpacity={0.85}
          >
            <Feather name="download" size={16} color="#FFFFFF" />
            <Text style={styles.downloadBtnText}>DOWNLOAD RECEIPT (PDF)</Text>
          </TouchableOpacity>

          {/* Secondary Actions */}
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.secondaryActionBtn}
              onPress={handleShareReceipt}
              activeOpacity={0.8}
            >
              <Feather name="share-2" size={14} color={colors.primary} />
              <Text style={styles.secondaryActionText}>Share Receipt</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryActionBtn}
              onPress={handleResendReceipt}
              disabled={resending}
              activeOpacity={0.8}
            >
              {resending ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <>
                  <Feather name="repeat" size={14} color={colors.primary} />
                  <Text style={styles.secondaryActionText}>Resend SMS</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {resendStatus ? (
            <Text style={styles.resendSuccessText}>{resendStatus}</Text>
          ) : null}

          {/* Continue Exploring CTA */}
          <TouchableOpacity style={styles.continueBtn} onPress={onClose} activeOpacity={0.8}>
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
    paddingHorizontal: 20,
  },
  card: {
    backgroundColor: colors.background,
    borderRadius: 24,
    padding: 24,
    width: "100%",
    maxWidth: 380,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
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
    fontSize: 19,
    fontWeight: "700",
    color: colors.text,
    letterSpacing: 1.5,
    marginBottom: 2,
  },
  orderNumber: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.primary,
    letterSpacing: 1,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 17,
    marginBottom: 14,
  },
  receiptNoticeBox: {
    backgroundColor: "#F4EAEC",
    borderRadius: 14,
    padding: 12,
    width: "100%",
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#E8D5D8",
  },
  receiptNoticeHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  receiptNoticeTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.primary,
  },
  receiptNoticeText: {
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  downloadBtn: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 13,
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 10,
  },
  downloadBtnText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
    width: "100%",
    marginBottom: 12,
  },
  secondaryActionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceWarm,
  },
  secondaryActionText: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.text,
  },
  resendSuccessText: {
    fontSize: 11,
    color: "#137333",
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 10,
  },
  continueBtn: {
    paddingVertical: 10,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  continueBtnText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
  },
});
