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
  Share,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { colors } from "../theme/colors";
import { api } from "../services/api";
import { Product, User, Category, AppConfig } from "../types";
import { formatCurrency } from "../utils/format";
import { resolveImageUrl } from "../utils/image";


type Props = {
  user: User | null;
  cartCount: number;
  onNavigateToShop: (filter?: string) => void;
  onNavigateToBag: () => void;
  onNavigateToAccount: () => void;
  onSelectProduct: (productId: string) => void;
  onAddToCart: (product: Product) => void;
  onSwitchToBackend?: () => void;
  onNotify?: (notif: {
    title: string;
    message?: string;
    type?: "success" | "info" | "warning" | "error";
    icon?: keyof typeof Feather.glyphMap;
  }) => void;
};

export function StorefrontHomeScreen({
  user,
  cartCount,
  onNavigateToShop,
  onNavigateToBag,
  onNavigateToAccount,
  onSelectProduct,
  onAddToCart,
  onSwitchToBackend,
  onNotify,
}: Props) {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [addedNotice, setAddedNotice] = useState<string | null>(null);

  const isOwnerOrStaff =
    user && ["OWNER", "ADMIN", "MANAGER", "STAFF"].includes(user.role);

  const loadData = useCallback(async () => {
    try {
      const [prodRes, catRes, cfgRes] = await Promise.all([
        api.getStoreProducts({ limit: 12 }),
        api.getStoreCategories().catch(() => ({ categories: [] })),
        api.getStoreConfig().catch(() => null),
      ]);

      setProducts(prodRes.products || []);
      setCategories(catRes.categories || []);
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
    setAddedNotice(`Added "${product.title}" to bag`);
    setTimeout(() => setAddedNotice(null), 2500);
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
      const url = `https://nobleenclave.com/product/${product.slug}`;
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

  const featuredHero = products[0];
  const greetingName = user?.firstName || "Guest";

  return (
    <View style={styles.container}>
      {/* Top Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={onNavigateToAccount}
          activeOpacity={0.7}
        >
          <Feather name="menu" size={22} color={colors.text} />
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

      {/* Toast Notice when item added */}
      {addedNotice && (
        <View style={styles.toastNotice}>
          <Feather name="check" size={14} color="#FFFFFF" />
          <Text style={styles.toastNoticeText} numberOfLines={1}>
            {addedNotice}
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
        {/* Personalized Greeting */}
        <View style={styles.greetingSection}>
          <Text style={styles.greetingTitle}>
            Welcome, {greetingName}.
          </Text>
          <Text style={styles.greetingSub}>
            {config?.tagline || "Curated elegance for mindful spaces."}
          </Text>
        </View>

        {/* Hero Showcase Card */}
        <View style={styles.heroCard}>
          <View style={styles.heroContent}>
            <Text style={styles.heroTag}>
              {(config?.hero?.eyebrow || "THE ATELIER COLLECTION").toUpperCase()}
            </Text>
            <Text style={styles.heroSubTag}>
              {config?.hero
                ? `${config.hero.title} ${config.hero.titleAccent}`.toUpperCase()
                : "BESPOKE LIVING & SEATING"}
            </Text>
            <TouchableOpacity
              style={styles.heroButton}
              onPress={() => {
                if (featuredHero) onSelectProduct(featuredHero.id);
                else onNavigateToShop();
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.heroButtonText}>SHOP NOW</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.heroImageWrapper}>
            {resolveImageUrl(featuredHero?.images?.[0]?.url) ? (
              <Image
                source={{ uri: resolveImageUrl(featuredHero?.images?.[0]?.url)! }}
                style={styles.heroImage}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.heroPlaceholder}>
                <Feather name="box" size={44} color={colors.primaryLight} />
                <Text style={styles.heroPlaceholderText}>NOBEL ENCLAVE</Text>
              </View>
            )}
          </View>
        </View>

        {/* Explore Our Collection Section */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>EXPLORE OUR COLLECTION</Text>
          <TouchableOpacity
            onPress={() => onNavigateToShop()}
            activeOpacity={0.7}
          >
            <Text style={styles.viewAllText}>VIEW ALL</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.collectionScroll}
        >
          {(categories.length > 0
            ? categories.map((cat, idx) => ({
                id: cat.id,
                name: cat.name.toUpperCase(),
                icon: (["home", "moon", "coffee", "sun", "award", "feather", "box"][idx % 7]) as any,
              }))
            : [
                { id: "living", name: "LIVING ROOM", icon: "home" },
                { id: "bedroom", name: "BEDROOM", icon: "moon" },
                { id: "dining", name: "DINING", icon: "coffee" },
                { id: "lighting", name: "LIGHTING", icon: "sun" },
                { id: "decor", name: "DECOR", icon: "award" },
              ]
          ).map((cat) => (
            <TouchableOpacity
              key={cat.id}
              style={styles.collectionItem}
              onPress={() => onNavigateToShop(cat.name)}
              activeOpacity={0.8}
            >
              <View style={styles.collectionCircle}>
                <Feather name={cat.icon as any} size={22} color={colors.primary} />
              </View>
              <Text style={styles.collectionLabel}>{cat.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Editorial Craftsmanship Banner */}

        <TouchableOpacity
          style={styles.editorialBanner}
          onPress={() => onNavigateToShop()}
          activeOpacity={0.85}
        >
          <View style={styles.editorialIconContainer}>
            <Feather name="compass" size={24} color={colors.primary} />
          </View>
          <View style={styles.editorialTextContainer}>
            <Text style={styles.editorialTitle}>CRAFTED WITH INTENT. TIMELESS LIVING.</Text>
            <Text style={styles.editorialAction}>DISCOVER THE ATELIER ›</Text>
          </View>
        </TouchableOpacity>

        {/* Curated Products Section */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>FEATURED PIECES</Text>
          <TouchableOpacity
            onPress={() => onNavigateToShop()}
            activeOpacity={0.7}
          >
            <Text style={styles.viewAllText}>SEE ALL ({products.length})</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator
            size="small"
            color={colors.primary}
            style={{ marginVertical: 32 }}
          />
        ) : (
          <View style={styles.productsGrid}>
            {products.slice(0, 8).map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.productCard}
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

                {/* Action Buttons (Share & Add) */}
                <View style={styles.cardActions}>
                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={(e) => {
                      e.stopPropagation();
                      handleShare(item);
                    }}
                    activeOpacity={0.7}
                  >
                    <Feather name="share-2" size={14} color={colors.primary} />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.actionBtn, styles.addCircleBtn]}
                    onPress={(e) => {
                      e.stopPropagation();
                      handleQuickAdd(item);
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
    width: 40,
    height: 40,
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
  ownerNoticeBar: {
    backgroundColor: colors.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  ownerNoticeLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  ownerNoticeText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  toastNotice: {
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
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  toastNoticeText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  greetingSection: {
    marginTop: 10,
    marginBottom: 16,
  },
  greetingTitle: {
    fontFamily: "serif",
    fontSize: 20,
    fontWeight: "700",
    color: colors.text,
    letterSpacing: 0.2,
  },
  greetingSub: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 3,
  },
  heroCard: {
    backgroundColor: colors.surfaceCard,
    borderRadius: 20,
    padding: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 24,
    minHeight: 180,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  heroContent: {
    flex: 1,
    paddingRight: 10,
  },
  heroTag: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.primary,
    letterSpacing: 1,
    marginBottom: 4,
  },
  heroSubTag: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.textSecondary,
    letterSpacing: 0.8,
    marginBottom: 16,
  },
  heroButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 20,
    alignSelf: "flex-start",
  },
  heroButtonText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
  },
  heroImageWrapper: {
    width: 120,
    height: 140,
    borderRadius: 14,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E4E0D7",
  },
  heroImage: {
    width: "100%",
    height: "100%",
  },
  heroPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  heroPlaceholderText: {
    fontFamily: "serif",
    fontSize: 11,
    fontWeight: "700",
    color: colors.primary,
    letterSpacing: 1.5,
    marginTop: 6,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
    marginTop: 6,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.text,
    letterSpacing: 1,
  },
  viewAllText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.primary,
    textDecorationLine: "underline",
    letterSpacing: 0.5,
  },
  collectionScroll: {
    paddingBottom: 16,
    gap: 16,
  },
  collectionItem: {
    alignItems: "center",
    width: 80,
  },
  collectionCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.surfaceWarm,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  collectionLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: colors.textSecondary,
    textAlign: "center",
    letterSpacing: 0.5,
  },
  editorialBanner: {
    backgroundColor: colors.surfaceWarm,
    borderRadius: 14,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  editorialIconContainer: {
    marginRight: 14,
  },
  editorialTextContainer: {
    flex: 1,
  },
  editorialTitle: {
    fontFamily: "serif",
    fontSize: 12,
    fontWeight: "700",
    color: colors.text,
    letterSpacing: 0.8,
  },
  editorialAction: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.primary,
    marginTop: 2,
    letterSpacing: 0.5,
  },
  productsGrid: {
    gap: 12,
  },
  productCard: {
    backgroundColor: colors.surfaceWarm,
    borderRadius: 16,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    position: "relative",
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  productImageContainer: {
    width: 66,
    height: 66,
    borderRadius: 12,
    backgroundColor: "#E4E0D7",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  productImage: {
    width: "100%",
    height: "100%",
  },
  productImageFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  productInfo: {
    flex: 1,
    marginLeft: 14,
    paddingRight: 74,
  },
  productTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 2,
  },
  productMaterial: {
    fontSize: 10,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  productPrice: {
    fontSize: 13,
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
});
