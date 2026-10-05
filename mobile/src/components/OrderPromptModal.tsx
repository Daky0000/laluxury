import React, { useState, useEffect, useRef } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Linking,
} from "react-native";
import { styles } from "./OrderPromptModal.styles";
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
  depositAmount?: number | null;
  placedAt: string;
  customerName: string;
  customerPhone?: string | null;
  customerEmail?: string | null;
  city?: string | null;
  line1?: string | null;
  items?: {
    id: string;
    productTitle: string;
    variantTitle: string;
    quantity: number;
    unitPrice: number;
  }[];
};

type Props = {
  visible: boolean;
  order: OrderPromptData | null;
  onClose: () => void;
  onSuccess: (message: string) => void;
  onError: (error: string) => void;
};

// Quick helper to detect Ghana telco
function detectProvider(phone: string): { key: "auto" | "mtn" | "vod" | "tgo"; label: string; color: string } {
  const digits = phone.replace(/[^0-9]/g, "");
  const local = digits.startsWith("233") ? "0" + digits.slice(3) : digits;
  const prefix = local.slice(0, 3);

  if (["024", "054", "055", "059", "053"].includes(prefix)) {
    return { key: "mtn", label: "MTN Mobile Money", color: "#F59E0B" };
  }
  if (["020", "050"].includes(prefix)) {
    return { key: "vod", label: "Telecel Cash", color: "#EF4444" };
  }
  if (["027", "057", "026", "056"].includes(prefix)) {
    return { key: "tgo", label: "AT Money", color: "#3B82F6" };
  }
  return { key: "auto", label: "Auto Detect Network", color: colors.gold };
}

export function OrderPromptModal({
  visible,
  order,
  onClose,
  onSuccess,
  onError,
}: Props) {
  const [activeTab, setActiveTab] = useState<"momo" | "message">("momo");

  // MoMo Push States
  const [phone, setPhone] = useState("");
  const [provider, setProvider] = useState<"auto" | "mtn" | "vod" | "tgo">("auto");
  const [chargeScope, setChargeScope] = useState<"FULL" | "DEPOSIT_50" | "REMAINING_BALANCE">("FULL");
  const [pushLoading, setPushLoading] = useState(false);
  const [pushReference, setPushReference] = useState<string | null>(null);
  const [pushStatus, setPushStatus] = useState<string | null>(null);
  const [pushDisplayText, setPushDisplayText] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [isPaidConfirmed, setIsPaidConfirmed] = useState(false);

  // Message States
  const [message, setMessage] = useState("");
  const [msgLoading, setMsgLoading] = useState(false);

  useEffect(() => {
    if (order) {
      const cleanPhone = (order.customerPhone || "").trim();
      setPhone(cleanPhone);
      setProvider("auto");
      setPushReference(null);
      setPushStatus(null);
      setPushDisplayText(null);
      setOtpCode("");
      setIsPaidConfirmed(order.paymentStatus === "PAID");

      // Default scope
      if (order.depositAmount && order.depositAmount < order.total) {
        setChargeScope("REMAINING_BALANCE");
      } else {
        setChargeScope("FULL");
      }

      const firstName = order.customerName.split(" ")[0] || "Valued Client";
      setMessage(
        `Hello ${firstName}, your Noble Enclave order #${order.orderNumber} is being prepared for dispatch. Our delivery rider will contact you shortly.`
      );
    }
  }, [order]);

  // Latest callback without restarting the poll whenever the parent re-renders.
  const onSuccessRef = useRef(onSuccess);
  useEffect(() => {
    onSuccessRef.current = onSuccess;
  }, [onSuccess]);

  // Polling for MoMo PIN entry on customer phone
  useEffect(() => {
    if (!visible || !order || !pushReference || isPaidConfirmed) return;

    let attempts = 0;
    let inFlight = false;
    const MAX_ATTEMPTS = 25; // 25 x 3.5s = ~88 seconds

    const timer = setInterval(async () => {
      if (inFlight) return;
      attempts += 1;
      if (attempts > MAX_ATTEMPTS) {
        clearInterval(timer);
        setPushDisplayText("Polling timed out. Tap 'Check Status Now' once the customer confirms entering their PIN.");
        return;
      }

      inFlight = true;
      try {
        const check = await api.checkMomoPinStatus(
          order.id,
          pushReference,
          chargeScope === "DEPOSIT_50" ? "DEPOSIT_50" : "FULL"
        );

        if (check.paid) {
          setIsPaidConfirmed(true);
          setPushDisplayText("Payment verified successfully! Order updated to PAID.");
          clearInterval(timer);
          onSuccessRef.current(`Payment confirmed for Order #${order.orderNumber}!`);
        }
      } catch {
        // Continue polling silently
      } finally {
        inFlight = false;
      }
    }, 3500);

    return () => clearInterval(timer);
  }, [visible, order, pushReference, isPaidConfirmed, chargeScope]);

  if (!visible || !order) return null;

  const detected = detectProvider(phone);
  const totalAmount = order.total;
  const depositAmount = order.depositAmount || Math.round(order.total * 0.5);
  const remainingBalance = Math.max(0, order.total - depositAmount);

  let amountToCharge = totalAmount;
  if (chargeScope === "DEPOSIT_50") amountToCharge = depositAmount;
  if (chargeScope === "REMAINING_BALANCE") amountToCharge = remainingBalance;

  const handlePushMomoPin = async () => {
    if (!phone.trim()) {
      onError("Please enter a valid Ghana Mobile Money number.");
      return;
    }

    setPushLoading(true);
    setPushDisplayText(null);
    try {
      const res = await api.pushMomoPin(order.id, {
        phone: phone.trim(),
        provider: provider === "auto" ? undefined : provider,
        chargeScope,
      });

      if (res?.ok) {
        setPushReference(res.reference || null);
        setPushStatus(res.status || "pay_offline");
        setPushDisplayText(
          res.displayText ||
            `Direct ${res.providerLabel || detected.label} PIN prompt sent to ${phone}. Waiting for customer to enter their 4-digit PIN...`
        );

        if (res.status === "success") {
          setIsPaidConfirmed(true);
          onSuccessRef.current(`Payment confirmed for Order #${order.orderNumber}!`);
        }
      } else {
        onError(res?.error || "Failed to initiate MoMo PIN push.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to initiate MoMo PIN push.";
      onError(msg);
    } finally {
      setPushLoading(false);
    }
  };

  const handleManualCheckStatus = async () => {
    if (!pushReference) return;
    setPushLoading(true);
    try {
      const check = await api.checkMomoPinStatus(
        order.id,
        pushReference,
        chargeScope === "DEPOSIT_50" ? "DEPOSIT_50" : "FULL"
      );

      if (check?.paid) {
        setIsPaidConfirmed(true);
        setPushDisplayText("Payment confirmed! Order marked as PAID.");
        onSuccess(`Payment confirmed for Order #${order.orderNumber}!`);
      } else {
        setPushDisplayText(check?.message || "Still awaiting PIN entry from customer.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error checking payment status.";
      onError(msg);
    } finally {
      setPushLoading(false);
    }
  };

  const handleSubmitOtp = async () => {
    if (!pushReference || !otpCode.trim()) return;
    setPushLoading(true);
    try {
      const res = await api.pushMomoPin(order.id, {
        reference: pushReference,
        otp: otpCode.trim(),
      });

      if (res?.ok) {
        setOtpCode("");
        if (res.status === "success") {
          setIsPaidConfirmed(true);
          setPushDisplayText("OTP verified and payment confirmed!");
          onSuccessRef.current(`Payment confirmed for Order #${order.orderNumber}!`);
        } else {
          setPushDisplayText(res.displayText || "OTP submitted. Awaiting confirmation...");
        }
      } else {
        onError(res?.error || "Failed to submit OTP.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to submit OTP.";
      onError(msg);
    } finally {
      setPushLoading(false);
    }
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
      const waNumber = cleanPhone.startsWith("0") ? `233${cleanPhone.slice(1)}` : cleanPhone;
      Linking.openURL(`https://wa.me/${waNumber}?text=${encodeURIComponent(message)}`).catch(() => {
        onError("Could not open WhatsApp.");
      });
    }
  };

  const handleSendPromptMessage = async () => {
    const trimmed = message.trim();
    if (!trimmed) {
      onError("Please write a message to prompt the customer.");
      return;
    }

    setMsgLoading(true);
    try {
      const res = await api.sendCustomNotification({
        target: order.customerPhone ? "phone" : "order",
        phone: order.customerPhone || undefined,
        orderId: order.id,
        title: `Order #${order.orderNumber}`,
        message: trimmed,
      });

      if (res.ok) {
        onSuccess(`Prompt message sent to ${order.customerName}.`);
        onClose();
      } else {
        onError(res.message || "Failed to send prompt message.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to send prompt.";
      onError(msg);
    } finally {
      setMsgLoading(false);
    }
  };

  const firstName = order.customerName.split(" ")[0] || "Client";

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.overlay}
      >
        <View style={styles.card}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <View style={styles.badgeRow}>
                <View style={[styles.liveIndicator, { backgroundColor: isPaidConfirmed ? "#10B981" : "#F59E0B" }]} />
                <Text style={styles.badge}>
                  {isPaidConfirmed ? "PAYMENT VERIFIED" : "DIRECT MOMO PROMPT"}
                </Text>
              </View>
              <Text style={styles.title}>Order #{order.orderNumber}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} accessibilityRole="button" accessibilityLabel="Close">
              <Feather name="x" size={20} color={colors.text} />
            </TouchableOpacity>
          </View>

          {/* Mode Switcher Tabs */}
          <View style={styles.tabRow}>
            <TouchableOpacity
              style={[styles.tabBtn, activeTab === "momo" && styles.tabBtnActive]}
              onPress={() => setActiveTab("momo")}
              activeOpacity={0.8}
            >
              <Feather
                name="smartphone"
                size={14}
                color={activeTab === "momo" ? "#FFFFFF" : colors.textSecondary}
              />
              <Text style={[styles.tabText, activeTab === "momo" && styles.tabTextActive]}>
                Push MoMo PIN
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabBtn, activeTab === "message" && styles.tabBtnActive]}
              onPress={() => setActiveTab("message")}
              activeOpacity={0.8}
            >
              <Feather
                name="message-square"
                size={14}
                color={activeTab === "message" ? "#FFFFFF" : colors.textSecondary}
              />
              <Text style={[styles.tabText, activeTab === "message" && styles.tabTextActive]}>
                Message Client
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Customer & Order Summary Card */}
            <View style={styles.summaryCard}>
              <View style={styles.summaryTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.customerName}>{order.customerName}</Text>
                  <Text style={styles.orderDate}>Placed on {formatDate(order.placedAt)}</Text>
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
                    isPaidConfirmed || order.paymentStatus === "PAID"
                      ? styles.statusPaid
                      : styles.statusPending,
                  ]}
                >
                  <Text style={styles.statusPillText}>
                    {isPaidConfirmed ? "PAID" : `Payment: ${order.paymentStatus || order.status}`}
                  </Text>
                </View>

                {order.fulfillmentStatus && (
                  <View
                    style={[
                      styles.statusPill,
                      order.fulfillmentStatus === "FULFILLED"
                        ? styles.statusFulfilled
                        : styles.statusUnfulfilled,
                    ]}
                  >
                    <Text style={styles.statusPillText}>
                      Pack: {order.fulfillmentStatus}
                    </Text>
                  </View>
                )}
              </View>
            </View>

            {/* TAB 1: MOMO PIN DIRECT PROMPT */}
            {activeTab === "momo" ? (
              <View style={styles.tabContent}>
                {isPaidConfirmed ? (
                  <View style={styles.paidSuccessCard}>
                    <Feather name="check-circle" size={44} color="#10B981" />
                    <Text style={styles.paidSuccessTitle}>Payment Received!</Text>
                    <Text style={styles.paidSuccessSub}>
                      This order is fully marked as PAID. Receipt has been scheduled for delivery.
                    </Text>
                    <TouchableOpacity
                      style={[styles.submitBtn, { backgroundColor: "#10B981", marginTop: 16 }]}
                      onPress={onClose}
                    >
                      <Text style={styles.submitBtnText}>DONE</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <>
                    {/* Amount to Charge Selector */}
                    <Text style={styles.label}>CHARGE AMOUNT SCOPE</Text>
                    <View style={styles.scopeRow}>
                      <TouchableOpacity
                        style={[styles.scopeBtn, chargeScope === "FULL" && styles.scopeBtnActive]}
                        onPress={() => setChargeScope("FULL")}
                      >
                        <Text style={[styles.scopeLabel, chargeScope === "FULL" && styles.scopeLabelActive]}>
                          Full Order
                        </Text>
                        <Text style={[styles.scopeAmount, chargeScope === "FULL" && styles.scopeAmountActive]}>
                          {formatCurrency(totalAmount, order.currency)}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.scopeBtn, chargeScope === "DEPOSIT_50" && styles.scopeBtnActive]}
                        onPress={() => setChargeScope("DEPOSIT_50")}
                      >
                        <Text style={[styles.scopeLabel, chargeScope === "DEPOSIT_50" && styles.scopeLabelActive]}>
                          50% Deposit
                        </Text>
                        <Text style={[styles.scopeAmount, chargeScope === "DEPOSIT_50" && styles.scopeAmountActive]}>
                          {formatCurrency(depositAmount, order.currency)}
                        </Text>
                      </TouchableOpacity>

                      {order.depositAmount ? (
                        <TouchableOpacity
                          style={[styles.scopeBtn, chargeScope === "REMAINING_BALANCE" && styles.scopeBtnActive]}
                          onPress={() => setChargeScope("REMAINING_BALANCE")}
                        >
                          <Text style={[styles.scopeLabel, chargeScope === "REMAINING_BALANCE" && styles.scopeLabelActive]}>
                            Balance
                          </Text>
                          <Text style={[styles.scopeAmount, chargeScope === "REMAINING_BALANCE" && styles.scopeAmountActive]}>
                            {formatCurrency(remainingBalance, order.currency)}
                          </Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>

                    {/* Customer Mobile Money Number */}
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <Text style={styles.label}>MOBILE MONEY NUMBER *</Text>
                      <View style={[styles.telcoBadge, { backgroundColor: `${detected.color}20` }]}>
                        <Text style={[styles.telcoBadgeText, { color: detected.color }]}>
                          {detected.label}
                        </Text>
                      </View>
                    </View>

                    <TextInput
                      style={styles.input}
                      value={phone}
                      onChangeText={setPhone}
                      placeholder="e.g. 024 123 4567"
                      placeholderTextColor="#999"
                      keyboardType="phone-pad"
                    />

                    {/* Telco Selector (Override) */}
                    <Text style={[styles.label, { marginTop: 10 }]}>TELCO NETWORK</Text>
                    <View style={styles.providerRow}>
                      {(
                        [
                          { id: "auto", label: "Auto" },
                          { id: "mtn", label: "MTN MoMo" },
                          { id: "vod", label: "Telecel" },
                          { id: "tgo", label: "AT Money" },
                        ] as const
                      ).map((p) => (
                        <TouchableOpacity
                          key={p.id}
                          style={[styles.providerPill, provider === p.id && styles.providerPillActive]}
                          onPress={() => setProvider(p.id)}
                        >
                          <Text
                            style={[
                              styles.providerPillText,
                              provider === p.id && styles.providerPillTextActive,
                            ]}
                          >
                            {p.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    {/* Live Status Card when Prompt Pushed */}
                    {pushReference && (
                      <View style={styles.activePushCard}>
                        <View style={styles.activePushHeader}>
                          <ActivityIndicator size="small" color={colors.primary} />
                          <Text style={styles.activePushTitle}>
                            USSD PROMPT ACTIVE ON HANDSET
                          </Text>
                        </View>
                        <Text style={styles.activePushSub}>
                          Ref: {pushReference}
                        </Text>
                        {pushDisplayText && (
                          <Text style={styles.activePushText}>{pushDisplayText}</Text>
                        )}

                        {pushStatus === "send_otp" && (
                          <View style={styles.otpBox}>
                            <Text style={styles.label}>ENTER OTP SENT TO CUSTOMER</Text>
                            <TextInput
                              style={[styles.input, { backgroundColor: "#FFFFFF" }]}
                              value={otpCode}
                              onChangeText={setOtpCode}
                              placeholder="e.g. 123456"
                              keyboardType="number-pad"
                            />
                            <TouchableOpacity
                              style={[styles.submitBtn, { marginTop: 8 }]}
                              onPress={handleSubmitOtp}
                              disabled={pushLoading}
                            >
                              {pushLoading ? (
                                <ActivityIndicator size="small" color="#FFFFFF" />
                              ) : (
                                <Text style={styles.submitBtnText}>CONFIRM OTP</Text>
                              )}
                            </TouchableOpacity>
                          </View>
                        )}

                        <TouchableOpacity
                          style={styles.checkStatusBtn}
                          onPress={handleManualCheckStatus}
                          disabled={pushLoading}
                        >
                          <Feather name="refresh-cw" size={13} color={colors.primary} />
                          <Text style={styles.checkStatusText}>Check PIN Status Now</Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    {/* Primary Trigger Button */}
                    <TouchableOpacity
                      style={[styles.submitBtn, pushLoading && { opacity: 0.6 }]}
                      onPress={handlePushMomoPin}
                      disabled={pushLoading}
                      activeOpacity={0.85}
                    >
                      {pushLoading ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <>
                          <Feather name="send" size={16} color="#FFFFFF" style={{ marginRight: 8 }} />
                          <Text style={styles.submitBtnText}>
                            {pushReference ? "RE-SEND MOMO PIN PROMPT" : `PUSH MOMO PIN (${formatCurrency(amountToCharge, order.currency)})`}
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </>
                )}
              </View>
            ) : (
              /* TAB 2: MESSAGE CLIENT */
              <View style={styles.tabContent}>
                {order.customerPhone ? (
                  <View style={styles.phoneActionRow}>
                    <View style={styles.phoneInfo}>
                      <Feather name="phone" size={14} color={colors.primary} />
                      <Text style={styles.phoneText}>{order.customerPhone}</Text>
                    </View>
                    <View style={styles.quickContactBtns}>
                      <TouchableOpacity style={styles.contactBtn} onPress={handleCall} activeOpacity={0.7}>
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

                <Text style={styles.label}>QUICK TEMPLATES</Text>
                <View style={styles.templatesContainer}>
                  <TouchableOpacity
                    style={styles.templateChip}
                    onPress={() =>
                      setMessage(
                        `Hello ${firstName}, your Noble Enclave order #${order.orderNumber} is packed and ready for dispatch today. Our rider will contact you soon.`
                      )
                    }
                  >
                    <Text style={styles.templateChipText}>📦 Packed & Ready</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.templateChip}
                    onPress={() =>
                      setMessage(
                        `Hello ${firstName}, our dispatch rider is currently en route with your Noble Enclave order #${order.orderNumber}. Please keep your phone reachable.`
                      )
                    }
                  >
                    <Text style={styles.templateChipText}>🛵 Rider En Route</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.templateChip}
                    onPress={() =>
                      setMessage(
                        `Hello ${firstName}, this is a gentle reminder regarding payment for your Noble Enclave order #${order.orderNumber} (${formatCurrency(order.total, order.currency)}). Kindly authorize to complete dispatch.`
                      )
                    }
                  >
                    <Text style={styles.templateChipText}>💳 Payment Reminder</Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.label}>DIRECT SMS TEXT *</Text>
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

                <TouchableOpacity
                  style={[styles.submitBtn, msgLoading && { opacity: 0.6 }]}
                  onPress={handleSendPromptMessage}
                  disabled={msgLoading}
                  activeOpacity={0.8}
                >
                  {msgLoading ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Feather name="send" size={16} color="#FFFFFF" style={{ marginRight: 8 }} />
                      <Text style={styles.submitBtnText}>SEND DIRECT SMS</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}

            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} activeOpacity={0.7}>
              <Text style={styles.cancelBtnText}>Dismiss</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
