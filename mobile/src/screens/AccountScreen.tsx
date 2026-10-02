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

const PRESETS = [
  { id: "live", label: "Live Store", url: "https://laluxurys.com" },
  { id: "local", label: "Local PC", url: "http://192.168.3.225:3005" },
  { id: "emu", label: "Emulator", url: "http://10.0.2.2:3005" },
];

export function AccountScreen({
  user,
  onLoginSuccess,
  onLogout,
  onOpenBackend,
}: Props) {
  // Auth Form State
  const [authMode, setAuthMode] = useState<"LOGIN" | "REGISTER">("LOGIN");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [serverUrl, setServerUrl] = useState(api.getBaseUrl());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Customer Orders State
  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);

  const isOwner =
    user && ["OWNER", "ADMIN", "MANAGER", "STAFF"].includes(user.role);

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

  const handleSelectPreset = async (url: string) => {
    setServerUrl(url);
    await api.setBaseUrl(url);
    setError(null);
  };

  const handleQuickFillOwner = () => {
    setIdentifier("laluxurys@laluxurys.com");
    setPassword("Laluxurys#1");
    setError(null);
  };

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
      if (res.latestVersion === "1.2.2") {
        setUpdateStatus("You are running the latest version (v1.2.2).");
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
          <Text style={styles.updateCardSubtitle}>v1.2.2 (Build 3) &bull; Official Release</Text>
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
        currentVersion="1.2.2"
        onDismiss={() => setShowUpdateModal(false)}
      />
    </View>
  );

  const handleSubmit = async () => {
    setError(null);

    if (authMode === "LOGIN") {
      if (!identifier.trim() || !password) {
        setError("Please enter your email/phone and password.");
        return;
      }
      setLoading(true);
      try {
        if (serverUrl !== api.getBaseUrl()) {
          await api.setBaseUrl(serverUrl);
        }
        const res = await api.login(identifier.trim(), password);
        onLoginSuccess(res.user);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to sign in.";
        setError(msg);
      } finally {
        setLoading(false);
      }
    } else {
      // Registration
      if (!fullName.trim() || !identifier.trim() || !password) {
        setError("Please provide your full name, email/phone, and password.");
        return;
      }
      setLoading(true);
      try {
        if (serverUrl !== api.getBaseUrl()) {
          await api.setBaseUrl(serverUrl);
        }
        const isEmail = identifier.includes("@");
        const res = await api.register({
          name: fullName.trim(),
          email: isEmail ? identifier.trim() : undefined,
          phone: !isEmail ? identifier.trim() : undefined,
          password,
        });
        onLoginSuccess(res.user);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Registration failed.";
        setError(msg);
      } finally {
        setLoading(false);
      }
    }
  };

  // ---------------------------------------------------------------------------
  // If Logged In as OWNER / ADMIN / STAFF
  // ---------------------------------------------------------------------------
  if (user && isOwner) {
    return (
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.brandHeader}>
          <Text style={styles.brandTitle}>LALUXURY</Text>
          <Text style={styles.brandSubtitle}>ATELIER & LIVING</Text>
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
              {user.firstName || user.email?.split("@")[0] || "Store Owner"}
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
            Manage live products, real-time prices, warehouse stock, and view recent customer orders synced directly with LaLuxury.com.
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

        {/* Server & Connectivity Info */}
        <View style={styles.infoBox}>
          <Text style={styles.infoBoxTitle}>CONNECTED SERVER</Text>
          <Text style={styles.infoBoxValue}>{api.getBaseUrl()}</Text>
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
          <Text style={styles.brandTitle}>LALUXURY</Text>
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
              <View key={ord.id} style={styles.orderCard}>
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
              </View>
            ))}
          </View>
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
          <Text style={styles.brandTitle}>LALUXURY</Text>
          <Text style={styles.brandSubtitle}>ATELIER & LIVING</Text>
        </View>

        {/* Tab Toggle: Sign In vs Create Account */}
        <View style={styles.authToggle}>
          <TouchableOpacity
            style={[styles.toggleBtn, authMode === "LOGIN" && styles.toggleBtnActive]}
            onPress={() => {
              setAuthMode("LOGIN");
              setError(null);
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
            style={[
              styles.toggleBtn,
              authMode === "REGISTER" && styles.toggleBtnActive,
            ]}
            onPress={() => {
              setAuthMode("REGISTER");
              setError(null);
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

        {/* Form Card */}
        <View style={styles.authCard}>
          <Text style={styles.formTitle}>
            {authMode === "LOGIN"
              ? "Sign in to your account"
              : "Create customer account"}
          </Text>
          <Text style={styles.formSub}>
            {authMode === "LOGIN"
              ? "Enter your credentials to access your profile or store backend."
              : "Register to track orders, save delivery addresses, and purchase."}
          </Text>

          {error && (
            <View style={styles.errorBox}>
              <Feather name="alert-circle" size={14} color={colors.error} />
              <Text style={styles.errorBoxText}>{error}</Text>
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
            <Text style={styles.inputLabel}>EMAIL OR PHONE NUMBER</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. akua@example.com or 0241234567"
              placeholderTextColor={colors.textMuted}
              value={identifier}
              onChangeText={setIdentifier}
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
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          </View>

          <TouchableOpacity
            style={[styles.submitBtn, loading && { opacity: 0.7 }]}
            onPress={handleSubmit}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.submitBtnText}>
                {authMode === "LOGIN" ? "SIGN IN" : "CREATE ACCOUNT"}
              </Text>
            )}
          </TouchableOpacity>

          {/* Quick Fill for Owner Testing */}
          {authMode === "LOGIN" && (
            <TouchableOpacity
              style={styles.quickFillBtn}
              onPress={handleQuickFillOwner}
              activeOpacity={0.7}
            >
              <Feather name="key" size={13} color={colors.primary} />
              <Text style={styles.quickFillText}>
                Quick Fill Owner Account (laluxurys@laluxurys.com)
              </Text>
            </TouchableOpacity>
          )}

          {/* Server Preset Selection */}
          <View style={styles.serverRow}>
            <Text style={styles.serverLabel}>TARGET SERVER:</Text>
            <View style={styles.presetChips}>
              {PRESETS.map((p) => {
                const isSelected = serverUrl === p.url;
                return (
                  <TouchableOpacity
                    key={p.id}
                    style={[
                      styles.presetChip,
                      isSelected && styles.presetChipActive,
                    ]}
                    onPress={() => handleSelectPreset(p.url)}
                  >
                    <Text
                      style={[
                        styles.presetChipText,
                        isSelected && styles.presetChipTextActive,
                      ]}
                    >
                      {p.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>

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
  quickFillBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    gap: 6,
    marginBottom: 14,
  },
  quickFillText: {
    fontSize: 11,
    color: colors.primary,
    fontWeight: "700",
  },
  serverRow: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 12,
  },
  serverLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: colors.textSecondary,
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  presetChips: {
    flexDirection: "row",
    gap: 8,
  },
  presetChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: colors.border,
  },
  presetChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  presetChipText: {
    fontSize: 10,
    color: colors.textSecondary,
    fontWeight: "700",
  },
  presetChipTextActive: {
    color: "#FFFFFF",
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
});

