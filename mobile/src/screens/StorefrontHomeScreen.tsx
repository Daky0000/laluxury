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
  useWindowDimensions,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { colors } from "../theme/colors";
import { api } from "../services/api";
import { Product, User, Category, AppConfig } from "../types";
import { formatCurrency } from "../utils/format";
import { resolveImageUrl } from "../utils/image";
import { getProductGridMetrics } from "../utils/layout";

type Props = {
  user: User | null;
  cartCount: number;
  onNavigateToShop: (filter?: string) => void;
  onNavigateToBag: () => void;
  onNavigateToAccount: () => void;
  onSelectProduct: (productId: string) => void;
  onAddToCart: (product: Product) => void;
  onSwitchToBackend?: () => void;
};

const DEFAULT_CATEGORIES: Category[] = [
  { id: "cat_bedding", name: "Bedding", slug: "bedding", imageUrl: "/catalog/room-bedroom.webp", position: 1, isActive: true },
  { id: "cat_curtains", name: "Curtains", slug: "curtains", imageUrl: "/catalog/window-curtain.webp", position: 2, isActive: true },
  { id: "cat_carpets", name: "Carpets", slug: "carpets", imageUrl: "/catalog/fluffy-carpet.webp", position: 3, isActive: true },
  { id: "cat_cushions", name: "Cushions", slug: "cushions", imageUrl: "/catalog/throw-pillow.webp", position: 4, isActive: true },
];

export function StorefrontHomeScreen({
  user,
  cartCount,
  onNavigateToShop,
  onNavigateToBag,
  onNavigateToAccount,
  onSelectProduct,
  onAddToCart,
  onSwitchToBackend,
}: Props) {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const isOwnerOrStaff =
    user && ["OWNER", "ADMIN", "MANAGER", "STAFF"].includes(user.role);

  const loadData = useCallback(async () => {
    try {
      const [prodRes, catRes, cfgRes] = await Promise.all([
        api.getStoreProducts({ limit: 50 }),
        api.getStoreCategories(true).catch(() => ({ categories: [] })),
        api.getStoreConfig().catch(() => null),
      ]);

      setProducts(prodRes.products || []);
      const activeCats = (catRes.categories || []).filter((c) => c.isActive !== false);
      setCategories(activeCats.length > 0 ? activeCats : DEFAULT_CATEGORIES);
      if (cfgRes) setConfig(cfgRes);
    } catch {
      // Graceful fallback
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleQuickAdd = (product: Product) => {
    onAddToCart(product);
  };

  const greetingName = user?.firstName || "Guest";
  // Categories list to display
  const displayCategories = categories.length > 0 ? categories : DEFAULT_CATEGORIES;

  // Responsive dimensions & column metrics
  const { width: windowWidth } = useWindowDimensions();
  const gridMetrics = getProductGridMetrics(windowWidth);

  // Responsive category card width for carousel:
  // - on compact phones (<340px): 1.25 cards peek
  // - on tablets/landscape (>=600px): 3.25 cards peek
  // - on standard phones: 2.25 cards peek (2 visible + 1/4 peek on right)
  const categoryCardWidth = Math.round(
    (windowWidth - 40 - 12) /
      (gridMetrics.numColumns === 1 ? 1.25 : gridMetrics.numColumns >= 3 ? 3.25 : 2.25)
  );

  // 1. Featured pieces: 2 rows of items matching responsive columns:
  // - 2 columns -> 4 products (2x2)
  // - 3 columns -> 6 products (3x2)
  // - 4 columns -> 8 products (4x2)
  // - 1 column  -> 4 products (1x4)
  const featuredLimit = gridMetrics.numColumns === 1 ? 4 : gridMetrics.numColumns * 2;
  const featuredPieces = products.slice(0, featuredLimit);

  // 2. All products: 3 rows matching responsive columns:
  // - 2 columns -> 6 products (2x3)
  // - 3 columns -> 9 products (3x3)
  // - 4 columns -> 12 products (4x3)
  // - 1 column  -> 6 products (1x6)
  const allProductsLimit = gridMetrics.numColumns === 1 ? 6 : gridMetrics.numColumns * 3;
  const recentAllProducts = [...products]
    .sort((a, b) => {
      const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime();
      return timeB - timeA;
    })
    .slice(0, allProductsLimit);

  return (
    <View style={styles.container}>
      {/* Top Header: Logo on left (no menu icon), Search + Bag on right */}
      <View style={styles.header}>
        <View style={styles.brandContainerLeft}>
          <Image
            source={require("../../assets/emblem-transparent.png")}
            style={{ width: 28, height: 20, resizeMode: "contain", marginRight: 10 }}
          />
          <View>
            <Text style={styles.brandTitle}>NOBLE ENCLAVE</Text>
            <Text style={styles.brandSubtitle}>HOME TEXTILES • LIVING ESSENTIALS</Text>
          </View>
        </View>

        {/* Search button directly before the cart bag */}
        <View style={styles.headerRightGroup}>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => onNavigateToShop()}
            activeOpacity={0.7}
          >
            <Feather name="search" size={22} color={colors.text} />
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

      {/* Dynamic Store Announcement Bar from Settings */}
      {config?.announcementBar ? (
        <View style={styles.announcementBar}>
          <Feather name="bell" size={12} color="#FFFFFF" style={{ marginRight: 6 }} />
          <Text style={styles.announcementBarText} numberOfLines={1}>
            {config.announcementBar}
          </Text>
        </View>
      ) : null}

      {/* Owner Access Quick Banner (When logged in as owner/admin) */}
      {isOwnerOrStaff && onSwitchToBackend && (
        <TouchableOpacity
          style={styles.ownerNoticeBar}
          onPress={onSwitchToBackend}
          activeOpacity={0.8}
        >
          <View style={styles.ownerNoticeLeft}>
            <Feather name="shield" size={14} color="#FFFFFF" />
            <Text style={styles.ownerNoticeText}>
              Store Owner Mode · Tap to open Backend Dashboard
            </Text>
          </View>
          <Feather name="arrow-right" size={14} color="#FFFFFF" />
        </TouchableOpacity>
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
        {/* Personalized Greeting */}
        <View style={styles.greetingSection}>
          {config?.hero?.eyebrow ? (
            <Text style={styles.heroEyebrow}>{config.hero.eyebrow}</Text>
          ) : null}
          <Text style={styles.greetingTitle}>
            {config?.hero?.title || `Welcome, ${greetingName}.`} {config?.hero?.titleAccent || ""}
          </Text>
          <Text style={styles.greetingSub}>
            {config?.hero?.body || config?.tagline || "Curated elegance for mindful spaces."}
          </Text>
        </View>

        {/* Categories Section Heading (19px) */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeading19}>Categories</Text>
        </View>

        {/* Categories Carousel */}
        <View style={styles.categoriesSection}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryCarouselContent}
            snapToInterval={categoryCardWidth + 12}
            decelerationRate="fast"
          >
            {displayCategories.map((cat) => {
              const bgUrl = resolveImageUrl(cat.imageUrl);
              return (
                <TouchableOpacity
                  key={cat.id || cat.slug}
                  style={[styles.categoryCard, { width: categoryCardWidth }]}
                  onPress={() => onNavigateToShop(cat.name)}
                  activeOpacity={0.88}
                >
                  {bgUrl ? (
                    <Image
                      source={{ uri: bgUrl }}
                      style={styles.categoryCardImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={styles.categoryFallbackBg}>
                      <Feather name="image" size={28} color={colors.textMuted} />
                    </View>
                  )}

                  {/* Dark overlay ensuring category title is visible */}
                  <View style={styles.categoryDarkOverlay} />

                  <View style={styles.categoryTitleContainer}>
                    <Text style={styles.categoryCardTitle} numberOfLines={1}>
                      {cat.name.toUpperCase()}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Featured Pieces Section (Heading: 19px, responsive 2x2 on phones, 3-column / 1-column adaptive) */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeading19}>Featured Pieces</Text>
        </View>

        {loading ? (
          <ActivityIndicator
            size="small"
            color={colors.primary}
            style={{ marginVertical: 32 }}
          />
        ) : (
          <View style={[styles.responsiveGrid, { gap: gridMetrics.gap }]}>
            {featuredPieces.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={[styles.productGridCard, { width: gridMetrics.itemWidth }]}
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
                      <Feather name="box" size={24} color={colors.textMuted} />
                    </View>
                  )}
                </View>

                <View style={styles.productInfo}>
                  <Text style={styles.productTitle} numberOfLines={2}>
                    {item.title}
                  </Text>
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

        {/* All Products Section (Heading: 19px, responsive 2-column on phone, 3-col on tablet) */}
        <View style={styles.sectionHeaderWithLink}>
          <Text style={styles.sectionHeading19}>All Products</Text>
          <TouchableOpacity onPress={() => onNavigateToShop()} activeOpacity={0.7}>
            <Text style={styles.viewAllText}>VIEW ALL ›</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator
            size="small"
            color={colors.primary}
            style={{ marginVertical: 32 }}
          />
        ) : (
          <View style={[styles.responsiveGrid, { gap: gridMetrics.gap }]}>
            {recentAllProducts.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={[styles.productGridCard, { width: gridMetrics.itemWidth }]}
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
                      <Feather name="box" size={24} color={colors.textMuted} />
                    </View>
                  )}
                </View>

                <View style={styles.productInfo}>
                  <Text style={styles.productTitle} numberOfLines={2}>
                    {item.title}
                  </Text>
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
  headerRightGroup: {
    flexDirection: "row",
    alignItems: "center",
  },
  iconBtn: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  announcementBar: {
    backgroundColor: "#5C1D29",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 7,
  },
  announcementBarText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  brandContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  brandContainerLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  brandTitle: {
    fontFamily: "serif",
    fontSize: 22,
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
  ownerNoticeBar: {
    backgroundColor: "#2B2724",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#4A4540",
  },
  ownerNoticeLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  ownerNoticeText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
  },
  toastNotice: {
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
  toastNoticeText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
  },
  scrollContent: {
    paddingBottom: 24,
  },
  greetingSection: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  greetingTitle: {
    fontFamily: "serif",
    fontSize: 24,
    fontWeight: "600",
    color: colors.text,
  },
  heroEyebrow: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
    marginBottom: 5,
    textTransform: "uppercase",
  },
  greetingSub: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 4,
    lineHeight: 18,
  },

  // Categories Carousel Section
  categoriesSection: {
    marginTop: 8,
    marginBottom: 20,
  },
  categoryCarouselContent: {
    paddingHorizontal: 20,
    gap: 12,
  },
  categoryCard: {
    height: 190,
    borderRadius: 16,
    overflow: "hidden",
    position: "relative",
    backgroundColor: "#2B2724",
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
  },
  categoryCardImage: {
    width: "100%",
    height: "100%",
  },
  categoryFallbackBg: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceElevated,
  },
  categoryDarkOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
  },
  categoryTitleContainer: {
    position: "absolute",
    inset: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  categoryCardTitle: {
    fontFamily: "serif",
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 2,
    textAlign: "center",
    textShadowColor: "rgba(0, 0, 0, 0.75)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },

  // Section Headers
  sectionHeader: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 10,
  },
  sectionHeaderWithLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 12,
  },
  sectionTitle: {
    fontFamily: "serif",
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
    letterSpacing: 1.5,
  },
  sectionHeading19: {
    fontFamily: "serif",
    fontSize: 19,
    fontWeight: "700",
    color: colors.text,
    letterSpacing: 1.2,
  },
  twoColumnGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    rowGap: 14,
  },
  responsiveGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 20,
    rowGap: 14,
  },
  productGridCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: 10,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    justifyContent: "space-between",
  },
  viewAllText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.primary,
    letterSpacing: 1,
  },

  // Featured Pieces Row (3 items)
  featuredRow: {
    paddingHorizontal: 20,
    flexDirection: "row",
    gap: 10,
  },
  featuredCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: 10,
    elevation: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    justifyContent: "space-between",
  },

  // All Products 2-column Grid
  allProductsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 20,
    gap: 12,
  },
  allProductCard: {
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
});
