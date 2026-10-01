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
};

const { width } = Dimensions.get("window");

export function StorefrontProductDetailScreen({
  productId,
  cartCount,
  onBack,
  onNavigateToBag,
  onAddToCart,
}: Props) {
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<Variant | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addedToast, setAddedToast] = useState(false);

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

  const activeVariant = selectedVariant || product.variants[0];
  const price = activeVariant?.price ?? product.minPrice;
  const compareAt = activeVariant?.compareAtPrice ?? product.compareAtPrice;
  const hasDiscount = compareAt && compareAt > price;

  const handleAdd = () => {
    if (!activeVariant) return;
    onAddToCart(product, activeVariant, quantity);
    setAddedToast(true);
    setTimeout(() => setAddedToast(false), 2200);
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

          {/* Variants Selector */}
          {product.variants && product.variants.length > 1 && (
            <View style={styles.variantSection}>
              <Text style={styles.sectionHeading}>SELECT OPTION</Text>
              <View style={styles.variantsRow}>
                {product.variants.map((v) => {
                  const isSelected = activeVariant?.id === v.id;
                  return (
                    <TouchableOpacity
                      key={v.id}
                      style={[
                        styles.variantChip,
                        isSelected && styles.variantChipSelected,
                      ]}
                      onPress={() => setSelectedVariant(v)}
                      activeOpacity={0.8}
                    >
                      <Text
                        style={[
                          styles.variantChipText,
                          isSelected && styles.variantChipTextSelected,
                        ]}
                      >
                        {v.title}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
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
  variantsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  variantChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: colors.surfaceWarm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  variantChipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  variantChipText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textSecondary,
  },
  variantChipTextSelected: {
    color: "#FFFFFF",
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
