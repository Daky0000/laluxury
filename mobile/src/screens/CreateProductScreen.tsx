import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Image,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Switch,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { colors } from "../theme/colors";
import { api } from "../services/api";
import { Category } from "../types";

type Props = {
  onBack: () => void;
  onCreated: (newProductId: string) => void;
};

export function CreateProductScreen({ onBack, onCreated }: Props) {
  const [title, setTitle] = useState("");
  const [priceGHS, setPriceGHS] = useState("");
  const [stock, setStock] = useState("5");
  const [status, setStatus] = useState<"ACTIVE" | "DRAFT">("ACTIVE");
  const [brand, setBrand] = useState("Nobel Enclave");
  const [material, setMaterial] = useState("");
  const [isPreorder, setIsPreorder] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  const [categories, setCategories] = useState<Category[]>([]);
  const [photo, setPhoto] = useState<{
    uri: string;
    base64?: string | null;
    mimeType?: string | null;
    fileName?: string | null;
  } | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api.getCategories().then((res) => {
      setCategories(res.categories);
      if (res.categories.length > 0) {
        setSelectedCategoryId(res.categories[0].id);
      }
    }).catch(() => {});
  }, []);

  const handlePickPhoto = async () => {
    Alert.alert("Product Photo", "Choose image source:", [
      {
        text: "Snap Photo (Camera)",
        onPress: async () => {
          const { status: perm } = await ImagePicker.requestCameraPermissionsAsync();
          if (perm !== "granted") {
            Alert.alert("Permission needed", "Camera access is needed to photograph inventory.");
            return;
          }
          const result = await ImagePicker.launchCameraAsync({
            mediaTypes: ["images"],
            allowsEditing: true,
            quality: 0.8,
            base64: true,
          });
          if (!result.canceled && result.assets[0]) {
            const a = result.assets[0];
            setPhoto({
              uri: a.uri,
              base64: a.base64,
              mimeType: a.mimeType || "image/jpeg",
              fileName: a.fileName || "photo.jpg",
            });
          }
        },
      },
      {
        text: "Choose from Gallery",
        onPress: async () => {
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            allowsEditing: true,
            quality: 0.8,
            base64: true,
          });
          if (!result.canceled && result.assets[0]) {
            const a = result.assets[0];
            setPhoto({
              uri: a.uri,
              base64: a.base64,
              mimeType: a.mimeType || "image/jpeg",
              fileName: a.fileName || "photo.jpg",
            });
          }
        },
      },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const handleCreate = async () => {
    if (!title.trim()) {
      Alert.alert("Required", "Please provide a title for the piece.");
      return;
    }

    const numPrice = parseFloat(priceGHS);
    if (isNaN(numPrice) || numPrice <= 0) {
      Alert.alert("Invalid Price", "Enter a valid selling price in GHS.");
      return;
    }

    setCreating(true);

    try {
      const minorPrice = Math.round(numPrice * 100);
      const stockNum = parseInt(stock, 10);

      // 1. Create product
      const res = await api.createProduct({
        title: title.trim(),
        price: minorPrice,
        stock: isNaN(stockNum) ? 0 : stockNum,
        status,
        brand: brand.trim() || undefined,
        material: material.trim() || undefined,
        isPreorder,
        categoryIds: selectedCategoryId ? [selectedCategoryId] : [],
      });

      const newId = res.product.id;

      // 2. Upload photo if selected
      if (photo) {
        try {
          await api.uploadImage(newId, photo);
        } catch (uploadErr) {
          console.error("Photo upload error on create:", uploadErr);
          const uploadMsg =
            uploadErr instanceof Error ? uploadErr.message : "Photo upload failed";
          Alert.alert(
            "Piece Created (Photo Notice)",
            `"${title}" was created, but photo could not be attached: ${uploadMsg}. You can re-upload inside the piece details.`,
            [{ text: "View Piece", onPress: () => onCreated(newId) }]
          );
          return;
        }
      }

      Alert.alert("Piece Created", `"${title}" is now added and live on the store!`, [
        { text: "View Piece", onPress: () => onCreated(newId) },
      ]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create piece.";
      Alert.alert("Error", msg);
    } finally {
      setCreating(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Add New Piece</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Photo Box */}
        <TouchableOpacity style={styles.photoBox} onPress={handlePickPhoto}>
          {photo?.uri ? (
            <View style={{ width: "100%", height: "100%", position: "relative" }}>
              <Image source={{ uri: photo.uri }} style={styles.photoPreview} resizeMode="cover" />
              <View style={styles.photoOverlayBadge}>
                <Text style={styles.photoOverlayText}>Tap to Change Photo</Text>
              </View>
            </View>
          ) : (
            <View style={styles.photoPlaceholder}>
              <Text style={styles.photoPlaceholderIcon}>📷</Text>
              <Text style={styles.photoPlaceholderText}>Snap or Choose Cover Photo</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Form Fields */}
        <View style={styles.card}>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>PRODUCT TITLE *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Kyoto Solid Oak Dining Chair"
              placeholderTextColor={colors.textSubtle}
              value={title}
              onChangeText={setTitle}
            />
          </View>

          <View style={styles.row}>
            <View style={[styles.col, { marginRight: 8 }]}>
              <Text style={styles.inputLabel}>PRICE (GHS) *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 850.00"
                placeholderTextColor={colors.textSubtle}
                keyboardType="numeric"
                value={priceGHS}
                onChangeText={setPriceGHS}
              />
            </View>

            <View style={[styles.col, { marginLeft: 8 }]}>
              <Text style={styles.inputLabel}>INITIAL STOCK</Text>
              <TextInput
                style={styles.input}
                placeholder="5"
                placeholderTextColor={colors.textSubtle}
                keyboardType="number-pad"
                value={stock}
                onChangeText={setStock}
              />
            </View>
          </View>

          {/* Category Selection */}
          {categories.length > 0 && (
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>CATEGORY</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryRow}>
                {categories.map((c) => {
                  const isSelected = selectedCategoryId === c.id;
                  return (
                    <TouchableOpacity
                      key={c.id}
                      style={[styles.categoryChip, isSelected && styles.categoryChipActive]}
                      onPress={() => setSelectedCategoryId(c.id)}
                    >
                      <Text
                        style={[styles.categoryChipText, isSelected && styles.categoryChipTextActive]}
                      >
                        {c.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>BRAND</Text>
            <TextInput
              style={styles.input}
              placeholder="Nobel Enclave"
              placeholderTextColor={colors.textSubtle}
              value={brand}
              onChangeText={setBrand}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>MATERIAL</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Solid Oak, Bouclé upholstery"
              placeholderTextColor={colors.textSubtle}
              value={material}
              onChangeText={setMaterial}
            />
          </View>

          {/* Status & Preorder Switches */}
          <View style={styles.switchGroup}>
            <View style={styles.switchItem}>
              <Text style={styles.switchText}>Publish immediately as Active</Text>
              <Switch
                value={status === "ACTIVE"}
                onValueChange={(val) => setStatus(val ? "ACTIVE" : "DRAFT")}
                trackColor={{ false: colors.border, true: colors.gold }}
                thumbColor="#FFFFFF"
              />
            </View>

            <View style={styles.switchItem}>
              <Text style={styles.switchText}>Pre-Order / Bespoke sourcing</Text>
              <Switch
                value={isPreorder}
                onValueChange={setIsPreorder}
                trackColor={{ false: colors.border, true: colors.gold }}
                thumbColor="#FFFFFF"
              />
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Submit Button */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[styles.createBtn, creating && styles.btnDisabled]}
          onPress={handleCreate}
          disabled={creating}
        >
          {creating ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={styles.createBtnText}>Publish Piece to Store</Text>
          )}
        </TouchableOpacity>
      </View>
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
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: {
    paddingVertical: 6,
  },
  backText: {
    color: colors.textMuted,
    fontSize: 15,
  },
  headerTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "700",
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  photoBox: {
    width: "100%",
    height: 180,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderStyle: "dashed",
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    overflow: "hidden",
  },
  photoPreview: {
    width: "100%",
    height: "100%",
  },
  photoOverlayBadge: {
    position: "absolute",
    bottom: 10,
    alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.65)",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
  },
  photoOverlayText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  photoPlaceholder: {
    alignItems: "center",
  },
  photoPlaceholderIcon: {
    fontSize: 34,
    marginBottom: 8,
  },
  photoPlaceholderText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "600",
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
  inputGroup: {
    marginBottom: 14,
  },
  inputLabel: {
    color: colors.goldLight,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    marginBottom: 6,
  },
  input: {
    backgroundColor: colors.card,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  row: {
    flexDirection: "row",
    marginBottom: 14,
  },
  col: {
    flex: 1,
  },
  categoryRow: {
    flexDirection: "row",
    paddingTop: 4,
  },
  categoryChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8,
  },
  categoryChipActive: {
    backgroundColor: colors.gold,
    borderColor: colors.gold,
  },
  categoryChipText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "600",
  },
  categoryChipTextActive: {
    color: "#000",
  },
  switchGroup: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 12,
  },
  switchItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  switchText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "600",
  },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  createBtn: {
    backgroundColor: colors.gold,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
  },
  btnDisabled: {
    opacity: 0.6,
  },
  createBtnText: {
    color: "#000",
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
});
