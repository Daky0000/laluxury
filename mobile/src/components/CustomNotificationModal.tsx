import React, { useState } from "react";
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
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Notifications from "expo-notifications";
import { colors } from "../theme/colors";
import { api } from "../services/api";

type Props = {
  visible: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
  onError: (error: string) => void;
};

export function CustomNotificationModal({
  visible,
  onClose,
  onSuccess,
  onError,
}: Props) {
  const [target, setTarget] = useState<"phone" | "announcement">("phone");
  const [phone, setPhone] = useState("");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [postToTray, setPostToTray] = useState(true);
  const [loading, setLoading] = useState(false);

  if (!visible) return null;

  const handleSend = async () => {
    const trimmedMessage = message.trim();
    if (!trimmedMessage) {
      onError("Please enter a notification message.");
      return;
    }

    if (target === "phone" && !phone.trim()) {
      onError("Please enter the recipient's phone number.");
      return;
    }

    setLoading(true);
    try {
      const res = await api.sendCustomNotification({
        target,
        phone: target === "phone" ? phone.trim() : undefined,
        title: title.trim() || undefined,
        message: trimmedMessage,
      });

      if (res.ok) {
        // Post local system notification to phone notification tray if enabled
        if (postToTray) {
          try {
            const { status: existingStatus } = await Notifications.getPermissionsAsync();
            let finalStatus = existingStatus;
            if (existingStatus !== "granted") {
              const { status } = await Notifications.requestPermissionsAsync();
              finalStatus = status;
            }
            if (finalStatus === "granted") {
              await Notifications.scheduleNotificationAsync({
                content: {
                  title: title.trim() || (target === "announcement" ? "Noble Enclave Store Announcement" : "Noble Enclave Notice"),
                  body: trimmedMessage,
                  data: { target, phone: phone.trim() },
                  color: "#7A2E3C",
                },
                trigger: null,
              });
            }
          } catch {
            // Non-fatal if system notification tray fails
          }
        }

        onSuccess(res.message);
        setMessage("");
        setTitle("");
        setPhone("");
        onClose();
      } else {
        onError(res.message || "Failed to send notification.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to send notification.";
      onError(msg);
    } finally {
      setLoading(false);
    }
  };

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
              <Text style={styles.badge}>OWNER & STAFF TOOL</Text>
              <Text style={styles.title}>Send Custom Notification</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Feather name="x" size={20} color={colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Target Channel Selector */}
            <Text style={styles.label}>NOTIFICATION CHANNEL</Text>
            <View style={styles.channelRow}>
              <TouchableOpacity
                style={[
                  styles.channelOption,
                  target === "phone" && styles.channelOptionActive,
                ]}
                onPress={() => setTarget("phone")}
                activeOpacity={0.8}
              >
                <Feather
                  name="smartphone"
                  size={16}
                  color={target === "phone" ? "#FFFFFF" : colors.textSecondary}
                />
                <Text
                  style={[
                    styles.channelText,
                    target === "phone" && styles.channelTextActive,
                  ]}
                >
                  Direct SMS
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.channelOption,
                  target === "announcement" && styles.channelOptionActive,
                ]}
                onPress={() => setTarget("announcement")}
                activeOpacity={0.8}
              >
                <Feather
                  name="volume-2"
                  size={16}
                  color={target === "announcement" ? "#FFFFFF" : colors.textSecondary}
                />
                <Text
                  style={[
                    styles.channelText,
                    target === "announcement" && styles.channelTextActive,
                  ]}
                >
                  Store Banner
                </Text>
              </TouchableOpacity>
            </View>

            {target === "phone" ? (
              <>
                <Text style={styles.label}>RECIPIENT PHONE NUMBER *</Text>
                <TextInput
                  style={styles.input}
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="e.g. 024 123 4567 or +233 24 123 4567"
                  placeholderTextColor="#999"
                  keyboardType="phone-pad"
                />
              </>
            ) : (
              <View style={styles.hintBox}>
                <Feather name="info" size={14} color={colors.gold} />
                <Text style={styles.hintText}>
                  This updates the live marquee banner shown to all customers across the website and mobile app.
                </Text>
              </View>
            )}

            <Text style={styles.label}>TITLE / HEADING (OPTIONAL)</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder={target === "phone" ? "e.g. Order Dispatch Notice" : "e.g. FLASH SALE"}
              placeholderTextColor="#999"
            />

            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={styles.label}>MESSAGE *</Text>
              <Text style={styles.charCount}>{message.length} chars</Text>
            </View>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={message}
              onChangeText={setMessage}
              placeholder={
                target === "phone"
                  ? "Type SMS message here... e.g. Your bespoke armchair is ready for delivery."
                  : "Type storewide announcement... e.g. Free delivery on all orders over GH₵1,000 this weekend."
              }
              placeholderTextColor="#999"
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />

            {/* Toggle Post Notification */}
            <TouchableOpacity
              style={styles.toggleRow}
              onPress={() => setPostToTray(!postToTray)}
              activeOpacity={0.8}
            >
              <Feather
                name={postToTray ? "check-square" : "square"}
                size={18}
                color={postToTray ? colors.primary : colors.textSecondary}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.toggleTitle}>Display as Device System Notification</Text>
                <Text style={styles.toggleSub}>
                  Posts this notification into the phone&apos;s OS notification tray / lock screen.
                </Text>
              </View>
            </TouchableOpacity>

            {/* Submit Button */}
            <TouchableOpacity
              style={[styles.submitBtn, loading && { opacity: 0.6 }]}
              onPress={handleSend}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <>
                  <Feather
                    name={target === "phone" ? "send" : "radio"}
                    size={16}
                    color="#FFFFFF"
                    style={{ marginRight: 8 }}
                  />
                  <Text style={styles.submitBtnText}>
                    {target === "phone" ? "DISPATCH SMS" : "BROADCAST ANNOUNCEMENT"}
                  </Text>
                </>
              )}
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
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "flex-end",
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 22,
    paddingBottom: Platform.OS === "ios" ? 36 : 22,
    maxHeight: "88%",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  badge: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.primary,
    letterSpacing: 1.2,
    marginBottom: 2,
  },
  title: {
    fontSize: 19,
    fontWeight: "800",
    color: colors.text,
  },
  closeBtn: {
    padding: 4,
  },
  label: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    color: colors.textSecondary,
    marginBottom: 6,
    marginTop: 10,
  },
  channelRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
  },
  channelOption: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: "#F3F1EC",
    borderWidth: 1,
    borderColor: "#E5E1D8",
  },
  channelOptionActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  channelText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
  },
  channelTextActive: {
    color: "#FFFFFF",
  },
  hintBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FAF7F0",
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#EDE7D9",
    marginBottom: 6,
  },
  hintText: {
    flex: 1,
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  input: {
    backgroundColor: "#F8F7F4",
    borderWidth: 1,
    borderColor: "#E5E1D8",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    color: colors.text,
    marginBottom: 4,
  },
  textArea: {
    height: 90,
  },
  charCount: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 10,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginTop: 12,
    padding: 10,
    backgroundColor: "#FAF8F5",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#EDE8DF",
  },
  toggleTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.text,
  },
  toggleSub: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
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
});
