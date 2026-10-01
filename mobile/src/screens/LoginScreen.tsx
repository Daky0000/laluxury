import React, { useState } from "react";
import {
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
import { colors } from "../theme/colors";
import { api } from "../services/api";
import { User } from "../types";

type Props = {
  onLoginSuccess: (user: User) => void;
  onBrowseCatalog?: () => void;
};

const PRESETS = [
  { id: "live", label: "Live Store", url: "https://laluxurys.com", icon: "🌐" },
  { id: "local", label: "Local PC (Wi-Fi)", url: "http://192.168.3.225:3005", icon: "💻" },
  { id: "emu", label: "Android Emulator", url: "http://10.0.2.2:3005", icon: "📱" },
];

export function LoginScreen({ onLoginSuccess, onBrowseCatalog }: Props) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [serverUrl, setServerUrl] = useState(api.getBaseUrl());
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const handleLogin = async () => {
    if (!identifier.trim() || !password) {
      setError("Please enter your email/phone and password.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (serverUrl !== api.getBaseUrl()) {
        await api.setBaseUrl(serverUrl);
      }
      const res = await api.login(identifier, password);
      onLoginSuccess(res.user);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to sign in.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.brandBox}>
          <Text style={styles.brandSubtitle}>ATELIER & LIVING</Text>
          <Text style={styles.brandTitle}>LALUXURY</Text>
          <Text style={styles.portalBadge}>MANAGEMENT APP</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Staff Sign In</Text>
          <Text style={styles.cardSubtitle}>
            Manage your store catalog, prices, and stock directly from your phone.
          </Text>

          {/* Quick Server Selector */}
          <View style={styles.serverSection}>
            <Text style={styles.serverHeaderLabel}>TARGET SERVER</Text>
            <View style={styles.presetRow}>
              {PRESETS.map((p) => {
                const isSelected = serverUrl === p.url;
                return (
                  <TouchableOpacity
                    key={p.id}
                    style={[styles.presetChip, isSelected && styles.presetChipActive]}
                    onPress={() => handleSelectPreset(p.url)}
                  >
                    <Text style={styles.presetIcon}>{p.icon}</Text>
                    <Text style={[styles.presetLabel, isSelected && styles.presetLabelActive]}>
                      {p.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Current Active Server Bar */}
            <TouchableOpacity
              style={styles.activeServerBar}
              onPress={() => setShowCustomInput(!showCustomInput)}
            >
              <View style={styles.serverStatusDot} />
              <Text style={styles.activeServerText} numberOfLines={1}>
                {serverUrl}
              </Text>
              <Text style={styles.editIcon}>{showCustomInput ? "▲" : "✏️"}</Text>
            </TouchableOpacity>

            {showCustomInput && (
              <View style={styles.customServerBox}>
                <Text style={styles.inputLabel}>CUSTOM SERVER URL</Text>
                <TextInput
                  style={styles.serverInput}
                  value={serverUrl}
                  onChangeText={(val) => {
                    setServerUrl(val);
                    api.setBaseUrl(val);
                  }}
                  placeholder="http://192.168.X.X:3005"
                  placeholderTextColor={colors.textSubtle}
                  autoCapitalize="none"
                />
              </View>
            )}
          </View>

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>EMAIL OR GHANA PHONE</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. admin@laluxury.com or 0244123456"
              placeholderTextColor={colors.textSubtle}
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
              placeholder="Enter your password"
              placeholderTextColor={colors.textSubtle}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          </View>

          <TouchableOpacity
            style={styles.quickFillBtn}
            onPress={handleQuickFillOwner}
          >
            <Text style={styles.quickFillText}>
              🔑 Auto-fill Store Owner Credentials
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.loginButton, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={styles.loginButtonText}>Sign In to Atelier</Text>
            )}
          </TouchableOpacity>

          {onBrowseCatalog ? (
            <TouchableOpacity
              style={styles.browseButton}
              onPress={onBrowseCatalog}
            >
              <Text style={styles.browseButtonText}>
                Browse Live Catalog (Guest Mode) ›
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
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
    flexGrow: 1,
    justifyContent: "center",
    padding: 24,
  },
  brandBox: {
    alignItems: "center",
    marginBottom: 24,
  },
  brandSubtitle: {
    color: colors.gold,
    fontSize: 11,
    letterSpacing: 4,
    fontWeight: "600",
    marginBottom: 4,
  },
  brandTitle: {
    color: colors.text,
    fontSize: 32,
    fontWeight: "700",
    letterSpacing: 6,
  },
  portalBadge: {
    marginTop: 6,
    color: colors.textMuted,
    fontSize: 10,
    letterSpacing: 2,
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "600",
    marginBottom: 6,
  },
  cardSubtitle: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 16,
  },
  serverSection: {
    marginBottom: 18,
    backgroundColor: colors.card,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  serverHeaderLabel: {
    color: colors.goldLight,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  presetRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 8,
  },
  presetChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    paddingVertical: 7,
    paddingHorizontal: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  presetChipActive: {
    borderColor: colors.gold,
    backgroundColor: "rgba(212, 175, 55, 0.15)",
  },
  presetIcon: {
    fontSize: 12,
  },
  presetLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "600",
  },
  presetLabelActive: {
    color: colors.gold,
    fontWeight: "700",
  },
  activeServerBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.background,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: colors.border,
  },
  serverStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#10b981",
    marginRight: 8,
  },
  activeServerText: {
    flex: 1,
    color: colors.text,
    fontSize: 12,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  editIcon: {
    fontSize: 12,
    color: colors.textMuted,
    marginLeft: 6,
  },
  customServerBox: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  serverInput: {
    backgroundColor: colors.background,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontSize: 13,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  errorBox: {
    backgroundColor: colors.errorBg,
    borderColor: colors.error,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    color: colors.error,
    fontSize: 13,
  },
  inputGroup: {
    marginBottom: 18,
  },
  inputLabel: {
    color: colors.goldLight,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1,
    marginBottom: 8,
  },
  input: {
    backgroundColor: colors.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  loginButton: {
    backgroundColor: colors.gold,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  loginButtonText: {
    color: "#000000",
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  quickFillBtn: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: "center",
    marginBottom: 6,
    borderRadius: 6,
    backgroundColor: "rgba(212, 175, 55, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(212, 175, 55, 0.25)",
  },
  quickFillText: {
    color: colors.goldLight,
    fontSize: 12,
    fontWeight: "600",
  },
  browseButton: {
    marginTop: 14,
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  browseButtonText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "600",
  },
});
