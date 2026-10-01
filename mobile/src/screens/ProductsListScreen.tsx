import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  Image,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { colors } from "../theme/colors";
import { api } from "../services/api";
import { Product, User } from "../types";

type Props = {
  user: User;
  onSelectProduct: (productId: string) => void;
  onCreateProduct: () => void;
  onLogout: () => void;
};

const FILTERS = ["ALL", "ACTIVE", "DRAFT", "ARCHIVED", "OUT OF STOCK"];

export function ProductsListScreen({
  user,
  onSelectProduct,
  onCreateProduct,
  onLogout,
}: Props) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedFilter, setSelectedFilter] = useState("ALL");
  const [error, setError] = useState<string | null>(null);

  const fetchProducts = useCallback(async () => {
    setError(null);
    try {
      const isStockFilter = selectedFilter === "OUT OF STOCK";
      const status = isStockFilter ? undefined : selectedFilter;
      const stock = isStockFilter ? "out" : undefined;

      const res = await api.getProducts({
        q: search.trim() || undefined,
        status,
        stock,
        limit: 50,
      });
      setProducts(res.products);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load products.";
      setError(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [search, selectedFilter]);

  useEffect(() => {
    setLoading(true);
    fetchProducts();
  }, [fetchProducts]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchProducts();
  };

  const formatMoney = (minor: number) => {
    return `GH₵ ${(minor / 100).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const renderProductItem = ({ item }: { item: Product }) => {
    const mainImage = item.images?.[0]?.url;
    // Resolve relative media paths
    const fullImageUrl = mainImage
      ? mainImage.startsWith("http")
        ? mainImage
        : `${api.getBaseUrl()}${mainImage}`
      : null;

    const isOutOfStock = item.totalStock <= 0 && !item.isPreorder;

    return (
      <TouchableOpacity
        style={styles.productCard}
        onPress={() => onSelectProduct(item.id)}
        activeOpacity={0.7}
      >
        <View style={styles.cardImageContainer}>
          {fullImageUrl ? (
            <Image source={{ uri: fullImageUrl }} style={styles.cardImage} resizeMode="cover" />
          ) : (
            <View style={styles.imagePlaceholder}>
              <Text style={styles.imagePlaceholderText}>NO PHOTO</Text>
            </View>
          )}

          {item.isPreorder && (
            <View style={styles.preorderBadge}>
              <Text style={styles.preorderBadgeText}>PRE-ORDER</Text>
            </View>
          )}
        </View>

        <View style={styles.cardContent}>
          <View style={styles.cardHeaderRow}>
            <View
              style={[
                styles.statusBadge,
                item.status === "ACTIVE"
                  ? styles.statusActive
                  : item.status === "DRAFT"
                  ? styles.statusDraft
                  : styles.statusArchived,
              ]}
            >
              <Text
                style={[
                  styles.statusText,
                  item.status === "ACTIVE"
                    ? styles.statusTextActive
                    : item.status === "DRAFT"
                    ? styles.statusTextDraft
                    : styles.statusTextArchived,
                ]}
              >
                {item.status}
              </Text>
            </View>

            <Text
              style={[
                styles.stockText,
                isOutOfStock ? styles.stockOut : styles.stockIn,
              ]}
            >
              {item.isPreorder ? "Made to Order" : `${item.totalStock} in stock`}
            </Text>
          </View>

          <Text style={styles.productTitle} numberOfLines={2}>
            {item.title}
          </Text>

          {item.brand ? <Text style={styles.productBrand}>{item.brand}</Text> : null}

          <View style={styles.priceRow}>
            <Text style={styles.priceText}>{formatMoney(item.minPrice)}</Text>
            {item.compareAtPrice && item.compareAtPrice > item.minPrice && (
              <Text style={styles.comparePriceText}>
                {formatMoney(item.compareAtPrice)}
              </Text>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Top Bar */}
      <View style={styles.topBar}>
        <View>
          <Text style={styles.topLogo}>LALUXURY</Text>
          <Text style={styles.staffGreeting}>
            {user.firstName || user.email || "Staff"} ({user.role})
          </Text>
        </View>
        <TouchableOpacity style={styles.logoutBtn} onPress={onLogout}>
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      {/* Search Input */}
      <View style={styles.searchBox}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search pieces by title, SKU, or tag..."
          placeholderTextColor={colors.textSubtle}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch("")} style={styles.clearBtn}>
            <Text style={styles.clearBtnText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Filter Tabs */}
      <View style={styles.filtersContainer}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={FILTERS}
          keyExtractor={(item) => item}
          renderItem={({ item }) => {
            const isSelected = selectedFilter === item;
            return (
              <TouchableOpacity
                style={[styles.filterChip, isSelected && styles.filterChipSelected]}
                onPress={() => setSelectedFilter(item)}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    isSelected && styles.filterChipTextSelected,
                  ]}
                >
                  {item}
                </Text>
              </TouchableOpacity>
            );
          }}
          contentContainerStyle={styles.filterListContent}
        />
      </View>

      {/* Product List */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.gold} />
          <Text style={styles.loadingText}>Syncing catalog...</Text>
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={fetchProducts}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : products.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>No pieces found</Text>
          <Text style={styles.emptySubtitle}>
            {search ? "Try searching for a different keyword." : "Tap + to add your first product."}
          </Text>
        </View>
      ) : (
        <FlatList
          data={products}
          keyExtractor={(item) => item.id}
          renderItem={renderProductItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.gold}
            />
          }
        />
      )}

      {/* Add Product Floating Button */}
      <TouchableOpacity
        style={styles.fab}
        onPress={onCreateProduct}
        activeOpacity={0.8}
      >
        <Text style={styles.fabIcon}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  topLogo: {
    color: colors.gold,
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 3,
  },
  staffGreeting: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  logoutBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  logoutText: {
    color: colors.textMuted,
    fontSize: 12,
  },
  searchBox: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    paddingVertical: 10,
  },
  clearBtn: {
    padding: 6,
  },
  clearBtnText: {
    color: colors.textSubtle,
    fontSize: 14,
  },
  filtersContainer: {
    marginBottom: 8,
  },
  filterListContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipSelected: {
    backgroundColor: colors.gold,
    borderColor: colors.gold,
  },
  filterChipText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "600",
  },
  filterChipTextSelected: {
    color: "#000",
  },
  listContent: {
    padding: 16,
    paddingBottom: 90,
  },
  productCard: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  cardImageContainer: {
    width: 100,
    height: 110,
    backgroundColor: colors.card,
    position: "relative",
  },
  cardImage: {
    width: "100%",
    height: "100%",
  },
  imagePlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card,
  },
  imagePlaceholderText: {
    color: colors.textSubtle,
    fontSize: 10,
    letterSpacing: 1,
  },
  preorderBadge: {
    position: "absolute",
    bottom: 6,
    left: 6,
    backgroundColor: colors.gold,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  preorderBadgeText: {
    color: "#000",
    fontSize: 9,
    fontWeight: "700",
  },
  cardContent: {
    flex: 1,
    padding: 12,
    justifyContent: "space-between",
  },
  cardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusActive: {
    backgroundColor: colors.successBg,
  },
  statusDraft: {
    backgroundColor: colors.warningBg,
  },
  statusArchived: {
    backgroundColor: colors.surfaceLight,
  },
  statusText: {
    fontSize: 10,
    fontWeight: "700",
  },
  statusTextActive: {
    color: colors.success,
  },
  statusTextDraft: {
    color: colors.warning,
  },
  statusTextArchived: {
    color: colors.textSubtle,
  },
  stockText: {
    fontSize: 11,
  },
  stockIn: {
    color: colors.textMuted,
  },
  stockOut: {
    color: colors.error,
    fontWeight: "600",
  },
  productTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 2,
  },
  productBrand: {
    color: colors.goldLight,
    fontSize: 11,
    letterSpacing: 0.5,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
    marginTop: 4,
  },
  priceText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  comparePriceText: {
    color: colors.textSubtle,
    fontSize: 12,
    textDecorationLine: "line-through",
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  loadingText: {
    color: colors.textMuted,
    marginTop: 12,
    fontSize: 13,
  },
  errorText: {
    color: colors.error,
    fontSize: 14,
    textAlign: "center",
    marginBottom: 12,
  },
  retryBtn: {
    backgroundColor: colors.gold,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 6,
  },
  retryText: {
    color: "#000",
    fontWeight: "600",
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 6,
  },
  emptySubtitle: {
    color: colors.textMuted,
    fontSize: 13,
    textAlign: "center",
  },
  fab: {
    position: "absolute",
    bottom: 24,
    right: 24,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.gold,
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
  },
  fabIcon: {
    color: "#000",
    fontSize: 32,
    lineHeight: 34,
    fontWeight: "300",
  },
});
