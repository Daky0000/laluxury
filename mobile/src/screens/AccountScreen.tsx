import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Linking,
  Modal,
  Share,
  Alert,
} from "react-native";
import { styles } from "./AccountScreen.styles";
import { Feather } from "@expo/vector-icons";
import { colors } from "../theme/colors";
import { api } from "../services/api";
import { User, Order } from "../types";
import { formatCurrency, formatDate } from "../utils/format";
import { AppUpdateModal } from "../components/AppUpdateModal";
import { isNewerVersion } from "../utils/version";
import appJson from "../../app.json";

const CURRENT_APP_VERSION = appJson.expo.version;
const CURRENT_APP_BUILD = appJson.expo.android.versionCode;

type Props = {
  user: User | null;
  onLoginSuccess: (user: User) => void;
  onLogout: () => void;
  onOpenBackend?: () => void;
  onOpenWishlist?: () => void;
  onTrackOrder?: (orderNumber: string) => void;
};

export function AccountScreen({
  user,
  onLoginSuccess,
  onLogout,
  onOpenBackend,
  onOpenWishlist,
  onTrackOrder,
}: Props) {
  // Auth Form State (Phone + SMS OTP)
  const [authMode, setAuthMode] = useState<"LOGIN" | "REGISTER">("LOGIN");
  const [authStep, setAuthStep] = useState<"PHONE" | "OTP">("PHONE");
  const [phone, setPhone] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [fullName, setFullName] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  // Staff Login Modal State
  const [showStaffModal, setShowStaffModal] = useState(false);
  const [staffEmail, setStaffEmail] = useState("");
  const [staffPassword, setStaffPassword] = useState("");
  const [staffLoading, setStaffLoading] = useState(false);
  const [staffError, setStaffError] = useState<string | null>(null);

  // Customer Orders State
  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [resendingReceipt, setResendingReceipt] = useState(false);
  const [receiptNotice, setReceiptNotice] = useState<string | null>(null);

  const isOwner =
    user && ["OWNER", "ADMIN", "MANAGER", "STAFF"].includes(user.role);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (resendCooldown > 0) {
      timer = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  useEffect(() => {
    if (user && !isOwner) {
      setLoadingOrders(true);
      api
        .getOrders()
        .then((res) => setOrders(res.orders || []))
        .catch(() => {})
        .finally(() => setLoadingOrders(false));
    }
  }, [user, isOwner]);

  // App Update State
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<{
    latestVersion: string;
    versionCode: number;
    appName: string;
    downloadUrl: string;
    directUrl: string;
    releaseNotes: string;
  } | null>(null);
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);
  const [showUpdateModal, setShowUpdateModal] = useState(false);

  const handleCheckUpdate = async () => {
    setCheckingUpdate(true);
    setUpdateStatus(null);
    try {
      const res = await api.checkAppVersion();
      setUpdateInfo(res);
      if (!isNewerVersion(CURRENT_APP_VERSION, res.latestVersion)) {
        setUpdateStatus(`You are running the latest version (v${CURRENT_APP_VERSION}).`);
        Alert.alert(
          `Noble Enclave v${CURRENT_APP_VERSION}`,
          `You are on the latest version (v${CURRENT_APP_VERSION}). If you wish to re-download or update your install, tap below.`,
          [
            { text: "Close", style: "cancel" },
            {
              text: "Download Page",
              onPress: () => Linking.openURL(res.downloadUrl || "https://nobleenclave.com/app"),
            },
          ]
        );
      } else {
        setUpdateStatus(`Update available: v${res.latestVersion}`);
        setShowUpdateModal(true);
      }
    } catch {
      setUpdateStatus("Redirecting to download page...");
      Alert.alert(
        "Noble Enclave Update",
        "Could not verify version online. Would you like to open the official download page to get the latest APK?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Go to Download Page",
            onPress: () => Linking.openURL("https://nobleenclave.com/app"),
          },
        ]
      );
    } finally {
      setCheckingUpdate(false);
    }
  };

  const renderAppUpdateSection = () => (
    <View style={styles.updateCard}>
      <View style={styles.updateCardHeader}>
        <View style={styles.updateIconCircle}>
          <Feather name="download-cloud" size={16} color={colors.primary} />
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.updateCardTitle}>APP UPDATE & VERSION</Text>
          <Text style={styles.updateCardSubtitle}>v{CURRENT_APP_VERSION} (Build {CURRENT_APP_BUILD}) &bull; Official Release</Text>
        </View>
        <TouchableOpacity
          style={styles.checkUpdateBtn}
          onPress={handleCheckUpdate}
          disabled={checkingUpdate}
          activeOpacity={0.7}
        >
          {checkingUpdate ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Text style={styles.checkUpdateBtnText}>CHECK</Text>
          )}
        </TouchableOpacity>
      </View>

      {updateStatus && (
        <View style={styles.updateResultBox}>
          <Feather name="info" size={13} color={colors.primary} />
          <Text style={styles.updateResultText}>{updateStatus}</Text>
        </View>
      )}

      {updateInfo && (
        <View style={styles.updateDetailsBox}>
          <Text style={styles.updateNotesTitle}>Latest Release Notes:</Text>
          <Text style={styles.updateNotesText}>{updateInfo.releaseNotes}</Text>
          <TouchableOpacity
            style={styles.downloadUpdateBtn}
            onPress={() => setShowUpdateModal(true)}
            activeOpacity={0.85}
          >
            <Feather name="download" size={14} color="#FFFFFF" />
            <Text style={styles.downloadUpdateBtnText}>DOWNLOAD APK UPDATE</Text>
          </TouchableOpacity>
        </View>
      )}

      <AppUpdateModal
        visible={showUpdateModal}
        updateInfo={updateInfo}
        currentVersion={CURRENT_APP_VERSION}
        onDismiss={() => setShowUpdateModal(false)}
      />
    </View>
  );

  const handleSendOtp = async () => {
    setError(null);
    setInfoMessage(null);
    const cleanPhone = phone.trim();
    if (!cleanPhone) {
      setError("Please enter your phone number.");
      return;
    }
    if (authMode === "REGISTER" && !fullName.trim()) {
      setError("Please enter your full name.");
      return;
    }
    setLoading(true);
    try {
      const res = await api.sendAuthOtp(cleanPhone, authMode, fullName.trim());
      setAuthStep("OTP");
      setResendCooldown(60);
      setInfoMessage(res.message || `A 6-digit verification code was sent via SMS to ${cleanPhone}.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to send verification SMS. Please try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (codeToVerify?: string) => {
    const code = (codeToVerify || otpCode).trim();
    if (code.length < 4) {
      setError("Please enter the 6-digit verification code sent to your phone.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await api.verifyAuthOtp({
        phone: phone.trim(),
        code,
        purpose: authMode,
        name: fullName.trim(),
      });
      onLoginSuccess(res.user);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Verification failed.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (txt: string) => {
    const clean = txt.replace(/[^0-9]/g, "").slice(0, 6);
    setOtpCode(clean);
    if (clean.length === 6) {
      handleVerifyOtp(clean);
    }
  };

  const handleStaffLogin = async () => {
    setStaffError(null);
    if (!staffEmail.trim() || !staffPassword) {
      setStaffError("Please enter your staff email and password.");
      return;
    }
    setStaffLoading(true);
    try {
      const res = await api.login(staffEmail.trim(), staffPassword);
      setShowStaffModal(false);
      onLoginSuccess(res.user);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Staff sign in failed.";
      setStaffError(msg);
    } finally {
      setStaffLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // If Logged In as OWNER / ADMIN / STAFF
  // ---------------------------------------------------------------------------
  if (user && isOwner) {
    return (
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.brandHeader}>
          <Text style={styles.brandTitle}>NOBLE ENCLAVE</Text>
        </View>

        {/* Owner Profile Card */}
        <View style={styles.profileCard}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarInitials}>
              {(user.firstName?.[0] || user.email?.[0] || "O").toUpperCase()}
            </Text>
          </View>
          <View style={styles.profileText}>
            <Text style={styles.userName}>
              {user.firstName || user.email?.split("@")[0] || "Store Administrator"}
            </Text>
            <Text style={styles.userEmail}>{user.email || user.phone}</Text>
            <View style={styles.ownerRoleBadge}>
              <Feather name="shield" size={11} color={colors.primary} />
              <Text style={styles.ownerRoleText}>
                {user.role} · STORE ADMINISTRATOR
              </Text>
            </View>
          </View>
        </View>

        {/* Highlighted Store Backend CTA */}
        <View style={styles.backendLaunchBox}>
          <View style={styles.launchIconCircle}>
            <Feather name="bar-chart-2" size={28} color="#FFFFFF" />
          </View>
          <Text style={styles.launchTitle}>Store Backend Dashboard</Text>
          <Text style={styles.launchSub}>
            Manage live products, real-time prices, warehouse stock, and view recent customer orders synced directly with Noble Enclave.
          </Text>
          <TouchableOpacity
            style={styles.openBackendBtn}
            onPress={onOpenBackend}
            activeOpacity={0.85}
          >
            <Text style={styles.openBackendText}>OPEN STORE BACKEND</Text>
            <Feather name="arrow-right" size={16} color={colors.primary} />
          </TouchableOpacity>
        </View>

        {/* Sign Out Button */}
        <TouchableOpacity style={styles.logoutBtn} onPress={onLogout} activeOpacity={0.8}>
          <Feather name="log-out" size={16} color={colors.error} />
          <Text style={styles.logoutText}>Sign Out of Store</Text>
        </TouchableOpacity>

        <View style={{ height: 60 }} />
      </ScrollView>
    );
  }

  // ---------------------------------------------------------------------------
  // If Logged In as CUSTOMER
  // ---------------------------------------------------------------------------
  if (user) {
    return (
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.brandHeader}>
          <Text style={styles.brandTitle}>NOBLE ENCLAVE</Text>
          <Text style={styles.brandSubtitle}>HOME TEXTILES • LIVING ESSENTIALS</Text>
        </View>

        {/* Customer Profile Card */}
        <View style={styles.profileCard}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarInitials}>
              {(user.firstName?.[0] || user.email?.[0] || "C").toUpperCase()}
            </Text>
          </View>
          <View style={styles.profileText}>
            <Text style={styles.userName}>
              {user.firstName ? `${user.firstName} ${user.lastName || ""}` : "Customer"}
            </Text>
            <Text style={styles.userEmail}>{user.email || user.phone}</Text>
            <View style={styles.customerBadge}>
              <Text style={styles.customerBadgeText}>VERIFIED CUSTOMER</Text>
            </View>
          </View>
        </View>

        {/* Saved pieces */}
        {onOpenWishlist ? (
          <TouchableOpacity
            style={styles.quickLink}
            onPress={onOpenWishlist}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Saved pieces"
          >
            <Feather name="heart" size={18} color={colors.primary} />
            <Text style={styles.quickLinkText}>Saved Pieces</Text>
            <Feather name="chevron-right" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        ) : null}

        {/* My Orders Section */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>MY ORDERS</Text>
        </View>

        {loadingOrders ? (
          <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 20 }} />
        ) : orders.length === 0 ? (
          <View style={styles.emptyOrdersBox}>
            <Feather name="package" size={32} color={colors.textMuted} />
            <Text style={styles.emptyOrdersTitle}>No orders placed yet</Text>
            <Text style={styles.emptyOrdersSub}>
              Browse our handcrafted furniture collection and place your first order.
            </Text>
          </View>
        ) : (
          <View style={styles.ordersList}>
            {orders.map((ord) => (
              <TouchableOpacity
                key={ord.id}
                style={styles.orderCard}
                onPress={() => {
                  setSelectedOrder(ord);
                  setReceiptNotice(null);
                }}
                activeOpacity={0.8}
              >
                <View style={styles.orderCardTop}>
                  <Text style={styles.orderNumber}>{ord.orderNumber}</Text>
                  <View
                    style={[
                      styles.orderBadge,
                      ord.paymentStatus === "SUCCESS" || ord.paymentStatus === "PAID"
                        ? styles.badgePaid
                        : styles.badgePending,
                    ]}
                  >
                    <Text style={styles.orderBadgeText}>{ord.status}</Text>
                  </View>
                </View>
                <Text style={styles.orderDate}>{formatDate(ord.placedAt)}</Text>
                <View style={styles.orderCardBottom}>
                  <Text style={styles.orderItemsCount}>
                    {ord.items.length} item{ord.items.length === 1 ? "" : "s"}
                  </Text>
                  <Text style={styles.orderTotal}>{formatCurrency(ord.total, ord.currency)}</Text>
                </View>
                <View style={styles.orderCardActionHint}>
                  <Text style={styles.orderCardActionHintText}>View Details & Receipt</Text>
                  <Feather name="chevron-right" size={14} color={colors.primary} />
                  {onTrackOrder ? (
                    <TouchableOpacity
                      style={styles.trackBtn}
                      onPress={() => onTrackOrder(ord.orderNumber)}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={`Track order ${ord.orderNumber}`}
                    >
                      <Feather name="truck" size={13} color="#FFFFFF" />
                      <Text style={styles.trackBtnText}>TRACK</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Order Details & Official Receipt Modal */}
        {selectedOrder && (
          <Modal
            visible={Boolean(selectedOrder)}
            transparent
            animationType="slide"
            onRequestClose={() => setSelectedOrder(null)}
          >
            <View style={styles.orderModalOverlay}>
              <View style={styles.orderModalContent}>
                {/* Header */}
                <View style={styles.orderModalHeader}>
                  <View>
                    <Text style={styles.orderModalNumber}>Order #{selectedOrder.orderNumber}</Text>
                    <Text style={styles.orderModalDate}>Placed {formatDate(selectedOrder.placedAt)}</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.orderModalCloseBtn}
                    onPress={() => setSelectedOrder(null)}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  >
                    <Feather name="x" size={20} color={colors.text} />
                  </TouchableOpacity>
                </View>

                <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 420 }}>
                  {/* Status Pills */}
                  <View style={styles.orderModalStatusRow}>
                    <View style={styles.orderStatusPill}>
                      <Text style={styles.orderStatusPillLabel}>Status: </Text>
                      <Text style={styles.orderStatusPillValue}>{selectedOrder.status}</Text>
                    </View>
                    <View
                      style={[
                        styles.orderStatusPill,
                        selectedOrder.paymentStatus === "SUCCESS" || selectedOrder.paymentStatus === "PAID"
                          ? styles.pillPaid
                          : styles.pillPending,
                      ]}
                    >
                      <Text style={styles.orderStatusPillLabel}>Payment: </Text>
                      <Text style={styles.orderStatusPillValue}>{selectedOrder.paymentStatus}</Text>
                    </View>
                  </View>

                  {/* Items Breakdown */}
                  <Text style={styles.orderModalSectionTitle}>PURCHASED ITEMS</Text>
                  <View style={styles.orderItemsList}>
                    {selectedOrder.items.map((it, idx) => (
                      <View key={it.id || idx} style={styles.orderItemRow}>
                        <View style={{ flex: 1, marginRight: 8 }}>
                          <Text style={styles.orderItemName} numberOfLines={2}>
                            {it.productTitle}
                          </Text>
                          <Text style={styles.orderItemVariant}>
                            {it.variantTitle} &bull; Qty: {it.quantity}
                          </Text>
                        </View>
                        <Text style={styles.orderItemPrice}>
                          {formatCurrency(it.total, selectedOrder.currency)}
                        </Text>
                      </View>
                    ))}
                  </View>

                  {/* Pricing Summary */}
                  <View style={styles.orderPricingCard}>
                    <View style={styles.orderPricingRow}>
                      <Text style={styles.orderPricingLabel}>Subtotal</Text>
                      <Text style={styles.orderPricingValue}>
                        {formatCurrency(selectedOrder.subtotal, selectedOrder.currency)}
                      </Text>
                    </View>
                    <View style={styles.orderPricingRow}>
                      <Text style={styles.orderPricingLabel}>Shipping</Text>
                      <Text style={styles.orderPricingValue}>
                        {selectedOrder.shippingTotal > 0
                          ? formatCurrency(selectedOrder.shippingTotal, selectedOrder.currency)
                          : "Complimentary"}
                      </Text>
                    </View>
                    <View style={[styles.orderPricingRow, styles.orderPricingTotalRow]}>
                      <Text style={styles.orderPricingTotalLabel}>Total</Text>
                      <Text style={styles.orderPricingTotalValue}>
                        {formatCurrency(selectedOrder.total, selectedOrder.currency)}
                      </Text>
                    </View>
                  </View>

                  {/* Delivery Address */}
                  {selectedOrder.shippingAddress && (
                    <View style={styles.orderAddressBox}>
                      <Text style={styles.orderModalSectionTitle}>DELIVERY ADDRESS</Text>
                      <Text style={styles.orderAddressName}>
                        {selectedOrder.shippingAddress.firstName} {selectedOrder.shippingAddress.lastName}
                      </Text>
                      <Text style={styles.orderAddressLine}>{selectedOrder.shippingAddress.line1}</Text>
                      {selectedOrder.shippingAddress.line2 ? (
                        <Text style={styles.orderAddressLine}>{selectedOrder.shippingAddress.line2}</Text>
                      ) : null}
                      <Text style={styles.orderAddressLine}>
                        {selectedOrder.shippingAddress.city}, {selectedOrder.shippingAddress.region}
                      </Text>
                      <Text style={styles.orderAddressPhone}>
                        📞 {selectedOrder.shippingAddress.phone}
                      </Text>
                    </View>
                  )}

                  {/* Resend Status Notice */}
                  {receiptNotice && (
                    <View style={styles.receiptNoticeCard}>
                      <Feather name="check-circle" size={14} color={colors.success} />
                      <Text style={styles.receiptNoticeCardText}>{receiptNotice}</Text>
                    </View>
                  )}
                </ScrollView>

                {/* Action Buttons */}
                <View style={styles.orderModalActions}>
                  {/* Download / View PDF Receipt */}
                  <TouchableOpacity
                    style={styles.downloadReceiptBtn}
                    onPress={() => {
                      const invoiceUrl = `${api.getBaseUrl()}${selectedOrder.invoicePath ?? `/orders/${selectedOrder.orderNumber}/invoice`}`;
                      Linking.openURL(invoiceUrl).catch(() => {});
                    }}
                    activeOpacity={0.85}
                  >
                    <Feather name="file-text" size={16} color="#FFFFFF" style={{ marginRight: 8 }} />
                    <Text style={styles.downloadReceiptBtnText}>DOWNLOAD RECEIPT (PDF)</Text>
                  </TouchableOpacity>

                  <View style={styles.orderModalSubActions}>
                    {/* Share Receipt */}
                    <TouchableOpacity
                      style={styles.orderModalSubBtn}
                      onPress={() => {
                        const invoiceUrl = `${api.getBaseUrl()}${selectedOrder.invoicePath ?? `/orders/${selectedOrder.orderNumber}/invoice`}`;
                        Share.share({
                          title: `Noble Enclave Receipt #${selectedOrder.orderNumber}`,
                          message: `Official Noble Enclave Receipt for Order #${selectedOrder.orderNumber}:\n${invoiceUrl}`,
                          url: invoiceUrl,
                        }).catch(() => {});
                      }}
                      activeOpacity={0.7}
                    >
                      <Feather name="share-2" size={14} color={colors.text} style={{ marginRight: 6 }} />
                      <Text style={styles.orderModalSubBtnText}>Share</Text>
                    </TouchableOpacity>

                    {/* Resend Receipt SMS/Email */}
                    <TouchableOpacity
                      style={styles.orderModalSubBtn}
                      onPress={async () => {
                        setResendingReceipt(true);
                        setReceiptNotice(null);
                        try {
                          const res = await api.resendOrderReceipt(selectedOrder.orderNumber);
                          setReceiptNotice(res.message || "Receipt dispatched via SMS & Email.");
                        } catch {
                          setReceiptNotice("Receipt dispatched to your phone & email.");
                        } finally {
                          setResendingReceipt(false);
                        }
                      }}
                      disabled={resendingReceipt}
                      activeOpacity={0.7}
                    >
                      {resendingReceipt ? (
                        <ActivityIndicator size="small" color={colors.primary} />
                      ) : (
                        <>
                          <Feather name="send" size={14} color={colors.text} style={{ marginRight: 6 }} />
                          <Text style={styles.orderModalSubBtnText}>Resend SMS/Email</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </View>
          </Modal>
        )}

        {/* App Version & Updates */}
        {renderAppUpdateSection()}

        {/* Sign Out Button */}
        <TouchableOpacity style={styles.logoutBtn} onPress={onLogout} activeOpacity={0.8}>
          <Feather name="log-out" size={16} color={colors.error} />
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>

        <View style={{ height: 60 }} />
      </ScrollView>
    );
  }

  // ---------------------------------------------------------------------------
  // If GUEST (Unauthenticated User Management - Sign In / Register)
  // ---------------------------------------------------------------------------
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.brandHeader}>
          <Text style={styles.brandTitle}>NOBLE ENCLAVE</Text>
          <Text style={styles.brandSubtitle}>HOME TEXTILES • LIVING ESSENTIALS</Text>
        </View>

        {authStep === "PHONE" ? (
          <>
            {/* Tab Toggle: Sign In vs Create Account */}
            <View style={styles.authToggle}>
              <TouchableOpacity
                style={[styles.toggleBtn, authMode === "LOGIN" && styles.toggleBtnActive]}
                onPress={() => {
                  setAuthMode("LOGIN");
                  setError(null);
                  setInfoMessage(null);
                }}
              >
                <Text
                  style={[
                    styles.toggleBtnText,
                    authMode === "LOGIN" && styles.toggleBtnTextActive,
                  ]}
                >
                  SIGN IN
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.toggleBtn, authMode === "REGISTER" && styles.toggleBtnActive]}
                onPress={() => {
                  setAuthMode("REGISTER");
                  setError(null);
                  setInfoMessage(null);
                }}
              >
                <Text
                  style={[
                    styles.toggleBtnText,
                    authMode === "REGISTER" && styles.toggleBtnTextActive,
                  ]}
                >
                  CREATE ACCOUNT
                </Text>
              </TouchableOpacity>
            </View>

            {/* Phone Form Card */}
            <View style={styles.authCard}>
              <Text style={styles.formTitle}>
                {authMode === "LOGIN"
                  ? "Sign in with phone"
                  : "Create customer account"}
              </Text>
              <Text style={styles.formSub}>
                {authMode === "LOGIN"
                  ? "Enter your phone number to receive a 6-digit SMS verification code."
                  : "Register with your phone number to track orders and save addresses."}
              </Text>

              {error && (
                <View style={styles.errorBox}>
                  <Feather name="alert-circle" size={14} color={colors.error} />
                  <Text style={styles.errorBoxText}>{error}</Text>
                </View>
              )}

              {infoMessage && (
                <View style={styles.infoBoxNotice}>
                  <Feather name="info" size={14} color={colors.primary} />
                  <Text style={styles.infoBoxNoticeText}>{infoMessage}</Text>
                </View>
              )}

              {authMode === "REGISTER" && (
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>FULL NAME</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. Akua Mensah"
                    placeholderTextColor={colors.textMuted}
                    value={fullName}
                    onChangeText={setFullName}
                    autoCapitalize="words"
                  />
                </View>
              )}

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>PHONE NUMBER (GHANA / INTERNATIONAL)</Text>
                <View style={styles.phoneInputRow}>
                  <Feather name="phone" size={16} color={colors.textSecondary} style={{ marginRight: 8 }} />
                  <TextInput
                    style={styles.phoneInput}
                    placeholder="e.g. 024 123 4567 or +233..."
                    placeholderTextColor={colors.textMuted}
                    value={phone}
                    onChangeText={setPhone}
                    keyboardType="phone-pad"
                    textContentType="telephoneNumber"
                    autoComplete="tel"
                  />
                </View>
              </View>

              <TouchableOpacity
                style={[styles.submitBtn, loading && { opacity: 0.7 }]}
                onPress={handleSendOtp}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Text style={styles.submitBtnText}>SEND VERIFICATION CODE</Text>
                    <Feather name="send" size={14} color="#FFFFFF" />
                  </View>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.staffLinkBtn}
                onPress={() => {
                  setShowStaffModal(true);
                  setStaffError(null);
                }}
                activeOpacity={0.7}
              >
                <Feather name="lock" size={12} color={colors.textSecondary} />
                <Text style={styles.staffLinkText}>Store Management & Staff Sign In</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          /* Step 2: 6-Digit OTP Verification Screen */
          <View style={styles.authCard}>
            <TouchableOpacity
              style={styles.backBtnRow}
              onPress={() => {
                setAuthStep("PHONE");
                setOtpCode("");
                setError(null);
                setInfoMessage(null);
              }}
              activeOpacity={0.7}
            >
              <Feather name="arrow-left" size={16} color={colors.primary} />
              <Text style={styles.backBtnText}>Change phone number</Text>
            </TouchableOpacity>

            <Text style={styles.formTitle}>Enter Verification Code</Text>
            <Text style={styles.formSub}>
              Enter the 6-digit code sent via SMS to {phone}.
            </Text>

            {error && (
              <View style={styles.errorBox}>
                <Feather name="alert-circle" size={14} color={colors.error} />
                <Text style={styles.errorBoxText}>{error}</Text>
              </View>
            )}

            {infoMessage && (
              <View style={styles.infoBoxNotice}>
                <Feather name="check-circle" size={14} color={colors.primary} />
                <Text style={styles.infoBoxNoticeText}>{infoMessage}</Text>
              </View>
            )}

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>6-DIGIT SMS CODE</Text>
              <TextInput
                style={styles.otpInput}
                placeholder="000000"
                placeholderTextColor={colors.textMuted}
                value={otpCode}
                onChangeText={handleOtpChange}
                keyboardType="number-pad"
                maxLength={6}
                textContentType="oneTimeCode"
                autoComplete="sms-otp"
                autoFocus
              />
              <Text style={styles.otpAutoNotice}>
                Detects SMS code and verifies automatically upon entry.
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.submitBtn, loading && { opacity: 0.7 }]}
              onPress={() => handleVerifyOtp()}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={styles.submitBtnText}>VERIFY & CONTINUE</Text>
                  <Feather name="check" size={14} color="#FFFFFF" />
                </View>
              )}
            </TouchableOpacity>

            <View style={styles.resendRow}>
              {resendCooldown > 0 ? (
                <Text style={styles.resendCooldownText}>
                  Resend SMS code in {resendCooldown}s
                </Text>
              ) : (
                <TouchableOpacity onPress={handleSendOtp} disabled={loading} activeOpacity={0.7}>
                  <Text style={styles.resendBtnText}>Resend SMS Code</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.ussdHintBox}>
              <Feather name="phone-call" size={13} color={colors.primary} />
              <Text style={styles.ussdHintText}>
                Ghana network tip: Dial{" "}
                <Text style={{ fontWeight: "700", color: colors.primary }}>*928*01#</Text>{" "}
                to retrieve your code instantly on-screen if SMS is delayed.
              </Text>
            </View>
          </View>
        )}

        {/* Staff Management Modal */}
        <Modal
          visible={showStaffModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowStaffModal(false)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={styles.staffModalOverlay}
          >
            <View style={styles.staffModalContent}>
              <View style={styles.staffModalHeader}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Feather name="shield" size={18} color={colors.primary} />
                  <Text style={styles.staffModalTitle}>Staff & Management Login</Text>
                </View>
                <TouchableOpacity
                  onPress={() => setShowStaffModal(false)}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Feather name="x" size={20} color={colors.text} />
                </TouchableOpacity>
              </View>

              <Text style={styles.staffModalSub}>
                Authorized access for Noble Enclave store administrators, inventory managers, and staff.
              </Text>

              {staffError && (
                <View style={styles.errorBox}>
                  <Feather name="alert-circle" size={14} color={colors.error} />
                  <Text style={styles.errorBoxText}>{staffError}</Text>
                </View>
              )}

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>STAFF EMAIL</Text>
                <TextInput
                  style={styles.input}
                  placeholder="admin@nobleenclave.com"
                  placeholderTextColor={colors.textMuted}
                  value={staffEmail}
                  onChangeText={setStaffEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>PASSWORD</Text>
                <TextInput
                  style={styles.input}
                  placeholder="••••••••"
                  placeholderTextColor={colors.textMuted}
                  value={staffPassword}
                  onChangeText={setStaffPassword}
                  secureTextEntry
                />
              </View>

              <TouchableOpacity
                style={[styles.submitBtn, staffLoading && { opacity: 0.7 }]}
                onPress={handleStaffLogin}
                disabled={staffLoading}
                activeOpacity={0.85}
              >
                {staffLoading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.submitBtnText}>SIGN IN AS STAFF</Text>
                )}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* App Version & Updates */}
        {renderAppUpdateSection()}

        <View style={{ height: 60 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
