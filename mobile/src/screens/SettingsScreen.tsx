import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Linking,
} from "react-native";
import { colors } from "../theme/colors";
import { api } from "../services/api";
import { User } from "../types";
import { AppUpdateModal, AppUpdateInfo } from "../components/AppUpdateModal";
import appJson from "../../app.json";

const CURRENT_APP_VERSION = appJson.expo.version;
const CURRENT_APP_BUILD = appJson.expo.android.versionCode;

type Props = {
  user: User;
  onLogout: () => void;
};

export function SettingsScreen({ user, onLogout }: Props) {
  const [serverUrl, setServerUrl] = useState(api.getBaseUrl());
  const [testing, setTesting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [updateInfo, setUpdateInfo] = useState<AppUpdateInfo | null>(null);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  const handleCheckUpdate = async () => {
    setCheckingUpdate(true);
    try {
      const res = await api.checkAppVersion();
      setUpdateInfo(res);
      if (res.latestVersion === CURRENT_APP_VERSION) {
        Alert.alert(
          `Noble Enclave v${CURRENT_APP_VERSION}`,
          `Your app is running the latest version (v${CURRENT_APP_VERSION}). If you would like to re-download or update your install, tap below.`,
          [
            { text: "OK", style: "cancel" },
            {
              text: "Download Page",
              onPress: () => Linking.openURL(res.downloadUrl || "https://nobleenclave.com/app"),
            },
          ]
        );
      } else {
        setShowUpdateModal(true);
      }
    } catch {
      Alert.alert(
        "Noble Enclave Update",
        "Could not verify version online. Would you like to open the official download page to get the latest APK?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Open Download Page",
            onPress: () => Linking.openURL("https://nobleenclave.com/app"),
          },
        ]
      );
    } finally {
      setCheckingUpdate(false);
    }
  };

  const handleSaveAndTest = async () => {
    setTesting(true);
    setStatusMessage(null);
    try {
      await api.setBaseUrl(serverUrl);
      const res = await api.getMe();
      setStatusMessage(`Connected successfully to ${res.user.email || res.user.role}!`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Connection failed";
      Alert.alert("Connection Error", msg);
    } finally {
      setTesting(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings & Preferences</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* User Card */}
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>AUTHENTICATED STAFF</Text>
          <Text style={styles.userName}>
            {user.firstName ? `${user.firstName} ${user.lastName || ""}` : user.email}
          </Text>
          <Text style={styles.userRoleBadge}>{user.role} ACCOUNT</Text>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Email:</Text>
            <Text style={styles.infoVal}>{user.email || "None"}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Phone:</Text>
            <Text style={styles.infoVal}>{user.phone || "None"}</Text>
          </View>
        </View>

        {/* Server Connection */}
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>STORE BACKEND CONNECTION</Text>
          <Text style={styles.subText}>
            Point this app to your local PC dev server or live production store.
          </Text>

          {statusMessage ? (
            <View style={styles.successBanner}>
              <Text style={styles.successText}>{statusMessage}</Text>
            </View>
          ) : null}

          <TextInput
            style={styles.serverInput}
            value={serverUrl}
            onChangeText={setServerUrl}
            placeholder="http://192.168.1.X:3005"
            placeholderTextColor={colors.textSubtle}
            autoCapitalize="none"
          />

          <TouchableOpacity
            style={[styles.testBtn, testing && styles.btnDisabled]}
            onPress={handleSaveAndTest}
            disabled={testing}
          >
            {testing ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={styles.testBtnText}>Test & Save Server URL</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Seamless Web Sync Shortcuts */}
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>WEB STORE SHORTCUTS</Text>
          <Text style={styles.subText}>
            Quickly jump to the live website or web back-office console.
          </Text>

          <TouchableOpacity
            style={styles.webLinkBtn}
            onPress={() => Linking.openURL(api.getBaseUrl())}
          >
            <Text style={styles.webLinkIcon}>🌐</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.webLinkTitle}>Open Customer Storefront</Text>
              <Text style={styles.webLinkUrl}>{api.getBaseUrl()}</Text>
            </View>
            <Text style={styles.webLinkArrow}>↗</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.webLinkBtn, { marginTop: 8 }]}
            onPress={() => Linking.openURL(`${api.getBaseUrl()}/admin`)}
          >
            <Text style={styles.webLinkIcon}>🛡️</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.webLinkTitle}>Open Web Admin Console</Text>
              <Text style={styles.webLinkUrl}>{api.getBaseUrl()}/admin</Text>
            </View>
            <Text style={styles.webLinkArrow}>↗</Text>
          </TouchableOpacity>
        </View>

        {/* About App */}
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>ABOUT NOBLE ENCLAVE</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Version:</Text>
            <Text style={styles.infoVal}>{CURRENT_APP_VERSION} (Build {CURRENT_APP_BUILD} - Official)</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Platform:</Text>
            <Text style={styles.infoVal}>React Native / Expo Android</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Sync Protocol:</Text>
            <Text style={styles.infoVal}>Real-time Bearer REST</Text>
          </View>

          <TouchableOpacity
            style={[styles.testBtn, { marginTop: 14 }]}
            onPress={handleCheckUpdate}
            disabled={checkingUpdate}
          >
            {checkingUpdate ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={styles.testBtnText}>Check for App Updates</Text>
            )}
          </TouchableOpacity>
        </View>

        <AppUpdateModal
          visible={showUpdateModal}
          updateInfo={updateInfo}
          currentVersion={CURRENT_APP_VERSION}
          onDismiss={() => setShowUpdateModal(false)}
        />

        {/* Logout */}
        <TouchableOpacity style={styles.logoutBtn} onPress={onLogout}>
          <Text style={styles.logoutText}>Sign Out of Store Management</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "700",
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 16,
  },
  sectionLabel: {
    color: colors.gold,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  userName: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 4,
  },
  userRoleBadge: {
    color: colors.goldLight,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    backgroundColor: colors.card,
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 14,
  },
  subText: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 12,
  },
  serverInput: {
    backgroundColor: colors.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  testBtn: {
    backgroundColor: colors.gold,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  btnDisabled: {
    opacity: 0.6,
  },
  testBtnText: {
    color: "#000",
    fontSize: 13,
    fontWeight: "700",
  },
  successBanner: {
    backgroundColor: colors.successBg,
    borderColor: colors.success,
    borderWidth: 1,
    borderRadius: 6,
    padding: 8,
    marginBottom: 10,
  },
  successText: {
    color: colors.success,
    fontSize: 12,
    textAlign: "center",
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.card,
  },
  infoLabel: {
    color: colors.textSubtle,
    fontSize: 13,
  },
  infoVal: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "500",
  },
  logoutBtn: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.error,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  logoutText: {
    color: colors.error,
    fontSize: 14,
    fontWeight: "600",
  },
  webLinkBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    gap: 10,
  },
  webLinkIcon: {
    fontSize: 18,
  },
  webLinkTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "600",
  },
  webLinkUrl: {
    color: colors.goldLight,
    fontSize: 11,
    marginTop: 2,
  },
  webLinkArrow: {
    color: colors.gold,
    fontSize: 16,
    fontWeight: "700",
  },
});
