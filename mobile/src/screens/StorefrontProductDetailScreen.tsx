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

type DisplayOptionValue = {
  id: string;
  value: string;
  hexColor?: string | null;
};

type DisplayOption = {
  id: string;
  name: string;
  isColor: boolean;
  values: DisplayOptionValue[];
};

function getProductDisplayOptions(product: ProductDetail): DisplayOption[] {
  // 1. If product has options configured in DB
  if (product.options && product.options.length > 0) {
    const validOpts = product.options
      .filter((opt) => opt.values && opt.values.length > 0)
      .map((opt) => ({
        id: opt.id,
        name: opt.name,
        isColor:
          opt.name.toLowerCase().includes("color") ||
          opt.name.toLowerCase().includes("colour") ||
          opt.name.toLowerCase().includes("finish") ||
          opt.values.some((v) => Boolean(v.hexColor)),
        values: opt.values.map((v) => ({
          id: v.id,
          value: v.value,
          hexColor: v.hexColor,
        })),
      }));
    if (validOpts.length > 0) return validOpts;
  }

  // 2. If product options are empty or not populated, but variants have multi-part titles (e.g. "200cm / Walnut")
  const nonDefaultVariants = (product.variants || []).filter(
    (v) => v.title && v.title.trim().toLowerCase() !== "default",
  );

  if (nonDefaultVariants.length > 1) {
    const hasSlashes = nonDefaultVariants.some((v) => v.title.includes("/"));
    if (hasSlashes) {
      const part0Map = new Map<string, string>();
      const part1Map = new Map<string, string>();

      nonDefaultVariants.forEach((v) => {
        const parts = v.title.split("/").map((p) => p.trim());
        if (parts[0]) part0Map.set(parts[0].toLowerCase(), parts[0]);
        if (parts[1]) part1Map.set(parts[1].toLowerCase(), parts[1]);
      });

      const part0Values = Array.from(part0Map.values());
      const part1Values = Array.from(part1Map.values());

      if (part0Values.length > 0 && part1Values.length > 0) {
        const isDim = (str: string) =>
          /\d|(cm|mm|m|ft|inch|"|king|queen|single|double|large|small|medium)/i.test(str);
        const part0HasDim = part0Values.some(isDim);
        const name0 = part0HasDim ? "Size / Length" : "Style";
        const name1 = "Color / Finish";

        return [
          {
            id: "opt_part0",
            name: name0,
            isColor: false,
            values: part0Values.map((val) => ({ id: val, value: val })),
          },
          {
            id: "opt_part1",
            name: name1,
            isColor: true,
            values: part1Values.map((val) => ({ id: val, value: val })),
          },
        ];
      }
    }

    // Single option fallback if no slashes but multiple variants
    return [
      {
        id: "opt_single",
        name: "Option",
        isColor: false,
        values: nonDefaultVariants.map((v) => ({ id: v.id, value: v.title })),
      },
    ];
  }

  return [];
}

function resolveVariant(
  product: ProductDetail,
  displayOptions: DisplayOption[],
  selectedOptions: Record<string, string>,
): Variant | null {
  if (!product.variants || product.variants.length === 0) return null;
  if (displayOptions.length === 0) return product.variants[0];

  // 1. Try matching with DB optionValues
  const byDbOptionValues = product.variants.find((v) => {
    if (!v.optionValues || v.optionValues.length === 0) return false;
    return displayOptions.every((opt) => {
      const selectedValId = selectedOptions[opt.id];
      if (!selectedValId) return true;
      return v.optionValues?.some(
        (ov) =>
          ov.optionValueId === selectedValId ||
          ov.optionValue?.id === selectedValId ||
          ov.optionValue?.value.toLowerCase() ===
            opt.values.find((val) => val.id === selectedValId)?.value.toLowerCase(),
      );
    });
  });

  if (byDbOptionValues) return byDbOptionValues;

  // 2. Try matching by variant title parts
  const byTitleMatch = product.variants.find((v) => {
    return displayOptions.every((opt) => {
      const selectedValId = selectedOptions[opt.id];
      if (!selectedValId) return true;
      const valObj = opt.values.find((val) => val.id === selectedValId);
      const valStr = valObj ? valObj.value.toLowerCase() : selectedValId.toLowerCase();
      return v.title.toLowerCase().includes(valStr);
    });
  });

  return byTitleMatch || product.variants[0] || null;
}

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
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
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
        const p = res.product;
        setProduct(p);

        const opts = getProductDisplayOptions(p);
        const firstVariant = p.variants?.[0];
        const initialSelected: Record<string, string> = {};
        opts.forEach((opt) => {
          const matchingVal = opt.values.find((v) => {
            if (
              firstVariant?.optionValues?.some(
                (ov) => ov.optionValueId === v.id || ov.optionValue?.id === v.id,
              )
            ) {
              return true;
            }
            return firstVariant?.title.toLowerCase().includes(v.value.toLowerCase());
          });
          initialSelected[opt.id] = matchingVal ? matchingVal.id : opt.values[0]?.id;
        });

        setSelectedOptions(initialSelected);
        const initialVariant = resolveVariant(p, opts, initialSelected) || firstVariant || null;
        setSelectedVariant(initialVariant);
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

  const displayOptions = getProductDisplayOptions(product);
  const activeVariant =
    selectedVariant || resolveVariant(product, displayOptions, selectedOptions) || product.variants[0];
  const price = activeVariant?.price ?? product.minPrice;
  const compareAt = activeVariant?.compareAtPrice ?? product.compareAtPrice;
  const hasDiscount = compareAt && compareAt > price;

  const variantStock =
    activeVariant?.stock ?? activeVariant?.inventory?.onHand ?? product.totalStock ?? 0;
  const variantAvailable =
    activeVariant?.available ??
    (activeVariant?.inventory
      ? Math.max(0, activeVariant.inventory.onHand - activeVariant.inventory.reserved)
      : variantStock);
  const isSoldOut = !product.isPreorder && variantAvailable <= 0;

  const handleSelectOption = (optionId: string, valueId: string) => {
    const nextSelected = { ...selectedOptions, [optionId]: valueId };
    setSelectedOptions(nextSelected);

    const nextVariant = resolveVariant(product, displayOptions, nextSelected);
    if (nextVariant) {
      setSelectedVariant(nextVariant);
    }

    // Switch image if this valueId is associated with an image
    const imgIndex = product.images.findIndex(
      (img) => (img as any).optionValueId === valueId,
    );
    if (imgIndex >= 0) {
      setSelectedImageIndex(imgIndex);
    }
  };

  const handleAdd = () => {
    if (!activeVariant || isSoldOut) return;
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
            ) : !isSoldOut ? (
              <View style={styles.stockBadge}>
                <Text style={styles.stockText}>
                  {variantAvailable <= 5 && variantAvailable > 0
                    ? `IN STOCK · ONLY ${variantAvailable} LEFT`
                    : "IN STOCK"}
                </Text>
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

          {/* Separate Option Selectors */}
          {displayOptions.length > 0 && (
            <View style={styles.optionsWrapper}>
              {displayOptions.map((opt) => {
                const selectedValId = selectedOptions[opt.id];
                const selectedValObj = opt.values.find((v) => v.id === selectedValId);

                return (
                  <View key={opt.id} style={styles.optionSection}>
                    <View style={styles.optionHeaderRow}>
                      <Text style={styles.sectionHeading}>{opt.name.toUpperCase()}</Text>
                      {selectedValObj ? (
                        <Text style={styles.optionSelectedValueText}>
                          {selectedValObj.value}
                        </Text>
                      ) : null}
                    </View>

                    <View style={styles.optionChipsRow}>
                      {opt.values.map((val) => {
                        const isSelected = selectedOptions[opt.id] === val.id;

                        if (opt.isColor) {
                          return (
                            <TouchableOpacity
                              key={val.id}
                              style={[
                                styles.colorOptionChip,
                                isSelected && styles.colorOptionChipActive,
                              ]}
                              onPress={() => handleSelectOption(opt.id, val.id)}
                              activeOpacity={0.7}
                            >
                              {val.hexColor ? (
                                <View
                                  style={[
                                    styles.colorDot,
                                    { backgroundColor: val.hexColor },
                                  ]}
                                />
                              ) : null}
                              <Text
                                style={[
                                  styles.colorOptionText,
                                  isSelected && styles.colorOptionTextActive,
                                ]}
                              >
                                {val.value}
                              </Text>
                              {isSelected && (
                                <Feather
                                  name="check"
                                  size={12}
                                  color={colors.primary}
                                  style={{ marginLeft: 4 }}
                                />
                              )}
                            </TouchableOpacity>
                          );
                        }

                        return (
                          <TouchableOpacity
                            key={val.id}
                            style={[
                              styles.sizeOptionChip,
                              isSelected && styles.sizeOptionChipActive,
                            ]}
                            onPress={() => handleSelectOption(opt.id, val.id)}
                            activeOpacity={0.7}
                          >
                            <Text
                              style={[
                                styles.sizeOptionText,
                                isSelected && styles.sizeOptionTextActive,
                              ]}
                            >
                              {val.value}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                );
              })}
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
          style={[styles.addToBagBtn, isSoldOut && styles.addToBagBtnDisabled]}
          onPress={handleAdd}
          disabled={isSoldOut}
          activeOpacity={0.85}
        >
          <Feather
            name={isSoldOut ? "alert-circle" : "shopping-bag"}
            size={16}
            color="#FFFFFF"
            style={{ marginRight: 8 }}
          />
          <Text style={styles.addToBagText}>
            {isSoldOut
              ? "SOLD OUT"
              : product.isPreorder
                ? `PRE-ORDER · ${formatCurrency(price * quantity)}`
                : `ADD TO BAG · ${formatCurrency(price * quantity)}`}
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
  optionsWrapper: {
    marginBottom: 20,
    gap: 16,
  },
  optionSection: {
    marginBottom: 4,
  },
  sectionHeading: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.textSecondary,
    letterSpacing: 1,
    marginBottom: 8,
  },
  optionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  optionSelectedValueText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.primary,
  },
  optionChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  sizeOptionChip: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceWarm,
    alignItems: "center",
    justifyContent: "center",
  },
  sizeOptionChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  sizeOptionText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text,
  },
  sizeOptionTextActive: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  colorOptionChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceWarm,
    gap: 6,
  },
  colorOptionChipActive: {
    borderColor: colors.primary,
    backgroundColor: "#F7F4EE",
  },
  colorDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.15)",
  },
  colorOptionText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.text,
  },
  colorOptionTextActive: {
    color: colors.primary,
    fontWeight: "700",
  },
  addToBagBtnDisabled: {
    backgroundColor: colors.textMuted,
    opacity: 0.5,
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
