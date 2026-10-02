import React from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  StyleSheet,
  Linking,
  ScrollView,
  Platform,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { colors } from "../theme/colors";

export type AppUpdateInfo = {
  latestVersion: string;
  versionCode: number;
  appName: string;
  downloadUrl: string;
  directUrl: string;
  releaseNotes: string;
};

type Props = {
  visible: boolean;
  updateInfo: AppUpdateInfo | null;
  currentVersion: string;
  onDismiss: () => void;
};

export function AppUpdateModal({
  visible,
  updateInfo,
  currentVersion,
  onDismiss,
}: Props) {
  if (!visible || !updateInfo) return null;

  const handleDownload = () => {
    const targetUrl = updateInfo.directUrl?.startsWith("http")
      ? updateInfo.directUrl
      : updateInfo.downloadUrl;

    Linking.openURL(targetUrl).catch(() => {
      // Fallback to explicit download URL
      Linking.openURL(updateInfo.downloadUrl);
    });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <TouchableWithoutFeedback onPress={onDismiss}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
            <View style={styles.card}>
              {/* Top-Right Dismiss X Icon */}
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={onDismiss}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityLabel="Dismiss update popup"
              >
                <Feather name="x" size={18} color={colors.textSecondary} />
              </TouchableOpacity>

              {/* Top Decorative Header */}
              <View style={styles.header}>
                <View style={styles.iconCircle}>
                  <Feather name="arrow-down-circle" size={26} color={colors.primary} />
                </View>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>NEW RELEASE AVAILABLE</Text>
            </View>
            <Text style={styles.title}>Update Available</Text>
            <Text style={styles.versionSubtitle}>
              Version {updateInfo.latestVersion} is ready to download
            </Text>
            <Text style={styles.currentVersionTag}>
              Installed: v{currentVersion} &bull; Latest: v{updateInfo.latestVersion}
            </Text>
          </View>

          {/* Release Notes */}
          <View style={styles.notesContainer}>
            <View style={styles.notesHeader}>
              <Feather name="star" size={14} color={colors.gold} />
              <Text style={styles.notesTitle}>WHAT'S NEW IN THIS VERSION</Text>
            </View>
            <ScrollView
              style={{ maxHeight: 150 }}
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.notesBody}>
                {updateInfo.releaseNotes ||
                  "Performance optimizations, improved checkout stability, real-time SMS alerts, and enhanced catalog synchronization."}
              </Text>
            </ScrollView>
          </View>

          {/* Android Download Advice */}
          <View style={styles.adviceRow}>
            <Feather name="info" size={14} color="#666" style={{ marginTop: 1 }} />
            <Text style={styles.adviceText}>
              Tap below to download the latest package directly on your device. Once complete, tap the downloaded file to install.
            </Text>
          </View>

          {/* Action Buttons */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.downloadBtn}
              onPress={handleDownload}
              activeOpacity={0.85}
            >
              <Feather name="download" size={16} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={styles.downloadBtnText}>DOWNLOAD & UPDATE NOW</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.laterBtn}
              onPress={onDismiss}
              activeOpacity={0.7}
            >
              <Text style={styles.laterBtnText}>Remind Me Later</Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableWithoutFeedback>
    </View>
  </TouchableWithoutFeedback>
</Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.72)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  card: {
    width: "100%",
    maxWidth: 390,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
    position: "relative",
  },
  closeBtn: {
    position: "absolute",
    top: 14,
    right: 14,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F4EBEB",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  header: {
    alignItems: "center",
    marginBottom: 16,
  },
  iconCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "#FAF2F4",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  badge: {
    backgroundColor: "#F5EBEB",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 8,
  },
  badgeText: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.text,
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  versionSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: "500",
  },
  currentVersionTag: {
    fontSize: 11,
    color: "#888888",
    marginTop: 4,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  notesContainer: {
    backgroundColor: "#FAF9F6",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#EFECE6",
    padding: 14,
    marginBottom: 14,
  },
  notesHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  notesTitle: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    color: colors.gold,
  },
  notesBody: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.text,
  },
  adviceRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingHorizontal: 4,
    marginBottom: 18,
  },
  adviceText: {
    flex: 1,
    fontSize: 11.5,
    lineHeight: 16,
    color: "#666666",
  },
  actions: {
    gap: 8,
  },
  downloadBtn: {
    backgroundColor: colors.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 10,
  },
  downloadBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 1,
  },
  laterBtn: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
  },
  laterBtnText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: "600",
  },
});
