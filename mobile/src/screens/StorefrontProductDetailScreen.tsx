import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
  Share,
  Modal,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { colors } from "../theme/colors";
import { api } from "../services/api";
import { ProductDetail, Variant, Product } from "../types";
import { formatCurrency } from "../utils/format";

type Props = {
  productId: string;
  cartCount: number;
  onBack: () => void;
  onNavigateToBag: () => void;
  onAddToCart: (product: Product, variant: Variant, quantity: number) => void;
  onNotify?: (notif: {
    title: string;
    message?: string;
    type?: "success" | "info" | "warning" | "error";
    icon?: keyof typeof Feather.glyphMap;
  }) => void;
};

const { width } = Dimensions.get("window");

export function StorefrontProductDetailScreen({
  productId,
  cartCount,
  onBack,
  onNavigateToBag,
  onAddToCart,
  onNotify,
}: Props) {
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<Variant | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addedToast, setAddedToast] = useState(false);
  const [showOptionModal, setShowOptionModal] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const res = await api.getProduct(productId);
        setProduct(res.product);
        if (res.product.variants && res.product.variants.length > 0) {
          setSelectedVariant(res.product.variants[0]);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to load product.";
        setError(msg);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [productId]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (error || !product) {
    return (
      <View style={styles.errorContainer}>
        <Feather name="alert-circle" size={40} color={colors.error} />
        <Text style={styles.errorText}>{error || "Product not found."}</Text>
        <TouchableOpacity style={styles.backBtn} onPress={onBack}>
          <Text style={styles.backBtnText}>Return to Catalog</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Filter out redundant "Default" variants if there is no actual variant choice
  const availableVariants = (product.variants || []).filter(
    (v) => v.title && v.title.trim().toLowerCase() !== "default",
  );
  const hasOptions = availableVariants.length > 1;

  const activeVariant =
    selectedVariant || (hasOptions ? availableVariants[0] : product.variants[0]);
  const price = activeVariant?.price ?? product.minPrice;
  const compareAt = activeVariant?.compareAtPrice ?? product.compareAtPrice;
  const hasDiscount = compareAt && compareAt > price;

  const handleAdd = () => {
    if (!activeVariant) return;
    onAddToCart(product, activeVariant, quantity);
    setAddedToast(true);
    setTimeout(() => setAddedToast(false), 2200);
    if (onNotify) {
      onNotify({
        title: "Added to Bag",
        message: `${quantity}× ${product.title} (${activeVariant.title}) added to your bag.`,
        type: "success",
        icon: "shopping-bag",
      });
    }
  };

  const handleShare = async () => {
    try {
      const url = `https://laluxurys.com/product/${product.slug}`;
      const formattedPrice = formatCurrency(price);
      await Share.share({
        title: product.title,
        message: `Check out "${product.title}" (${formattedPrice}) from LaLuxury Atelier & Living:\n${url}`,
        url,
      });
      if (onNotify) {
        onNotify({
          title: "Product Shared",
          message: `Shared link for ${product.title}`,
          type: "info",
          icon: "share-2",
        });
      }
    } catch {
      // User cancelled
    }
  };

  return (
    <View style={styles.container}>
      {/* Top Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={onBack} activeOpacity={0.7}>
          <Feather name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>

        <View style={styles.brandContainer}>
          <Text style={styles.brandTitle}>LALUXURY</Text>
          <Text style={styles.brandSubtitle}>ATELIER & LIVING</Text>
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={handleShare}
            activeOpacity={0.7}
            accessibilityLabel="Share Product"
          >
            <Feather name="share-2" size={20} color={colors.text} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.iconBtn}
            onPress={onNavigateToBag}
            activeOpacity={0.7}
          >
            <Feather name="shopping-bag" size={22} color={colors.text} />
            {cartCount > 0 && (
              <View style={styles.cartBadge}>
                <Text style={styles.cartBadgeText}>{cartCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Added Toast */}
      {addedToast && (
        <View style={styles.toast}>
          <Feather name="check" size={14} color="#FFFFFF" />
          <Text style={styles.toastText}>Added {quantity} to your bag</Text>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Large Product Image Gallery */}
        <View style={styles.galleryContainer}>
          {product.images?.[selectedImageIndex]?.url ? (
            <Image
              source={{ uri: product.images[selectedImageIndex].url }}
              style={styles.heroImage}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.placeholderImage}>
              <Feather name="box" size={64} color={colors.primaryLight} />
            </View>
          )}

          {/* Dots Indicator */}
          {product.images && product.images.length > 1 && (
            <View style={styles.dotsRow}>
              {product.images.map((_, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={[
                    styles.dot,
                    selectedImageIndex === idx && styles.dotActive,
                  ]}
                  onPress={() => setSelectedImageIndex(idx)}
                />
              ))}
            </View>
          )}
        </View>

        {/* Product Details Section */}
        <View style={styles.detailsContainer}>
          {/* Status Badge */}
          <View style={styles.tagRow}>
            {product.isPreorder ? (
              <View style={styles.preorderBadge}>
                <Text style={styles.preorderText}>PRE-ORDER / MADE TO ORDER</Text>
              </View>
            ) : product.totalStock > 0 ? (
              <View style={styles.stockBadge}>
                <Text style={styles.stockText}>IN STOCK</Text>
              </View>
            ) : (
              <View style={styles.outOfStockBadge}>
                <Text style={styles.outOfStockText}>SOLD OUT</Text>
              </View>
            )}

            {product.brand && (
              <Text style={styles.brandLabel}>{product.brand.toUpperCase()}</Text>
            )}
          </View>

          {/* Title */}
          <Text style={styles.productTitle}>{product.title}</Text>

          {/* Price */}
          <View style={styles.priceRow}>
            <Text style={styles.priceText}>{formatCurrency(price)}</Text>
            {hasDiscount && (
              <Text style={styles.comparePriceText}>
                {formatCurrency(compareAt!)}
              </Text>
            )}
          </View>

          {/* Simple & Clean Options Selector */}
          {hasOptions && (
            <View style={styles.variantSection}>
              <View style={styles.optionHeaderRow}>
                <Text style={styles.sectionHeading}>SELECT OPTION</Text>
                <Text style={styles.optionCountBadge}>
                  {availableVariants.length} options available
                </Text>
              </View>

              <TouchableOpacity
                style={styles.optionSelectCard}
                onPress={() => setShowOptionModal(true)}
                activeOpacity={0.8}
              >
                <View style={styles.optionSelectLeft}>
                  <Text style={styles.optionSelectTitle} numberOfLines={1}>
                    {activeVariant?.title}
                  </Text>
                  <Text style={styles.optionSelectSubtitle}>
                    {formatCurrency(price)}
                    {activeVariant?.sku ? ` · ${activeVariant.sku}` : ""}
                  </Text>
                </View>
                <View style={styles.optionSelectRight}>
                  <Text style={styles.optionSelectAction}>Change</Text>
                  <Feather name="chevron-down" size={16} color={colors.primary} />
                </View>
              </TouchableOpacity>
            </View>
          )}

          {/* Description */}
          <View style={styles.descriptionSection}>
            <Text style={styles.sectionHeading}>ABOUT THIS PIECE</Text>
            <Text style={styles.descriptionText}>
              {product.description ||
                product.shortDescription ||
                "Handcrafted with heirloom joinery and finished in natural oils to highlight the timber's organic grain. Each piece is made to order in our atelier."}
            </Text>
          </View>

          {/* Material & Details */}
          {product.material && (
            <View style={styles.specRow}>
              <Text style={styles.specLabel}>Material & Finish</Text>
              <Text style={styles.specValue}>{product.material}</Text>
            </View>
          )}

          <View style={{ height: 100 }} />
        </View>
      </ScrollView>

      {/* Sticky Bottom Purchase Bar */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={styles.bottomShareBtn}
          onPress={handleShare}
          activeOpacity={0.7}
          accessibilityLabel="Share piece"
        >
          <Feather name="share-2" size={18} color={colors.text} />
        </TouchableOpacity>

        <View style={styles.bottomQtyGroup}>
          <TouchableOpacity
            style={styles.qtyBtn}
            onPress={() => setQuantity((q) => Math.max(1, q - 1))}
          >
            <Text style={styles.qtyBtnText}>−</Text>
          </TouchableOpacity>
          <Text style={styles.qtyNumber}>{quantity}</Text>
          <TouchableOpacity
            style={styles.qtyBtn}
            onPress={() => setQuantity((q) => q + 1)}
          >
            <Text style={styles.qtyBtnText}>+</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.addToBagBtn}
          onPress={handleAdd}
          activeOpacity={0.85}
        >
          <Feather name="shopping-bag" size={16} color="#FFFFFF" style={{ marginRight: 8 }} />
          <Text style={styles.addToBagText}>
            ADD TO BAG · {formatCurrency(price * quantity)}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Simple Option Selection Modal */}
      {hasOptions && (
        <Modal visible={showOptionModal} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <View>
                  <Text style={styles.modalTitle}>Select Option</Text>
                  <Text style={styles.modalSubTitle}>Choose your preferred size or variation</Text>
                </View>
                <TouchableOpacity
                  onPress={() => setShowOptionModal(false)}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Feather name="x" size={20} color={colors.text} />
                </TouchableOpacity>
              </View>

              <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
                {availableVariants.map((v) => {
                  const isSelected = activeVariant?.id === v.id;
                  return (
                    <TouchableOpacity
                      key={v.id}
                      style={[
                        styles.optionRow,
                        isSelected && styles.optionRowSelected,
                      ]}
                      onPress={() => {
                        setSelectedVariant(v);
                        setShowOptionModal(false);
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[
                            styles.optionRowTitle,
                            isSelected && styles.optionRowTitleSelected,
                          ]}
                        >
                          {v.title}
                        </Text>
                        <Text style={styles.optionRowPrice}>
                          {formatCurrency(v.price)}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.optionRadio,
                          isSelected && styles.optionRadioSelected,
                        ]}
                      >
                        {isSelected ? (
                          <Feather name="check" size={13} color="#FFFFFF" />
                        ) : null}
                      </View>
                    </TouchableOpacity>
                  );
                })}
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
    paddingBottom: 10,
    backgroundColor: colors.background,
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  brandContainer: {
    alignItems: "center",
  },
  brandTitle: {
    fontFamily: "serif",
    fontSize: 22,
    fontWeight: "700",
    color: colors.primary,
    letterSpacing: 3,
  },
  brandSubtitle: {
    fontSize: 8,
    fontWeight: "700",
    color: colors.textSecondary,
    letterSpacing: 2,
    marginTop: 1,
  },
  cartBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: colors.primary,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  cartBadgeText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "800",
  },
  toast: {
    position: "absolute",
    top: 60,
    left: 20,
    right: 20,
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    zIndex: 99,
  },
  toastText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  scrollContent: {
    paddingBottom: 40,
  },
  galleryContainer: {
    width: width,
    height: width * 0.85,
    backgroundColor: colors.surfaceWarm,
    position: "relative",
  },
  heroImage: {
    width: "100%",
    height: "100%",
  },
  placeholderImage: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  dotsRow: {
    position: "absolute",
    bottom: 14,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(0,0,0,0.2)",
  },
  dotActive: {
    backgroundColor: colors.primary,
    width: 14,
  },
  detailsContainer: {
    paddingHorizontal: 20,
    paddingTop: 18,
  },
  tagRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  stockBadge: {
    backgroundColor: colors.successBg,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  stockText: {
    color: colors.success,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  preorderBadge: {
    backgroundColor: colors.warningBg,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  preorderText: {
    color: colors.warning,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  outOfStockBadge: {
    backgroundColor: colors.errorBg,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  outOfStockText: {
    color: colors.error,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  brandLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.textSecondary,
    letterSpacing: 1,
  },
  productTitle: {
    fontFamily: "serif",
    fontSize: 20,
    fontWeight: "700",
    color: colors.text,
    letterSpacing: 0.3,
    marginBottom: 10,
    lineHeight: 26,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 10,
    marginBottom: 20,
  },
  priceText: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.primary,
  },
  comparePriceText: {
    fontSize: 14,
    color: colors.textMuted,
    textDecorationLine: "line-through",
  },
  variantSection: {
    marginBottom: 20,
  },
  sectionHeading: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.textSecondary,
    letterSpacing: 1,
    marginBottom: 10,
  },
  optionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  optionCountBadge: {
    fontSize: 10,
    fontWeight: "600",
    color: colors.primary,
  },
  optionSelectCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surfaceWarm,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  optionSelectLeft: {
    flex: 1,
    paddingRight: 10,
  },
  optionSelectTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
  },
  optionSelectSubtitle: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  optionSelectRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  optionSelectAction: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.primary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  modalTitle: {
    fontFamily: "serif",
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
  },
  modalSubTitle: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: colors.surfaceWarm,
    marginVertical: 4,
  },
  optionRowSelected: {
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: "#F7F4EE",
  },
  optionRowTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text,
  },
  optionRowTitleSelected: {
    fontWeight: "700",
    color: colors.primary,
  },
  optionRowPrice: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  optionRadio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  optionRadioSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  descriptionSection: {
    marginBottom: 20,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    paddingTop: 16,
  },
  descriptionText: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  specRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  specLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textSecondary,
  },
  specValue: {
    fontSize: 11,
    color: colors.text,
  },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: 20,
    paddingVertical: 12,
    paddingBottom: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  bottomShareBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceWarm,
  },
  bottomQtyGroup: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceWarm,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  qtyBtn: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
  },
  qtyNumber: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
    paddingHorizontal: 8,
  },
  addToBagBtn: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: 24,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  addToBagText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
  errorContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
    padding: 24,
    gap: 12,
  },
  errorText: {
    fontSize: 14,
    color: colors.text,
    textAlign: "center",
  },
  backBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 16,
  },
  backBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
});
