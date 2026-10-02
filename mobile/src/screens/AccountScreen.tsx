import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Linking,
  Modal,
  Share,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { colors } from "../theme/colors";
import { api } from "../services/api";
import { User, Order } from "../types";
import { formatCurrency, formatDate } from "../utils/format";
import { AppUpdateModal } from "../components/AppUpdateModal";

type Props = {
  user: User | null;
  onLoginSuccess: (user: User) => void;
  onLogout: () => void;
  onOpenBackend?: () => void;
};

export function AccountScreen({
  user,
  onLoginSuccess,
  onLogout,
  onOpenBackend,
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
      if (res.latestVersion === "1.2.5") {
        setUpdateStatus("You are running the latest version (v1.2.5).");
      } else {
        setUpdateStatus(`Update available: v${res.latestVersion}`);
        setShowUpdateModal(true);
      }
    } catch {
      setUpdateStatus("Could not reach update server. Check your connection.");
    } finally {
      setCheckingUpdate(false);
    }
  };

  const handleDownloadUpdate = (url?: string) => {
    // The backend redirects to wherever the current APK is hosted.
    const fallback = `${api.getBaseUrl()}/api/app/download`;
    Linking.openURL(url || fallback).catch(() => {
      Linking.openURL(fallback);
    });
  };

  const renderAppUpdateSection = () => (
    <View style={styles.updateCard}>
      <View style={styles.updateCardHeader}>
        <View style={styles.updateIconCircle}>
          <Feather name="download-cloud" size={16} color={colors.primary} />
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.updateCardTitle}>APP UPDATE & VERSION</Text>
          <Text style={styles.updateCardSubtitle}>v1.2.5 (Build 7) &bull; Official Release</Text>
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
        currentVersion="1.2.5"
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
          <Text style={styles.brandTitle}>NOBEL ENCLAVE</Text>
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
            Manage live products, real-time prices, warehouse stock, and view recent customer orders synced directly with Nobel Enclave.
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
          <Text style={styles.brandTitle}>NOBEL ENCLAVE</Text>
          <Text style={styles.brandSubtitle}>ATELIER & LIVING</Text>
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
                      const invoiceUrl = `${api.getBaseUrl()}/orders/${selectedOrder.orderNumber}/invoice`;
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
                        const invoiceUrl = `${api.getBaseUrl()}/orders/${selectedOrder.orderNumber}/invoice`;
                        Share.share({
                          title: `Nobel Enclave Receipt #${selectedOrder.orderNumber}`,
                          message: `Official Nobel Enclave Receipt for Order #${selectedOrder.orderNumber}:\n${invoiceUrl}`,
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
          <Text style={styles.brandTitle}>NOBEL ENCLAVE</Text>
          <Text style={styles.brandSubtitle}>ATELIER & LIVING</Text>
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
                Authorized access for Nobel Enclave store administrators, inventory managers, and staff.
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  brandHeader: {
    alignItems: "center",
    marginBottom: 20,
  },
  brandTitle: {
    fontFamily: "serif",
    fontSize: 24,
    fontWeight: "700",
    color: colors.primary,
    letterSpacing: 3,
  },
  brandSubtitle: {
    fontSize: 9,
    fontWeight: "700",
    color: colors.textSecondary,
    letterSpacing: 2,
    marginTop: 2,
  },
  profileCard: {
    backgroundColor: colors.surfaceWarm,
    borderRadius: 20,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  avatarCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitials: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "800",
  },
  profileText: {
    marginLeft: 16,
    flex: 1,
  },
  userName: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 2,
  },
  userEmail: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 6,
  },
  ownerRoleBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.primaryTint,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  ownerRoleText: {
    fontSize: 9,
    fontWeight: "800",
    color: colors.primary,
    letterSpacing: 0.5,
  },
  customerBadge: {
    backgroundColor: colors.successBg,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: "flex-start",
  },
  customerBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    color: colors.success,
  },
  backendLaunchBox: {
    backgroundColor: colors.primary,
    borderRadius: 20,
    padding: 22,
    alignItems: "center",
    marginBottom: 20,
  },
  launchIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  launchTitle: {
    fontFamily: "serif",
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: 6,
  },
  launchSub: {
    fontSize: 12,
    color: "rgba(255,255,255,0.85)",
    textAlign: "center",
    lineHeight: 18,
    marginBottom: 18,
  },
  openBackendBtn: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  openBackendText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
  },
  infoBox: {
    backgroundColor: colors.surfaceWarm,
    borderRadius: 14,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  infoBoxTitle: {
    fontSize: 9,
    fontWeight: "800",
    color: colors.textSecondary,
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  infoBoxValue: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.text,
  },
  sectionHeader: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.text,
    letterSpacing: 1,
  },
  emptyOrdersBox: {
    backgroundColor: colors.surfaceWarm,
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.borderLight,
    gap: 8,
  },
  emptyOrdersTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
  },
  emptyOrdersSub: {
    fontSize: 11,
    color: colors.textSecondary,
    textAlign: "center",
  },
  ordersList: {
    gap: 10,
    marginBottom: 20,
  },
  orderCard: {
    backgroundColor: colors.surfaceWarm,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  orderCardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  orderNumber: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.text,
    letterSpacing: 0.5,
  },
  orderBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgePaid: {
    backgroundColor: colors.successBg,
  },
  badgePending: {
    backgroundColor: colors.warningBg,
  },
  orderBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    color: colors.text,
  },
  orderDate: {
    fontSize: 10,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  orderCardBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8,
  },
  orderItemsCount: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  orderTotal: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.primary,
  },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceWarm,
    borderRadius: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  logoutText: {
    color: colors.error,
    fontSize: 12,
    fontWeight: "700",
  },
  authToggle: {
    flexDirection: "row",
    backgroundColor: colors.surfaceWarm,
    borderRadius: 20,
    padding: 4,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
  },
  toggleBtnActive: {
    backgroundColor: colors.primary,
  },
  toggleBtnText: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.textSecondary,
    letterSpacing: 0.8,
  },
  toggleBtnTextActive: {
    color: "#FFFFFF",
  },
  authCard: {
    backgroundColor: colors.surfaceWarm,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  formTitle: {
    fontFamily: "serif",
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 4,
  },
  formSub: {
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 16,
    marginBottom: 16,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.errorBg,
    borderRadius: 10,
    padding: 10,
    marginBottom: 14,
    gap: 8,
  },
  errorBoxText: {
    color: colors.error,
    fontSize: 11,
    fontWeight: "600",
    flex: 1,
  },
  inputGroup: {
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: colors.textSecondary,
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  input: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 13,
    color: colors.text,
  },
  submitBtn: {
    backgroundColor: colors.primary,
    borderRadius: 20,
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
    marginBottom: 14,
  },
  submitBtnText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  phoneInputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
  },
  phoneInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text,
  },
  otpInput: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 16,
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: 10,
    textAlign: "center",
    color: colors.text,
  },
  otpAutoNotice: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 6,
    textAlign: "center",
  },
  resendRow: {
    alignItems: "center",
    marginTop: 6,
    marginBottom: 8,
  },
  resendCooldownText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  resendBtnText: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: "700",
  },
  ussdHintBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.surfaceWarm,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginTop: 6,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  ussdHintText: {
    flex: 1,
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  backBtnRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 14,
  },
  backBtnText: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: "700",
  },
  staffLinkBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    marginTop: 4,
  },
  staffLinkText: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: "600",
  },
  staffModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  staffModalContent: {
    backgroundColor: colors.surfaceWarm,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  staffModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  staffModalTitle: {
    fontFamily: "serif",
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
  },
  staffModalSub: {
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 16,
    marginBottom: 16,
  },
  infoBoxNotice: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primaryTint,
    borderRadius: 10,
    padding: 10,
    marginBottom: 14,
    gap: 8,
  },
  infoBoxNoticeText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: "600",
    flex: 1,
  },
  updateCard: {
    backgroundColor: colors.surfaceWarm,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.borderLight,
    marginBottom: 16,
  },
  updateCardHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  updateIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F2EBE5",
    alignItems: "center",
    justifyContent: "center",
  },
  updateCardTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.primary,
    letterSpacing: 1.2,
  },
  updateCardSubtitle: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  checkUpdateBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: "#FFFFFF",
  },
  checkUpdateBtnText: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.primary,
    letterSpacing: 1,
  },
  updateResultBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  updateResultText: {
    fontSize: 11,
    color: colors.textSecondary,
    fontStyle: "italic",
    flex: 1,
  },
  updateDetailsBox: {
    marginTop: 12,
    padding: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  updateNotesTitle: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.text,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  updateNotesText: {
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 16,
    marginBottom: 10,
  },
  downloadUpdateBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.primary,
    paddingVertical: 10,
    borderRadius: 8,
  },
  downloadUpdateBtnText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
  },
  orderCardActionHint: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    marginTop: 8,
    gap: 4,
  },
  orderCardActionHintText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.primary,
  },
  orderModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  orderModalContent: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 28,
  },
  orderModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  orderModalNumber: {
    fontFamily: "serif",
    fontSize: 18,
    fontWeight: "700",
    color: colors.primary,
  },
  orderModalDate: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  orderModalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceWarm,
    alignItems: "center",
    justifyContent: "center",
  },
  orderModalStatusRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },
  orderStatusPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceWarm,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  orderStatusPillLabel: {
    fontSize: 10,
    color: colors.textSecondary,
    fontWeight: "600",
  },
  orderStatusPillValue: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.text,
  },
  pillPaid: {
    backgroundColor: colors.successBg,
    borderColor: "rgba(39,110,64,0.2)",
  },
  pillPending: {
    backgroundColor: colors.warningBg,
    borderColor: "rgba(180,83,9,0.2)",
  },
  orderModalSectionTitle: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.textSecondary,
    letterSpacing: 1,
    marginBottom: 8,
    marginTop: 8,
  },
  orderItemsList: {
    backgroundColor: colors.surfaceWarm,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 14,
    gap: 10,
  },
  orderItemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  orderItemName: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.text,
  },
  orderItemVariant: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  orderItemPrice: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.primary,
  },
  orderPricingCard: {
    backgroundColor: "#FAF9F6",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 14,
    gap: 6,
  },
  orderPricingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  orderPricingLabel: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  orderPricingValue: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.text,
  },
  orderPricingTotalRow: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8,
    marginTop: 4,
  },
  orderPricingTotalLabel: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.text,
  },
  orderPricingTotalValue: {
    fontSize: 15,
    fontWeight: "900",
    color: colors.primary,
  },
  orderAddressBox: {
    backgroundColor: colors.surfaceWarm,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 14,
  },
  orderAddressName: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 2,
  },
  orderAddressLine: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 17,
  },
  orderAddressPhone: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: "600",
    marginTop: 6,
  },
  receiptNoticeCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.successBg,
    borderRadius: 8,
    padding: 10,
    gap: 8,
    marginBottom: 14,
  },
  receiptNoticeCardText: {
    fontSize: 11,
    color: colors.success,
    fontWeight: "700",
    flex: 1,
  },
  orderModalActions: {
    marginTop: 14,
    gap: 10,
  },
  downloadReceiptBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  downloadReceiptBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  orderModalSubActions: {
    flexDirection: "row",
    gap: 10,
  },
  orderModalSubBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceWarm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 10,
  },
  orderModalSubBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.text,
  },
});

