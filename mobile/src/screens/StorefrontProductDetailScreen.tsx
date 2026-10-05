import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  Share,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from "react-native";
import { styles } from "./StorefrontProductDetailScreen.styles";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../theme/colors";
import { useApp } from "../state/AppContext";
import { ProductReviews } from "../components/ProductReviews";
import { api } from "../services/api";
import { ProductDetail, Variant, Product } from "../types";
import { formatCurrency } from "../utils/format";
import { resolveImageUrl } from "../utils/image";
import { getProductGridMetrics } from "../utils/layout";

type Props = {
  productId: string;
  cartCount: number;
  onBack: () => void;
  onNavigateToBag: () => void;
  onAddToCart: (product: Product, variant: Variant, quantity: number) => void;
  onBulkAddToCart?: (items: { product: Product; variant: Variant; quantity: number }[]) => void;
  onSelectProduct?: (productId: string) => void;
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
  onBulkAddToCart,
  onSelectProduct,
  onNotify,
}: Props) {
  const insets = useSafeAreaInsets();
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [relatedProducts, setRelatedProducts] = useState<Product[]>([]);
  const { wishlistIds, toggleWishlist } = useApp();
  const [selectedVariant, setSelectedVariant] = useState<Variant | null>(null);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
  const [quantity, setQuantity] = useState(1);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const sliderRef = useRef<ScrollView>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { width: windowWidth } = useWindowDimensions();
  const gridMetrics = getProductGridMetrics(windowWidth);

  // Bulk Order Assistant states
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkQuantities, setBulkQuantities] = useState<Record<string, number>>({});
  const [bulkTargetTotal, setBulkTargetTotal] = useState("");

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const [res, listRes] = await Promise.all([
          api.getStoreProduct(productId),
          api.getStoreProducts({ limit: 12 }).catch(() => ({ products: [] })),
        ]);
        const p = res.product;
        setProduct(p);

        const others = (listRes.products || [])
          .filter((item) => item.id !== productId)
          .slice(0, 8);
        setRelatedProducts(others);

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
  const variantAvailable = activeVariant?.available === null ? Infinity :
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
      sliderRef.current?.scrollTo({ x: imgIndex * width, animated: true });
    }
  };

  const handleAdd = () => {
    if (!activeVariant || isSoldOut) return;
    onAddToCart(product, activeVariant, quantity);
  };

  const handleShare = async () => {
    try {
      const url = `https://nobleenclave.com/product/${product.slug}`;
      const formattedPrice = formatCurrency(price);
      await Share.share({
        title: product.title,
        message: `Check out "${product.title}" (${formattedPrice}) from Noble Enclave:\n${url}`,
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

  // Multi-variant bulk calculations
  const bulkSelectedVariants = (product?.variants || [])
  .map((v) => ({ variant: v, quantity: bulkQuantities[v.id] || 0 }))
  .filter((line) => line.quantity > 0);

  const totalBulkItems = bulkSelectedVariants.reduce((sum, line) => sum + line.quantity, 0);
  const totalBulkPrice = bulkSelectedVariants.reduce(
    (sum, line) => sum + line.quantity * line.variant.price,
    0,
  );

  const handleDistributeTarget = () => {
    const target = parseInt(bulkTargetTotal, 10);
    if (isNaN(target) || target <= 0 || !product?.variants || product.variants.length === 0) return;
    const availableVars = product.variants.filter((v) => (v.stock ?? v.available ?? 10) > 0 || product.isPreorder);
    const pool = availableVars.length > 0 ? availableVars : product.variants;
    const perVar = Math.floor(target / pool.length);
    const remainder = target % pool.length;

    const nextQty: Record<string, number> = {};
    pool.forEach((v, index) => {
      nextQty[v.id] = perVar + (index < remainder ? 1 : 0);
    });
    setBulkQuantities(nextQty);
  };

  const handleRandomizeTarget = () => {
    const target = parseInt(bulkTargetTotal, 10);
    if (isNaN(target) || target <= 0 || !product?.variants || product.variants.length === 0) return;
    const availableVars = product.variants.filter((v) => (v.stock ?? v.available ?? 10) > 0 || product.isPreorder);
    const pool = availableVars.length > 0 ? availableVars : product.variants;
    const k = pool.length;
    if (k === 1) {
      setBulkQuantities({ [pool[0].id]: target });
      return;
    }
    // Random partition of target into k non-negative integers summing to target (stars and bars)
    const cuts: number[] = [0, target];
    for (let i = 0; i < k - 1; i++) {
      cuts.push(Math.floor(Math.random() * (target + 1)));
    }
    cuts.sort((a, b) => a - b);
    const nextQty: Record<string, number> = {};
    pool.forEach((v, index) => {
      nextQty[v.id] = cuts[index + 1] - cuts[index];
    });
    setBulkQuantities(nextQty);
  };

  const handleConfirmBulkAdd = () => {
    if (totalBulkItems === 0) {
      if (onNotify) {
        onNotify({
          title: "Select Quantities",
          message: "Please choose at least 1 item to add in bulk.",
          type: "warning",
          icon: "alert-circle",
        });
      }
      return;
    }

    if (onBulkAddToCart) {
      onBulkAddToCart(
        bulkSelectedVariants.map((line) => ({
          product,
          variant: line.variant,
          quantity: line.quantity,
        })),
      );
    } else {
      bulkSelectedVariants.forEach((line) => {
        onAddToCart(product, line.variant, line.quantity);
      });
    }

    setShowBulkModal(false);
  };

  return (
    <View style={styles.container}>
      {/* Top Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={onBack} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Back">
          <Feather name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>

        <View style={styles.brandContainer}>
          <Text style={styles.brandTitle}>NOBLE ENCLAVE</Text>
          <Text style={styles.brandSubtitle}>HOME TEXTILES • LIVING ESSENTIALS</Text>
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => toggleWishlist(product.id)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={wishlistIds.has(product.id) ? "Remove from saved pieces" : "Save this piece"}
            accessibilityState={{ selected: wishlistIds.has(product.id) }}
          >
            <Feather name="heart" size={20} color={wishlistIds.has(product.id) ? colors.primary : colors.text} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.iconBtn}
            onPress={handleShare}
            activeOpacity={0.7}
            accessibilityRole="button"
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

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Large Product Image Gallery with Swipeable Carousel */}
        <View style={styles.galleryContainer}>
          {product.images && product.images.length > 0 ? (
            <ScrollView
              ref={sliderRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(e) => {
                const offsetX = e.nativeEvent.contentOffset.x;
                const idx = Math.round(offsetX / width);
                if (idx >= 0 && idx < product.images.length && idx !== selectedImageIndex) {
                  setSelectedImageIndex(idx);
                }
              }}
              style={{ width, height: width * 0.85 }}
            >
              {product.images.map((img, idx) => {
                const resolvedUri = resolveImageUrl(img.url);
                return (
                  <View key={img.id || idx} style={{ width, height: width * 0.85 }}>
                    {resolvedUri ? (
                      <Image
                        source={{ uri: resolvedUri }}
                        style={styles.heroImage}
                        contentFit="cover" cachePolicy="memory-disk" transition={150}
                      />
                    ) : (
                      <View style={styles.placeholderImage}>
                        <Feather name="box" size={64} color={colors.primaryLight} />
                      </View>
                    )}
                  </View>
                );
              })}
            </ScrollView>
          ) : (
            <View style={styles.placeholderImage}>
              <Feather name="box" size={64} color={colors.primaryLight} />
            </View>
          )}

          {/* Photo Counter Badge */}
          {product.images && product.images.length > 1 && (
            <View style={styles.imageCounterBadge}>
              <Text style={styles.imageCounterText}>
                {selectedImageIndex + 1} / {product.images.length}
              </Text>
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
                  onPress={() => {
                    setSelectedImageIndex(idx);
                    sliderRef.current?.scrollTo({ x: idx * width, animated: true });
                  }}
                  activeOpacity={0.8}
                />
              ))}
            </View>
          )}
        </View>

        {/* Thumbnail Row if multiple images */}
        {product.images && product.images.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.thumbnailStrip}
          >
            {product.images.map((img, idx) => {
              const resolvedUri = resolveImageUrl(img.url);
              const isSelected = selectedImageIndex === idx;
              return (
                <TouchableOpacity
                  key={`thumb_${img.id || idx}`}
                  style={[styles.thumbnailWrap, isSelected && styles.thumbnailWrapActive]}
                  onPress={() => {
                    setSelectedImageIndex(idx);
                    sliderRef.current?.scrollTo({ x: idx * width, animated: true });
                  }}
                  activeOpacity={0.7}
                >
                  {resolvedUri ? (
                    <Image source={{ uri: resolvedUri }} style={styles.thumbnailImg} contentFit="cover" cachePolicy="memory-disk" transition={150} />
                  ) : (
                    <View style={styles.thumbnailPlaceholder}>
                      <Feather name="image" size={16} color={colors.textMuted} />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

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
                "Carefully crafted and finished with premium materials to elevate your living spaces."}
            </Text>
          </View>

          {/* Material & Details */}
          {product.material && (
            <View style={styles.specRow}>
              <Text style={styles.specLabel}>Material & Finish</Text>
              <Text style={styles.specValue}>{product.material}</Text>
            </View>
          )}

          <ProductReviews productId={product.id} />

          {/* Complementary Pieces / You May Also Like (Responsive Grid, 19px Heading) */}
          {relatedProducts.length > 0 && (
            <View style={styles.relatedSection}>
              <View style={styles.relatedSectionHeader}>
                <Text style={styles.sectionHeading19}>You May Also Like</Text>
              </View>

              <View style={[styles.responsiveGrid, { gap: gridMetrics.gap }]}>
                {relatedProducts
                  .slice(0, gridMetrics.numColumns === 1 ? 4 : gridMetrics.numColumns * 2)
                  .map((item) => (
                    <TouchableOpacity
                      key={item.id}
                      style={[styles.productGridCard, { width: gridMetrics.itemWidth }]}
                      onPress={() => {
                        if (onSelectProduct) {
                          onSelectProduct(item.id);
                        }
                      }}
                      activeOpacity={0.9}
                    >
                      <View style={styles.productCardImageContainer}>
                        {resolveImageUrl(item.images?.[0]?.url) ? (
                          <Image
                            source={{ uri: resolveImageUrl(item.images?.[0]?.url)! }}
                            style={styles.productCardImage}
                            contentFit="cover" cachePolicy="memory-disk" transition={150}
                          />
                        ) : (
                          <View style={styles.productCardImageFallback}>
                            <Feather name="box" size={24} color={colors.textMuted} />
                          </View>
                        )}
                      </View>

                      <View style={styles.productCardInfo}>
                        <Text style={styles.productCardTitle} numberOfLines={2}>
                          {item.title}
                        </Text>
                        <Text style={styles.productCardPrice}>
                          {formatCurrency(item.minPrice)}
                        </Text>
                      </View>

                      <TouchableOpacity
                        style={styles.cardAddToCartBtn}
                        onPress={(e) => {
                          e.stopPropagation();
                          const defaultVariant = item.variants?.[0] || ({
                            id: `v_${item.id}`,
                            title: "Default",
                            price: item.minPrice,
                            sku: "",
                            stock: item.totalStock || 1,
                          } as any);
                          onAddToCart(item, defaultVariant, 1);
                        }}
                        activeOpacity={0.8}
                      >
                        <Feather
                          name="shopping-bag"
                          size={13}
                          color="#FFFFFF"
                          style={{ marginRight: 6 }}
                        />
                        <Text style={styles.cardAddToCartBtnText}>Add to Cart</Text>
                      </TouchableOpacity>
                    </TouchableOpacity>
                  ))}
              </View>
            </View>
          )}

          <View style={{ height: 100 }} />
        </View>
      </ScrollView>

      {/* Sticky Bottom Purchase Bar */}
      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        {/* Icon-only Bulk Add Assistant button */}
        <TouchableOpacity
          style={styles.bottomSparkBtn}
          onPress={() => {
            if (Object.keys(bulkQuantities).length === 0 && activeVariant) {
              setBulkQuantities({ [activeVariant.id]: quantity });
            }
            setShowBulkModal(true);
          }}
          activeOpacity={0.7}
          accessibilityLabel="Bulk add options"
        >
          <Feather name="zap" size={20} color={colors.gold} />
          {totalBulkItems > 0 && (
            <View style={styles.sparkBadge}>
              <Text style={styles.sparkBadgeText}>{totalBulkItems}</Text>
            </View>
          )}
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

      {/* Bulk Order Assistant Modal */}
      <Modal
        visible={showBulkModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowBulkModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalContent, { paddingBottom: Math.max(insets.bottom, 24) }]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View style={styles.sparkHeaderBadge}>
                  <Feather name="zap" size={16} color={colors.gold} />
                </View>
                <View>
                  <Text style={styles.modalTitle}>Bulk Order Assistant</Text>
                  <Text style={styles.modalSubtitle}>
                    We'll help you bulk add to cart across multiple options
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => setShowBulkModal(false)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Feather name="x" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              style={{ maxHeight: 420 }}
            >
              {/* Optional Quick Total Input */}
              <View style={styles.targetTotalBox}>
                <Text style={styles.targetTotalLabel}>Target total pieces needed (optional):</Text>
                <View style={{ flexDirection: "row", gap: 8, alignItems: "center", marginTop: 6 }}>
                  <TextInput
                    style={styles.targetTotalInput}
                    placeholder="e.g. 10"
                    placeholderTextColor="#999"
                    keyboardType="number-pad"
                    value={bulkTargetTotal}
                    onChangeText={setBulkTargetTotal}
                  />
                  <TouchableOpacity
                    style={styles.distributeBtn}
                    onPress={handleDistributeTarget}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.distributeBtnText}>Evenly</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.randomizeBtn}
                    onPress={handleRandomizeTarget}
                    activeOpacity={0.8}
                  >
                    <Feather name="shuffle" size={13} color={colors.primary} style={{ marginRight: 4 }} />
                    <Text style={styles.randomizeBtnText}>Randomize</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Multi-Option Variants List */}
              <Text style={[styles.sectionHeading, { marginTop: 14, marginBottom: 8 }]}>
                SELECT OPTIONS & QUANTITIES
              </Text>

              {(product.variants || []).map((v) => {
                const qty = bulkQuantities[v.id] || 0;
                const inStock = v.stock ?? v.available ?? 10;
                const optValues = v.optionValues || [];
                const colorObj = optValues.find((ov) => Boolean(ov.optionValue?.hexColor));
                const swatch = colorObj?.optionValue?.hexColor;

                return (
                  <View key={v.id} style={styles.bulkVariantRow}>
                    <View style={{ flex: 1, marginRight: 10 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        {swatch ? (
                          <View
                            style={{
                              width: 14,
                              height: 14,
                              borderRadius: 7,
                              backgroundColor: swatch,
                              borderWidth: 1,
                              borderColor: colors.border,
                            }}
                          />
                        ) : null}
                        <Text style={styles.bulkVariantTitle} numberOfLines={1}>
                          {v.title || "Standard"}
                        </Text>
                      </View>
                      <Text style={styles.bulkVariantPrice}>
                        {formatCurrency(v.price)} · {product.isPreorder ? "Pre-order" : `${inStock} in stock`}
                      </Text>
                    </View>

                    {/* Stepper with direct type input */}
                    <View style={styles.bulkStepperGroup}>
                      <TouchableOpacity
                        style={styles.bulkStepBtn}
                        onPress={() =>
                          setBulkQuantities((prev) => ({
                            ...prev,
                            [v.id]: Math.max(0, (prev[v.id] || 0) - 1),
                          }))
                        }
                      >
                        <Text style={styles.bulkStepBtnText}>−</Text>
                      </TouchableOpacity>
                      <TextInput
                        style={styles.bulkStepInput}
                        keyboardType="number-pad"
                        value={String(qty)}
                        onChangeText={(txt) => {
                          const val = parseInt(txt.replace(/[^0-9]/g, ""), 10);
                          setBulkQuantities((prev) => ({
                            ...prev,
                            [v.id]: isNaN(val) ? 0 : val,
                          }));
                        }}
                      />
                      <TouchableOpacity
                        style={styles.bulkStepBtn}
                        onPress={() =>
                          setBulkQuantities((prev) => ({
                            ...prev,
                            [v.id]: (prev[v.id] || 0) + 1,
                          }))
                        }
                      >
                        <Text style={styles.bulkStepBtnText}>+</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}

              {/* Multiple Selected Live Breakdown (Website parity!) */}
              {bulkSelectedVariants.length > 0 && (
                <View style={styles.bulkSummaryCard}>
                  <Text style={styles.bulkSummaryHeading}>
                    Selected Options ({totalBulkItems} {totalBulkItems === 1 ? "item" : "items"}):
                  </Text>
                  {bulkSelectedVariants.map((line) => (
                    <View key={line.variant.id} style={styles.bulkSummaryItemRow}>
                      <Text style={styles.bulkSummaryItemText} numberOfLines={1}>
                        • {line.variant.title} × {line.quantity}
                      </Text>
                      <Text style={styles.bulkSummaryItemPrice}>
                        {formatCurrency(line.variant.price * line.quantity)}
                      </Text>
                    </View>
                  ))}
                  <View style={styles.bulkSummaryDivider} />
                  <View style={styles.bulkSummaryTotalRow}>
                    <Text style={styles.bulkSummaryTotalLabel}>Total ({totalBulkItems} pcs):</Text>
                    <Text style={styles.bulkSummaryTotalValue}>{formatCurrency(totalBulkPrice)}</Text>
                  </View>
                </View>
              )}
            </ScrollView>

            {/* Confirm Bulk Add Button */}
            <TouchableOpacity
              style={[
                styles.modalSaveBtn,
                totalBulkItems === 0 && { opacity: 0.5 },
              ]}
              onPress={handleConfirmBulkAdd}
              disabled={totalBulkItems === 0}
              activeOpacity={0.85}
            >
              <Feather name="shopping-bag" size={16} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={styles.modalSaveText}>
                {totalBulkItems > 0
                  ? `Add ${totalBulkItems} Items to Bag · ${formatCurrency(totalBulkPrice)}`
                  : "Select Items to Add"}
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
