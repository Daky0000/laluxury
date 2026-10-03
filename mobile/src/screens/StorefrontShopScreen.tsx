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
  Share,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { colors } from "../theme/colors";
import { api } from "../services/api";
import { Product } from "../types";
import { formatCurrency } from "../utils/format";
import { resolveImageUrl } from "../utils/image";

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
  { id: "LIVING ROOM", label: "LIVING ROOM" },
  { id: "BEDROOM", label: "BEDROOM" },
  { id: "DINING", label: "DINING" },
  { id: "LIGHTING", label: "LIGHTING" },
  { id: "PRE-ORDER", label: "PRE-ORDER" },
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
  const [activeFilter, setActiveFilter] = useState(initialFilter || "ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [addedToast, setAddedToast] = useState<string | null>(null);

  const loadProducts = useCallback(async () => {
    try {
      const res = await api.getStoreProducts({
        q: searchQuery.trim() || undefined,
        limit: 50,
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

  const onRefresh = () => {
    setRefreshing(true);
    loadProducts();
  };

  const handleQuickAdd = (product: Product) => {
    onAddToCart(product);
    setAddedToast(`Added ${product.title} to bag`);
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

  const handleShare = async (product: Product) => {
    try {
      const url = `https://laluxurys.com/product/${product.slug}`;
      const formattedPrice = formatCurrency(product.minPrice);
      await Share.share({
        title: product.title,
        message: `Check out "${product.title}" (${formattedPrice}) from Nobel Enclave Atelier & Living:\n${url}`,
        url,
      });
      if (onNotify) {
        onNotify({
          title: "Product Shared",
          message: `Link for "${product.title}" ready to share.`,
          type: "info",
          icon: "share-2",
        });
      }
    } catch {
      // Ignored
    }
  };

  // Filter products by selected pill
  const filteredProducts = products.filter((p) => {
    if (activeFilter === "ALL") return true;
    if (activeFilter === "PRE-ORDER") return p.isPreorder;

    const lowerFilter = activeFilter.toLowerCase();
    const inTitle = p.title.toLowerCase().includes(lowerFilter);
    const inTags = p.tags?.some((t) => t.toLowerCase().includes(lowerFilter));
    const inCats = p.categories?.some((c) =>
      c.name.toLowerCase().includes(lowerFilter),
    );
    return inTitle || inTags || inCats;
  });

  return (
    <View style={styles.container}>
      {/* Top Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={onBack} activeOpacity={0.7}>
          <Feather name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>

        <View style={styles.brandContainer}>
          <Text style={styles.brandTitle}>NOBEL ENCLAVE</Text>
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
        {/* Collection Heading Banner */}
        <View style={styles.categoryHero}>
          <View style={styles.categoryHeroLeft}>
            <Text style={styles.categoryTitle}>THE ATELIER CATALOG</Text>
            <Text style={styles.categoryDescription}>
              Artisan materials, sculptural silhouettes, and timeless craftsmanship designed to elevate your living spaces.
            </Text>
          </View>
          <View style={styles.categoryHeroRight}>
            <Feather name="compass" size={36} color={colors.gold} />
          </View>
        </View>

        {/* Search Bar */}
        <View style={styles.searchBar}>
          <Feather name="search" size={16} color={colors.textSecondary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search pieces by title, material, or category..."
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

        {/* Filter Pills */}
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

        {/* Product Listing */}
        {loading ? (
          <ActivityIndicator
            size="large"
            color={colors.primary}
            style={{ marginVertical: 40 }}
          />
        ) : filteredProducts.length === 0 ? (
          <View style={styles.emptyState}>
            <Feather name="inbox" size={40} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>No pieces found</Text>
            <Text style={styles.emptySub}>
              Try adjusting your filter or search keyword.
            </Text>
          </View>
        ) : (
          <View style={styles.productsList}>
            {filteredProducts.map((product) => (
              <TouchableOpacity
                key={product.id}
                style={styles.productCard}
                onPress={() => onSelectProduct(product.id)}
                activeOpacity={0.85}
              >
                {/* Product Thumbnail */}
                <View style={styles.productImageContainer}>
                  {resolveImageUrl(product.images?.[0]?.url) ? (
                    <Image
                      source={{ uri: resolveImageUrl(product.images?.[0]?.url)! }}
                      style={styles.productImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={styles.imageFallback}>
                      <Feather name="box" size={26} color={colors.textMuted} />
                    </View>
                  )}
                </View>

                {/* Product Details */}
                <View style={styles.productDetails}>
                  <Text style={styles.productTitle} numberOfLines={2}>
                    {product.title}
                  </Text>
                  {product.material ? (
                    <Text style={styles.productMaterial} numberOfLines={1}>
                      {product.material}
                    </Text>
                  ) : null}
                  <Text style={styles.productPrice}>
                    {formatCurrency(product.minPrice)}
                  </Text>
                </View>

                {/* Action Buttons (Share & Add) */}
                <View style={styles.cardActions}>
                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={(e) => {
                      e.stopPropagation();
                      handleShare(product);
                    }}
                    activeOpacity={0.7}
                  >
                    <Feather name="share-2" size={14} color={colors.primary} />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.actionBtn, styles.addCircleBtn]}
                    onPress={(e) => {
                      e.stopPropagation();
                      handleQuickAdd(product);
                    }}
                    activeOpacity={0.7}
                  >
                    <Feather name="plus" size={15} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={{ height: 60 }} />
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
    fontWeight: "600",
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  categoryHero: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginVertical: 12,
  },
  categoryHeroLeft: {
    flex: 1,
    paddingRight: 10,
  },
  categoryHeroRight: {
    opacity: 0.8,
  },
  categoryTitle: {
    fontFamily: "serif",
    fontSize: 16,
    fontWeight: "800",
    color: colors.text,
    letterSpacing: 1,
    marginBottom: 6,
  },
  categoryDescription: {
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceWarm,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginTop: 10,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.borderLight,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 12,
    color: colors.text,
    padding: 0,
  },
  pillsScroll: {
    gap: 8,
    paddingBottom: 16,
  },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.surfaceWarm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pillText: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.textSecondary,
    letterSpacing: 0.8,
  },
  pillTextActive: {
    color: "#FFFFFF",
  },
  productsList: {
    gap: 12,
    marginTop: 4,
  },
  productCard: {
    backgroundColor: colors.surfaceWarm,
    borderRadius: 18,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    position: "relative",
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  productImageContainer: {
    width: 68,
    height: 68,
    borderRadius: 14,
    backgroundColor: "#E4E0D7",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  productImage: {
    width: "100%",
    height: "100%",
  },
  imageFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  productDetails: {
    flex: 1,
    marginLeft: 14,
    paddingRight: 74,
  },
  productTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 2,
    lineHeight: 18,
  },
  productMaterial: {
    fontSize: 10,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  productPrice: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.primary,
  },
  cardActions: {
    position: "absolute",
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  actionBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.surfaceWarm,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: "center",
    justifyContent: "center",
  },
  addCircleBtn: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 50,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
  },
  emptySub: {
    fontSize: 12,
    color: colors.textMuted,
  },
});
