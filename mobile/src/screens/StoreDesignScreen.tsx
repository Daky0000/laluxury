import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Alert,
  Modal,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { colors } from "../theme/colors";
import { api } from "../services/api";
import { Category, User } from "../types";
import { resolveImageUrl } from "../utils/image";

type Props = {
  user: User;
  onBack: () => void;
  onNotify?: (notif: {
    title: string;
    message?: string;
    type?: "success" | "info" | "warning" | "error";
    icon?: keyof typeof Feather.glyphMap;
  }) => void;
};

const PRESET_IMAGES = [
  { label: "Bedding", url: "/catalog/room-bedroom.webp" },
  { label: "Bedsheet Set", url: "/catalog/cotton-bedsheet-set.webp" },
  { label: "Curtains", url: "/catalog/window-curtain.webp" },
  { label: "Blinds", url: "/catalog/curtain-blinds.webp" },
  { label: "Carpets", url: "/catalog/fluffy-carpet.webp" },
  { label: "Doormat", url: "/catalog/doormat.webp" },
  { label: "Cushions", url: "/catalog/throw-pillow.webp" },
  { label: "Living", url: "/catalog/room-living.webp" },
];

export function StoreDesignScreen({ user, onBack, onNotify }: Props) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [name, setName] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [position, setPosition] = useState("1");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const loadCategories = useCallback(async () => {
    try {
      const res = await api.getStoreCategories(true);
      setCategories(res.categories || []);
    } catch {
      // Fallback
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  const onRefresh = () => {
    setRefreshing(true);
    loadCategories();
  };

  const handleEdit = (cat: Category) => {
    setEditingCategory(cat);
    setName(cat.name);
    setImageUrl(cat.imageUrl || "");
    setPosition(String(cat.position || "1"));
    setDescription(cat.description || "");
  };

  const handlePickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permission Required",
          "Please grant camera roll permissions to change the background photo."
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 5],
        quality: 0.85,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        setImageUrl(asset.uri);
        if (onNotify) {
          onNotify({
            title: "Photo Selected",
            message: "New background picture attached.",
            type: "success",
            icon: "image",
          });
        }
      }
    } catch {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!editingCategory) return;
    if (!name.trim()) {
      Alert.alert("Name Required", "Please enter a category name.");
      return;
    }

    setSaving(true);
    try {
      await api.updateCategory(editingCategory.id, {
        name: name.trim(),
        imageUrl: imageUrl.trim() || null,
        position: Number(position) || 1,
        description: description.trim() || undefined,
      });

      setEditingCategory(null);
      await loadCategories();

      if (onNotify) {
        onNotify({
          title: "Store Design Updated",
          message: `Updated "${name}" category background and layout.`,
          type: "success",
          icon: "check-circle",
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update category.";
      Alert.alert("Error", msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack} activeOpacity={0.7}>
          <Feather name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={{ alignItems: "center" }}>
          <Text style={styles.headerTitle}>Store Design</Text>
          <Text style={styles.headerSub}>Category Backgrounds & Layout</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.gold}
          />
        }
      >
        <View style={styles.infoBanner}>
          <Feather name="layout" size={16} color={colors.gold} style={{ marginRight: 8 }} />
          <Text style={styles.infoBannerText}>
            Tap any category below to replace its background image or change its display order in the storefront carousel.
          </Text>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color={colors.gold} style={{ marginVertical: 40 }} />
        ) : (
          <View style={styles.categoriesList}>
            {categories.map((cat, idx) => (
              <TouchableOpacity
                key={cat.id || idx}
                style={styles.categoryCard}
                onPress={() => handleEdit(cat)}
                activeOpacity={0.85}
              >
                <View style={styles.imageWrapper}>
                  {resolveImageUrl(cat.imageUrl) ? (
                    <Image
                      source={{ uri: resolveImageUrl(cat.imageUrl)! }}
                      style={styles.catImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={styles.imageFallback}>
                      <Feather name="image" size={32} color={colors.textMuted} />
                    </View>
                  )}
                  {/* Dark overlay */}
                  <View style={styles.cardOverlay} />

                  <View style={styles.cardTextContent}>
                    <View style={styles.orderBadge}>
                      <Text style={styles.orderBadgeText}>Position #{cat.position || idx + 1}</Text>
                    </View>
                    <Text style={styles.cardTitle}>{cat.name}</Text>
                    {cat.description ? (
                      <Text style={styles.cardDesc} numberOfLines={2}>
                        {cat.description}
                      </Text>
                    ) : null}
                  </View>

                  <View style={styles.editIconBadge}>
                    <Feather name="edit-2" size={14} color="#FFFFFF" />
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Edit Category Modal */}
      {editingCategory && (
        <Modal
          visible={Boolean(editingCategory)}
          animationType="slide"
          transparent
          onRequestClose={() => setEditingCategory(null)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Edit Category Design</Text>
                <TouchableOpacity
                  onPress={() => setEditingCategory(null)}
                  style={styles.closeBtn}
                >
                  <Feather name="x" size={20} color={colors.text} />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                {/* Background Photo Preview */}
                <View style={styles.previewContainer}>
                  {resolveImageUrl(imageUrl) ? (
                    <Image
                      source={{ uri: resolveImageUrl(imageUrl)! }}
                      style={styles.previewImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={styles.previewFallback}>
                      <Feather name="image" size={36} color={colors.textMuted} />
                      <Text style={styles.previewFallbackText}>No Image Selected</Text>
                    </View>
                  )}

                  <View style={styles.previewOverlay} />

                  <View style={styles.previewOverlayText}>
                    <Text style={styles.previewCardTitle}>{name || "CATEGORY TITLE"}</Text>
                  </View>
                </View>

                {/* Upload or Pick Image Button */}
                <TouchableOpacity
                  style={styles.uploadBtn}
                  onPress={handlePickImage}
                  disabled={uploading}
                  activeOpacity={0.8}
                >
                  {uploading ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Feather name="camera" size={16} color="#FFFFFF" style={{ marginRight: 8 }} />
                      <Text style={styles.uploadBtnText}>Choose Photo from Phone</Text>
                    </>
                  )}
                </TouchableOpacity>

                {/* Quick Presets */}
                <Text style={styles.inputLabel}>QUICK PHOTO PRESETS</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                  {PRESET_IMAGES.map((preset, pIdx) => (
                    <TouchableOpacity
                      key={pIdx}
                      style={[
                        styles.presetChip,
                        imageUrl === preset.url && styles.presetChipActive,
                      ]}
                      onPress={() => setImageUrl(preset.url)}
                    >
                      <Text
                        style={[
                          styles.presetChipText,
                          imageUrl === preset.url && styles.presetChipTextActive,
                        ]}
                      >
                        {preset.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                {/* Image URL text input */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>IMAGE URL</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="/catalog/room-bedroom.webp"
                    placeholderTextColor={colors.textMuted}
                    value={imageUrl}
                    onChangeText={setImageUrl}
                    autoCapitalize="none"
                  />
                </View>

                {/* Category Name */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>CATEGORY NAME</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. Bedding"
                    placeholderTextColor={colors.textMuted}
                    value={name}
                    onChangeText={setName}
                  />
                </View>

                {/* Display Order */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>DISPLAY ORDER IN CAROUSEL (1, 2, 3...)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="1"
                    placeholderTextColor={colors.textMuted}
                    value={position}
                    onChangeText={setPosition}
                    keyboardType="number-pad"
                  />
                </View>

                {/* Description */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>DESCRIPTION</Text>
                  <TextInput
                    style={[styles.input, { height: 60 }]}
                    placeholder="Brief description..."
                    placeholderTextColor={colors.textMuted}
                    value={description}
                    onChangeText={setDescription}
                    multiline
                  />
                </View>

                {/* Action Buttons */}
                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={styles.cancelBtn}
                    onPress={() => setEditingCategory(null)}
                  >
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.saveBtn, saving && { opacity: 0.6 }]}
                    onPress={handleSave}
                    disabled={saving}
                  >
                    {saving ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.saveBtnText}>Save Changes</Text>
                    )}
                  </TouchableOpacity>
                </View>
                <View style={{ height: 20 }} />
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    backgroundColor: colors.surface,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontFamily: "serif",
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
    letterSpacing: 0.5,
  },
  headerSub: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 1,
  },
  scrollContent: {
    padding: 20,
  },
  infoBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FDF8ED",
    borderWidth: 1,
    borderColor: "#F3E3B6",
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
  },
  infoBannerText: {
    flex: 1,
    fontSize: 12,
    color: "#6D5316",
    lineHeight: 18,
  },
  categoriesList: {
    gap: 16,
  },
  categoryCard: {
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    backgroundColor: "#2B2724",
  },
  imageWrapper: {
    height: 180,
    position: "relative",
  },
  catImage: {
    width: "100%",
    height: "100%",
  },
  imageFallback: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceElevated,
  },
  cardOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
  },
  cardTextContent: {
    position: "absolute",
    bottom: 16,
    left: 16,
    right: 50,
  },
  orderBadge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255, 255, 255, 0.25)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 6,
  },
  orderBadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  cardTitle: {
    fontFamily: "serif",
    fontSize: 22,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 1,
  },
  cardDesc: {
    fontSize: 12,
    color: "#FFFFFF",
    opacity: 0.85,
    marginTop: 4,
    lineHeight: 16,
  },
  editIconBadge: {
    position: "absolute",
    top: 14,
    right: 14,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: "85%",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  modalTitle: {
    fontFamily: "serif",
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
  },
  closeBtn: {
    padding: 6,
  },
  previewContainer: {
    height: 140,
    borderRadius: 12,
    overflow: "hidden",
    position: "relative",
    marginBottom: 14,
    backgroundColor: "#2B2724",
  },
  previewImage: {
    width: "100%",
    height: "100%",
  },
  previewFallback: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  previewFallbackText: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 4,
  },
  previewOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
  },
  previewOverlayText: {
    position: "absolute",
    bottom: 12,
    left: 14,
  },
  previewCardTitle: {
    fontFamily: "serif",
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 0.5,
  },
  uploadBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
    paddingVertical: 12,
    borderRadius: 10,
    marginBottom: 16,
  },
  uploadBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "600",
  },
  presetChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.borderLight,
    marginRight: 8,
  },
  presetChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  presetChipText: {
    fontSize: 12,
    color: colors.text,
  },
  presetChipTextActive: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  inputGroup: {
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textSecondary,
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text,
  },
  modalActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 10,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  saveBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },
});
