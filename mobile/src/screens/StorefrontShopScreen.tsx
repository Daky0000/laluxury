import React, { useState, useEffect, useCallback, useMemo } from "react";
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
  Dimensions,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { colors } from "../theme/colors";
import { api } from "../services/api";
import { Product } from "../types";
import { formatCurrency } from "../utils/format";
import { resolveImageUrl } from "../utils/image";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const GRID_ITEM_WIDTH = Math.round((SCREEN_WIDTH - 40 - 12) / 2);

type Props = {
  initialFilter?: string;
  cartCount: number;
  onBack: () => void;
  onNavigateToBag: () => void;
  onSelectProduct: (productId: string) => void;
  onAddToCart: (product: Product) => void;
  onNotify?: (notif: {
    title: string;
    message?: string;
    type?: "success" | "info" | "warning" | "error";
    icon?: keyof typeof Feather.glyphMap;
  }) => void;
};

const FILTER_PILLS = [
  { id: "ALL", label: "ALL" },
  { id: "RECENTLY_STOCKED", label: "RECENTLY STOCKED" },
  { id: "BEDDING", label: "BEDDING" },
  { id: "CURTAINS", label: "CURTAINS" },
  { id: "CARPETS", label: "CARPETS" },
  { id: "CUSHIONS", label: "CUSHIONS" },
];

export function StorefrontShopScreen({
  initialFilter,
  cartCount,
  onBack,
  onNavigateToBag,
  onSelectProduct,
  onAddToCart,
  onNotify,
}: Props) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState(
    initialFilter ? initialFilter.toUpperCase() : "ALL"
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [addedToast, setAddedToast] = useState<string | null>(null);

  const loadProducts = useCallback(async () => {
    try {
      const res = await api.getStoreProducts({
        q: searchQuery.trim() || undefined,
        limit: 60,
      });
      setProducts(res.products || []);
    } catch {
      // Fallback
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    if (initialFilter) {
      setActiveFilter(initialFilter.toUpperCase());
    }
  }, [initialFilter]);

  const onRefresh = () => {
    setRefreshing(true);
    loadProducts();
  };

  const handleQuickAdd = (product: Product) => {
    onAddToCart(product);
    setAddedToast(`Added "${product.title}" to bag`);
    setTimeout(() => setAddedToast(null), 2200);
    if (onNotify) {
      onNotify({
        title: "Added to Bag",
        message: `${product.title} added to your bag.`,
        type: "success",
        icon: "shopping-bag",
      });
    }
  };

  // Filter and sort products according to the selected basic filter
  const displayedProducts = useMemo(() => {
    let list = [...products];

    if (activeFilter === "RECENTLY_STOCKED") {
      return list.sort((a, b) => {
        const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime();
        const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime();
        return timeB - timeA;
      });
    }

    if (activeFilter === "ALL") {
      return list;
    }

    const filterTerm = activeFilter.toLowerCase();
    return list.filter((p) => {
      const title = (p.title || "").toLowerCase();
      const tags = (p.tags || []).map((t) => t.toLowerCase());
      const cats = (p.categories || []).map((c) => (c.name || "").toLowerCase());

      if (filterTerm === "curtains") {
        return (
          title.includes("curtain") ||
          title.includes("blind") ||
          title.includes("rod") ||
          tags.includes("curtain") ||
          tags.includes("blinds") ||
          cats.includes("curtains") ||
          cats.includes("windows")
        );
      }

      if (filterTerm === "carpets") {
        return (
          title.includes("carpet") ||
          title.includes("rug") ||
          title.includes("doormat") ||
          tags.includes("carpet") ||
          tags.includes("rug") ||
          cats.includes("carpets") ||
          cats.includes("living")
        );
      }

      if (filterTerm === "cushions") {
        return (
          (title.includes("cushion") || (title.includes("pillow") && !title.includes("bed") && !title.includes("sleep"))) ||
          tags.includes("cushion") ||
          cats.includes("cushions")
        );
      }

      if (filterTerm === "bedding") {
        return (
          title.includes("bed") ||
          title.includes("duvet") ||
          title.includes("blanket") ||
          title.includes("sheet") ||
          title.includes("topper") ||
          title.includes("pillow") ||
          tags.includes("bedding") ||
          cats.includes("bedding")
        );
      }

      return (
        title.includes(filterTerm) ||
        tags.some((t) => t.includes(filterTerm)) ||
        cats.some((c) => c.includes(filterTerm))
      );
    });
  }, [products, activeFilter]);

  return (
    <View style={styles.container}>
      {/* Top Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={onBack} activeOpacity={0.7}>
          <Feather name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>

        <View style={styles.brandContainer}>
          <Image
            source={require("../../assets/emblem-transparent.png")}
            style={{ width: 26, height: 18, resizeMode: "contain", marginBottom: 2 }}
          />
          <Text style={styles.brandTitle}>NOBLE ENCLAVE</Text>
          <Text style={styles.brandSubtitle}>HOME TEXTILES • LIVING ESSENTIALS</Text>
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
          <Feather name="check-circle" size={14} color="#FFFFFF" />
          <Text style={styles.toastText} numberOfLines={1}>
            {addedToast}
          </Text>
        </View>
      )}

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {/* Collection Heading Banner (No 'atelier' copy) */}
        <View style={styles.categoryHero}>
          <View style={styles.categoryHeroLeft}>
            <Text style={styles.categoryTitle}>ALL PRODUCTS</Text>
            <Text style={styles.categoryDescription}>
              Considered textiles and furnishings for Ghanaian homes — bedding, curtains, carpets and cushions.
            </Text>
          </View>
          <View style={styles.categoryHeroRight}>
            <Feather name="grid" size={32} color={colors.gold} />
          </View>
        </View>

        {/* Search Bar */}
        <View style={styles.searchBar}>
          <Feather name="search" size={16} color={colors.textSecondary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search pieces by title, category, or material..."
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery("")}>
              <Feather name="x" size={16} color={colors.textSecondary} />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Basic Filter Pills (Clean, simple, includes Recently Stocked) */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.pillsScroll}
        >
          {FILTER_PILLS.map((pill) => {
            const isActive = activeFilter === pill.id;
            return (
              <TouchableOpacity
                key={pill.id}
                style={[styles.pill, isActive && styles.pillActive]}
                onPress={() => setActiveFilter(pill.id)}
                activeOpacity={0.8}
              >
                <Text style={[styles.pillText, isActive && styles.pillTextActive]}>
                  {pill.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Product Count Header */}
        <View style={styles.countRow}>
          <Text style={styles.countText}>
            Showing {displayedProducts.length} {displayedProducts.length === 1 ? "piece" : "pieces"}
          </Text>
          {activeFilter !== "ALL" && (
            <TouchableOpacity onPress={() => setActiveFilter("ALL")}>
              <Text style={styles.resetFilterText}>Reset filter</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Products Grid: 2 Products in a row */}
        {loading ? (
          <ActivityIndicator
            size="small"
            color={colors.primary}
            style={{ marginVertical: 40 }}
          />
        ) : displayedProducts.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Feather name="inbox" size={44} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>No pieces found</Text>
            <Text style={styles.emptySub}>
              {searchQuery
                ? `No products matched "${searchQuery}". Try a broader term.`
                : "No pieces available in this filter."}
            </Text>
            <TouchableOpacity
              style={styles.resetBtn}
              onPress={() => {
                setSearchQuery("");
                setActiveFilter("ALL");
              }}
            >
              <Text style={styles.resetBtnText}>View All Products</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.productsGrid}>
            {displayedProducts.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={[styles.productCard, { width: GRID_ITEM_WIDTH }]}
                onPress={() => onSelectProduct(item.id)}
                activeOpacity={0.9}
              >
                <View style={styles.productImageContainer}>
                  {resolveImageUrl(item.images?.[0]?.url) ? (
                    <Image
                      source={{ uri: resolveImageUrl(item.images?.[0]?.url)! }}
                      style={styles.productImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={styles.productImageFallback}>
                      <Feather name="box" size={26} color={colors.textMuted} />
                    </View>
                  )}
                </View>

                <View style={styles.productInfo}>
                  <Text style={styles.productTitle} numberOfLines={2}>
                    {item.title}
                  </Text>
                  {item.material ? (
                    <Text style={styles.productMaterial} numberOfLines={1}>
                      {item.material}
                    </Text>
                  ) : null}
                  <Text style={styles.productPrice}>
                    {formatCurrency(item.minPrice)}
                  </Text>
                </View>

                {/* Explicit Add to Cart action button (NO share button, NO plus-only icon) */}
                <TouchableOpacity
                  style={styles.addToCartBtn}
                  onPress={(e) => {
                    e.stopPropagation();
                    handleQuickAdd(item);
                  }}
                  activeOpacity={0.8}
                >
                  <Feather name="shopping-bag" size={13} color="#FFFFFF" style={{ marginRight: 6 }} />
                  <Text style={styles.addToCartBtnText}>Add to Cart</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={{ height: 40 }} />
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 10,
    backgroundColor: colors.background,
  },
  iconBtn: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  brandContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  brandTitle: {
    fontFamily: "serif",
    fontSize: 20,
    fontWeight: "700",
    color: colors.primary,
    letterSpacing: 1.5,
  },
  brandSubtitle: {
    fontSize: 9,
    fontWeight: "600",
    color: colors.gold,
    letterSpacing: 1.8,
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
    fontWeight: "bold",
  },
  toast: {
    position: "absolute",
    top: 60,
    alignSelf: "center",
    backgroundColor: colors.primary,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    zIndex: 999,
    elevation: 6,
  },
  toastText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
  },
  scrollContent: {
    paddingBottom: 24,
  },
  categoryHero: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#F9F6F0",
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 16,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  categoryHeroLeft: {
    flex: 1,
    paddingRight: 12,
  },
  categoryTitle: {
    fontFamily: "serif",
    fontSize: 18,
    fontWeight: "700",
    color: colors.primary,
    letterSpacing: 1,
    marginBottom: 4,
  },
  categoryDescription: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  categoryHeroRight: {
    alignItems: "center",
    justifyContent: "center",
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginHorizontal: 20,
    marginBottom: 14,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: colors.text,
    marginLeft: 8,
    padding: 0,
  },
  pillsScroll: {
    paddingHorizontal: 20,
    gap: 8,
    marginBottom: 16,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  pillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pillText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textSecondary,
    letterSpacing: 0.5,
  },
  pillTextActive: {
    color: "#FFFFFF",
  },
  countRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginBottom: 14,
  },
  countText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: "500",
  },
  resetFilterText: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: "600",
  },

  // 2 products in a row
  productsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 20,
    gap: 12,
  },
  productCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: 12,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    justifyContent: "space-between",
    marginBottom: 4,
  },
  productImageContainer: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: colors.surfaceElevated,
    marginBottom: 8,
  },
  productImage: {
    width: "100%",
    height: "100%",
  },
  productImageFallback: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  productInfo: {
    flex: 1,
    marginBottom: 8,
  },
  productTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text,
    lineHeight: 17,
    marginBottom: 2,
  },
  productMaterial: {
    fontSize: 11,
    color: colors.textMuted,
    marginBottom: 4,
  },
  productPrice: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.primary,
  },

  // Add to Cart Button (Explicit text, no plus-only icon)
  addToCartBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  addToCartBtnText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.4,
  },

  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    paddingHorizontal: 20,
  },
  emptyTitle: {
    fontFamily: "serif",
    fontSize: 17,
    fontWeight: "700",
    color: colors.text,
    marginTop: 14,
    marginBottom: 6,
  },
  emptySub: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 18,
    marginBottom: 20,
  },
  resetBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
  },
  resetBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "600",
  },
});
