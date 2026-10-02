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
  Linking,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { colors } from "../theme/colors";
import { api } from "../services/api";
import { ProductDetail } from "../types";

type Props = {
  productId: string;
  onBack: () => void;
  onDeleted: () => void;
};

export function ProductDetailScreen({ productId, onBack, onDeleted }: Props) {
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Form states
  const [title, setTitle] = useState("");
  const [priceGHS, setPriceGHS] = useState("");
  const [comparePriceGHS, setComparePriceGHS] = useState("");
  const [stock, setStock] = useState("");
  const [status, setStatus] = useState<"DRAFT" | "ACTIVE" | "ARCHIVED">("DRAFT");
  const [isPreorder, setIsPreorder] = useState(false);
  const [brand, setBrand] = useState("");
  const [material, setMaterial] = useState("");
  const [shortDesc, setShortDesc] = useState("");
  const [variantRows, setVariantRows] = useState<
    Array<{ id: string; title: string; sku: string; priceGHS: string; stock: string }>
  >([]);

  const updateVariantRow = (id: string, field: "priceGHS" | "stock", val: string) => {
    setVariantRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: val } : r)),
    );
  };

  const loadProduct = async () => {
    try {
      const res = await api.getProduct(productId);
      const p = res.product;
      setProduct(p);

      setTitle(p.title);
      setPriceGHS((p.minPrice / 100).toString());
      setComparePriceGHS(p.compareAtPrice ? (p.compareAtPrice / 100).toString() : "");

      const defaultVariant = p.variants?.[0];
      const initialStock =
        defaultVariant?.inventory?.onHand ?? defaultVariant?.stock ?? p.totalStock ?? 0;
      setStock(initialStock.toString());

      if (p.variants && p.variants.length > 0) {
        setVariantRows(
          p.variants.map((v) => ({
            id: v.id,
            title: v.title,
            sku: v.sku,
            priceGHS: (v.price / 100).toString(),
            stock: (v.inventory?.onHand ?? v.stock ?? 0).toString(),
          })),
        );
      }

      setStatus(p.status);
      setIsPreorder(p.isPreorder);
      setBrand(p.brand || "");
      setMaterial(p.material || "");
      setShortDesc(p.shortDescription || "");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load product";
      Alert.alert("Error", msg, [{ text: "OK", onPress: onBack }]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProduct();
  }, [productId]);

  const handlePickImage = async () => {
    Alert.alert("Upload Photo", "Choose photo source:", [
      {
        text: "Take Photo (Camera)",
        onPress: async () => {
          const { status: perm } = await ImagePicker.requestCameraPermissionsAsync();
          if (perm !== "granted") {
            Alert.alert("Permission needed", "Camera permission is required to snap product photos.");
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
            await uploadSelectedImage({
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
            await uploadSelectedImage({
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

  const uploadSelectedImage = async (
    source:
      | {
          uri: string;
          base64?: string | null;
          mimeType?: string | null;
          fileName?: string | null;
        }
      | string,
  ) => {
    setUploadingImage(true);
    try {
      await api.uploadImage(productId, source);
      await loadProduct();
      setFeedback("Photo added successfully!");
      setTimeout(() => setFeedback(null), 3000);
      Alert.alert("Success", "Photo uploaded and added to the piece!");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Upload failed.";
      Alert.alert("Upload Error", msg);
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSave = async () => {
    const numPrice = parseFloat(priceGHS);
    if (isNaN(numPrice) || numPrice < 0) {
      Alert.alert("Invalid Price", "Please enter a valid price in GHS.");
      return;
    }

    setSaving(true);
    setFeedback(null);

    try {
      const minorPrice = Math.round(numPrice * 100);
      const minorCompare = comparePriceGHS.trim()
        ? Math.round(parseFloat(comparePriceGHS) * 100)
        : null;

      // 1. Update product metadata
      await api.updateProduct(productId, {
        title: title.trim(),
        status,
        compareAtPrice: minorCompare,
        shortDescription: shortDesc.trim() || null,
        brand: brand.trim() || null,
        material: material.trim() || null,
        isPreorder,
      });

      // 2. Update variants stock & pricing
      if (variantRows.length > 1) {
        await api.updateVariants(
          productId,
          variantRows.map((vr) => ({
            id: vr.id,
            price: Math.round((parseFloat(vr.priceGHS) || 0) * 100),
            stock: parseInt(vr.stock, 10) || 0,
          })),
        );
      } else {
        const defaultVariant = product?.variants?.[0];
        if (defaultVariant) {
          const numStock = parseInt(stock, 10);
          await api.updateVariants(productId, [
            {
              id: defaultVariant.id,
              price: minorPrice,
              compareAtPrice: minorCompare,
              stock: isNaN(numStock) ? 0 : numStock,
            },
          ]);
        }
      }

      await loadProduct();
      setFeedback("Changes saved and live on website!");
      setTimeout(() => setFeedback(null), 3500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save.";
      Alert.alert("Save Error", msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      "Delete Piece",
      "Are you sure? If this piece has previous customer orders, it will be safely archived instead of permanently deleted.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const res = await api.deleteProduct(productId);
              Alert.alert("Success", res.message, [{ text: "OK", onPress: onDeleted }]);
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : "Delete failed.";
              Alert.alert("Error", msg);
            }
          },
        },
      ],
    );
  };

  if (loading || !product) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.gold} />
        <Text style={styles.loadingText}>Loading piece details...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {product.title}
        </Text>
        <TouchableOpacity onPress={handleDelete} style={styles.trashBtn}>
          <Text style={styles.trashText}>Delete</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {feedback ? (
          <View style={styles.feedbackBox}>
            <Text style={styles.feedbackText}>{feedback}</Text>
          </View>
        ) : null}

        {/* Live Website Link Bar */}
        <TouchableOpacity
          style={styles.liveWebBanner}
          onPress={() => {
            const webUrl = `${api.getBaseUrl()}/product/${product.slug}`;
            Linking.openURL(webUrl).catch(() => {
              Alert.alert("Unable to open browser", `Web address: ${webUrl}`);
            });
          }}
          activeOpacity={0.8}
        >
          <Text style={styles.liveWebIcon}>🌐</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.liveWebTitle}>View Live on Website</Text>
            <Text style={styles.liveWebSubtitle} numberOfLines={1}>
              {api.getBaseUrl()}/product/{product.slug}
            </Text>
          </View>
          <Text style={styles.liveWebArrow}>↗</Text>
        </TouchableOpacity>

        {/* Photos Carousel */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>PHOTOS ({product.images.length})</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoRow}>
            {product.images.map((img) => {
              const url = img.url.startsWith("http")
                ? img.url
                : `${api.getBaseUrl()}${img.url}`;
              return (
                <View key={img.id} style={styles.photoWrapper}>
                  <Image source={{ uri: url }} style={styles.galleryImage} />
                  <TouchableOpacity
                    style={styles.deletePhotoBtn}
                    onPress={() => {
                      Alert.alert("Remove Photo", "Delete this image from gallery?", [
                        { text: "Cancel" },
                        {
                          text: "Delete",
                          style: "destructive",
                          onPress: async () => {
                            await api.deleteImage(productId, img.id);
                            loadProduct();
                          },
                        },
                      ]);
                    }}
                  >
                    <Text style={styles.deletePhotoText}>✕</Text>
                  </TouchableOpacity>
                </View>
              );
            })}

            <TouchableOpacity
              style={styles.addPhotoCard}
              onPress={handlePickImage}
              disabled={uploadingImage}
            >
              {uploadingImage ? (
                <ActivityIndicator color={colors.gold} />
              ) : (
                <>
                  <Text style={styles.addPhotoIcon}>📷</Text>
                  <Text style={styles.addPhotoText}>Add Photo</Text>
                </>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>

        {/* Pricing & Inventory */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>PRICING & STOCK</Text>
          <View style={styles.row}>
            <View style={[styles.inputCol, { flex: 1, marginRight: 8 }]}>
              <Text style={styles.inputLabel}>PRICE (GHS)</Text>
              <TextInput
                style={styles.input}
                value={priceGHS}
                onChangeText={setPriceGHS}
                keyboardType="numeric"
                placeholder="0.00"
                placeholderTextColor={colors.textSubtle}
              />
            </View>

            <View style={[styles.inputCol, { flex: 1, marginLeft: 8 }]}>
              <Text style={styles.inputLabel}>WAS PRICE (GHS)</Text>
              <TextInput
                style={styles.input}
                value={comparePriceGHS}
                onChangeText={setComparePriceGHS}
                keyboardType="numeric"
                placeholder="Optional strike"
                placeholderTextColor={colors.textSubtle}
              />
            </View>
          </View>

          <View style={styles.row}>
            {variantRows.length <= 1 ? (
              <View style={[styles.inputCol, { flex: 1, marginRight: 8 }]}>
                <Text style={styles.inputLabel}>STOCK ON HAND</Text>
                <TextInput
                  style={styles.input}
                  value={stock}
                  onChangeText={setStock}
                  keyboardType="number-pad"
                  placeholder="0"
                  placeholderTextColor={colors.textSubtle}
                />
              </View>
            ) : (
              <View style={[styles.inputCol, { flex: 1, marginRight: 8, justifyContent: "center" }]}>
                <Text style={styles.inputLabel}>TOTAL STOCK</Text>
                <Text style={styles.totalVariantsBadge}>
                  {variantRows.reduce((sum, r) => sum + (parseInt(r.stock, 10) || 0), 0)} units ({variantRows.length} variants)
                </Text>
              </View>
            )}

            <View style={[styles.inputCol, { flex: 1, marginLeft: 8, justifyContent: "center" }]}>
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Pre-Order Piece</Text>
                <Switch
                  value={isPreorder}
                  onValueChange={setIsPreorder}
                  trackColor={{ false: colors.border, true: colors.gold }}
                  thumbColor="#FFFFFF"
                />
              </View>
            </View>
          </View>
        </View>

        {/* Variants & Stock Matrix */}
        {variantRows.length > 1 && (
          <View style={styles.section}>
            <View style={styles.variantHeaderRow}>
              <Text style={styles.sectionTitle}>VARIANTS &amp; STOCK MATRIX ({variantRows.length})</Text>
              <Text style={styles.variantHeaderHint}>Real-time web sync</Text>
            </View>

            {variantRows.map((vr) => (
              <View key={vr.id} style={styles.variantRowCard}>
                <View style={styles.variantRowHeader}>
                  <Text style={styles.variantRowTitle}>{vr.title}</Text>
                  <Text style={styles.variantRowSku}>SKU: {vr.sku}</Text>
                </View>

                <View style={styles.row}>
                  <View style={[styles.inputCol, { flex: 1, marginRight: 8 }]}>
                    <Text style={styles.inputLabel}>PRICE (GHS)</Text>
                    <TextInput
                      style={styles.input}
                      value={vr.priceGHS}
                      onChangeText={(val) => updateVariantRow(vr.id, "priceGHS", val)}
                      keyboardType="numeric"
                      placeholder="0.00"
                      placeholderTextColor={colors.textSubtle}
                    />
                  </View>

                  <View style={[styles.inputCol, { flex: 1, marginLeft: 8 }]}>
                    <Text style={styles.inputLabel}>STOCK ON HAND</Text>
                    <TextInput
                      style={styles.input}
                      value={vr.stock}
                      onChangeText={(val) => updateVariantRow(vr.id, "stock", val)}
                      keyboardType="number-pad"
                      placeholder="0"
                      placeholderTextColor={colors.textSubtle}
                    />
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Status Selector */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>STATUS</Text>
          <View style={styles.statusChipsRow}>
            {(["ACTIVE", "DRAFT", "ARCHIVED"] as const).map((s) => {
              const isSelected = status === s;
              return (
                <TouchableOpacity
                  key={s}
                  style={[styles.statusChip, isSelected && styles.statusChipActive]}
                  onPress={() => setStatus(s)}
                >
                  <Text
                    style={[styles.statusChipText, isSelected && styles.statusChipTextActive]}
                  >
                    {s}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Piece Details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>PIECE DETAILS</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>TITLE</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. Versailles Velvet Armchair"
              placeholderTextColor={colors.textSubtle}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>BRAND / ATELIER</Text>
            <TextInput
              style={styles.input}
              value={brand}
              onChangeText={setBrand}
              placeholder="e.g. Nobel Enclave"
              placeholderTextColor={colors.textSubtle}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>MATERIAL</Text>
            <TextInput
              style={styles.input}
              value={material}
              onChangeText={setMaterial}
              placeholder="e.g. Solid Walnut, Brass, Bouclé"
              placeholderTextColor={colors.textSubtle}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>SHORT HIGHLIGHT</Text>
            <TextInput
              style={[styles.input, styles.multilineInput]}
              value={shortDesc}
              onChangeText={setShortDesc}
              placeholder="Short description displayed on catalog tiles"
              placeholderTextColor={colors.textSubtle}
              multiline
              numberOfLines={3}
            />
          </View>
        </View>
      </ScrollView>

      {/* Save Button */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.btnDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={styles.saveBtnText}>Save & Sync Live</Text>
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
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    color: colors.textMuted,
    marginTop: 12,
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
    paddingRight: 12,
  },
  backText: {
    color: colors.gold,
    fontSize: 16,
    fontWeight: "600",
  },
  headerTitle: {
    flex: 1,
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
    marginHorizontal: 8,
  },
  trashBtn: {
    paddingVertical: 6,
    paddingLeft: 12,
  },
  trashText: {
    color: colors.error,
    fontSize: 13,
    fontWeight: "600",
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  feedbackBox: {
    backgroundColor: colors.successBg,
    borderColor: colors.success,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  feedbackText: {
    color: colors.success,
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
  },
  section: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    color: colors.gold,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
    marginBottom: 12,
  },
  photoRow: {
    flexDirection: "row",
  },
  photoWrapper: {
    width: 100,
    height: 100,
    borderRadius: 8,
    marginRight: 10,
    position: "relative",
    overflow: "hidden",
  },
  galleryImage: {
    width: "100%",
    height: "100%",
  },
  deletePhotoBtn: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: "rgba(0,0,0,0.6)",
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  deletePhotoText: {
    color: "#FFF",
    fontSize: 10,
    fontWeight: "700",
  },
  addPhotoCard: {
    width: 100,
    height: 100,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card,
  },
  addPhotoIcon: {
    fontSize: 24,
    marginBottom: 4,
  },
  addPhotoText: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "600",
  },
  row: {
    flexDirection: "row",
    marginBottom: 12,
  },
  inputCol: {
    marginBottom: 4,
  },
  inputGroup: {
    marginBottom: 12,
  },
  inputLabel: {
    color: colors.textMuted,
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
  multilineInput: {
    minHeight: 65,
    textAlignVertical: "top",
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.card,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  switchLabel: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "600",
  },
  statusChipsRow: {
    flexDirection: "row",
    gap: 10,
  },
  statusChip: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  statusChipActive: {
    backgroundColor: colors.gold,
    borderColor: colors.gold,
  },
  statusChipText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "700",
  },
  statusChipTextActive: {
    color: "#000",
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
  saveBtn: {
    backgroundColor: colors.gold,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
  },
  btnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    color: "#000",
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  liveWebBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.gold,
    padding: 12,
    marginBottom: 16,
    gap: 10,
  },
  liveWebIcon: {
    fontSize: 20,
  },
  liveWebTitle: {
    color: colors.gold,
    fontSize: 13,
    fontWeight: "700",
  },
  liveWebSubtitle: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  liveWebArrow: {
    color: colors.gold,
    fontSize: 16,
    fontWeight: "700",
  },
  totalVariantsBadge: {
    color: colors.gold,
    fontSize: 13,
    fontWeight: "700",
    paddingVertical: 10,
  },
  variantHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  variantHeaderHint: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "600",
  },
  variantRowCard: {
    backgroundColor: colors.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 10,
  },
  variantRowHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 6,
  },
  variantRowTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700",
    flex: 1,
  },
  variantRowSku: {
    color: colors.textMuted,
    fontSize: 11,
    fontFamily: "monospace",
  },
});
