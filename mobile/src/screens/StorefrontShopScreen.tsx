import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { FlashList } from "@shopify/flash-list";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import { colors } from "../theme/colors";
import { api } from "../services/api";
import { Product, ProductSort } from "../types";
import { useApp } from "../state/AppContext";
import { SmartImage } from "../components/SmartImage";
import { track } from "../lib/analytics";
import { formatCurrency } from "../utils/format";
import { getProductGridMetrics } from "../utils/layout";
import { Pager } from "../components/Pager";

type Props = {
  initialFilter?: string;
  cartCount: number;
  onBack: () => void;
  onNavigateToBag: () => void;
  onSelectProduct: (productId: string) => void;
  onAddToCart: (product: Product) => void;
};

/** "ALL" and "NEW" are fixed; every other pill is a live store category, filtered on the server. */
const ALL = "ALL";
const NEW_IN = "NEW";

const SORTS: { id: ProductSort; label: string }[] = [
  { id: "featured", label: "Featured" },
  { id: "newest", label: "Newest" },
  { id: "price_asc", label: "Price: low to high" },
  { id: "price_desc", label: "Price: high to low" },
];

// Price bands in minor units (pesewas), matching the server's Product.minPrice.
const PRICE_BANDS: { id: string; label: string; min?: number; max?: number }[] = [
  { id: "any", label: "Any price" },
  { id: "u500", label: "Under GH₵500", max: 50_000 },
  { id: "500-2000", label: "GH₵500 – 2,000", min: 50_000, max: 200_000 },
  { id: "2000+", label: "GH₵2,000+", min: 200_000 },
];

const RECENT_KEY = "lx_recent_searches";
const PAGE_SIZE = 24;

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export function StorefrontShopScreen({
  initialFilter,
  cartCount,
  onBack,
  onNavigateToBag,
  onSelectProduct,
  onAddToCart,
}: Props) {
  const { wishlistIds, toggleWishlist } = useApp();
  // Category id, or ALL / NEW. A name from the home screen is resolved once categories load.
  const [activeFilter, setActiveFilter] = useState<string>(ALL);
  const [pendingName, setPendingName] = useState(initialFilter?.trim() || "");
  const [page, setPage] = useState(1);
  const listRef = useRef<{ scrollToOffset: (o: { offset: number; animated?: boolean }) => void } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [sort, setSort] = useState<ProductSort>("featured");
  const [priceBand, setPriceBand] = useState("any");
  const [inStock, setInStock] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const term = useDebounced(searchQuery.trim(), 350);
  const { width: windowWidth } = useWindowDimensions();
  const gridMetrics = getProductGridMetrics(windowWidth);
  const band = PRICE_BANDS.find((b) => b.id === priceBand) ?? PRICE_BANDS[0];
  const effectiveSort: ProductSort = activeFilter === NEW_IN ? "newest" : sort;
  const categoryId = activeFilter !== ALL && activeFilter !== NEW_IN ? activeFilter : undefined;

  const categories = useQuery({
    queryKey: ["store-categories"],
    queryFn: () => api.getStoreCategories(),
    staleTime: 15 * 60 * 1000,
  });
  const categoryList = useMemo(() => categories.data?.categories ?? [], [categories.data]);

  // Home screen opens the shop with a category name; match it to an id.
  if (pendingName && categoryList.length) {
    const wanted = pendingName.toLowerCase();
    const hit = categoryList.find((c) => c.name.toLowerCase() === wanted || c.slug.toLowerCase() === wanted);
    setPendingName("");
    if (hit) setActiveFilter(hit.id);
    else if (/new|recent/.test(wanted)) setActiveFilter(NEW_IN);
  }

  // Any change to what is being looked at starts again from page 1.
  const filterKey = `${activeFilter}|${effectiveSort}|${priceBand}|${inStock}`;
  const [lastKey, setLastKey] = useState(filterKey);
  const [lastTerm, setLastTerm] = useState("");
  if (filterKey !== lastKey || term !== lastTerm) {
    setLastKey(filterKey);
    setLastTerm(term);
    if (page !== 1) setPage(1);
  }

  useEffect(() => {
    AsyncStorage.getItem(RECENT_KEY)
      .then((raw) => setRecent(raw ? (JSON.parse(raw) as string[]) : []))
      .catch(() => {});
  }, []);

  const rememberSearch = useCallback((q: string) => {
    const clean = q.trim();
    if (clean.length < 2) return;
    track("search", { q: clean.slice(0, 60) });
    setRecent((curr) => {
      const next = [clean, ...curr.filter((r) => r.toLowerCase() !== clean.toLowerCase())].slice(0, 8);
      AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const products = useQuery({
    queryKey: ["store-products", term, effectiveSort, band.id, inStock, categoryId ?? "", page],
    queryFn: () =>
      api.getStoreProducts({
        q: term || undefined,
        page,
        limit: PAGE_SIZE,
        sort: effectiveSort,
        categoryId,
        minPrice: band.min,
        maxPrice: band.max,
        inStock: inStock || undefined,
      }),
    placeholderData: keepPreviousData,
  });

  const goToPage = (p: number) => {
    setPage(p);
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  };

  const suggestions = useQuery({
    queryKey: ["suggest", term],
    queryFn: () => api.searchSuggestions(term),
    enabled: focused && term.length >= 2,
  });

  const displayedProducts = useMemo(() => products.data?.products ?? [], [products.data]);
  const total = products.data?.pagination.total ?? 0;
  const totalPages = products.data?.pagination.totalPages ?? 1;
  const pills = useMemo(
    () => [
      { id: ALL, label: "ALL" },
      { id: NEW_IN, label: "NEW IN" },
      ...categoryList.map((c) => ({ id: c.id, label: c.name.toUpperCase() })),
    ],
    [categoryList],
  );
  const filtersActive = sort !== "featured" || priceBand !== "any" || inStock;

  const resetAll = () => {
    setSearchQuery("");
    setActiveFilter(ALL);
    setSort("featured");
    setPriceBand("any");
    setInStock(false);
  };

  const header = (
    <View>
      <View style={styles.categoryHero}>
        <View style={styles.categoryHeroLeft}>
          <Text style={styles.categoryTitle} accessibilityRole="header">ALL PRODUCTS</Text>
          <Text style={styles.categoryDescription}>
            Considered textiles and furnishings for Ghanaian homes — bedding, curtains, carpets and cushions.
          </Text>
        </View>
        <View style={styles.categoryHeroRight}>
          <Feather name="grid" size={32} color={colors.gold} />
        </View>
      </View>

      <View style={styles.searchBar}>
        <Feather name="search" size={16} color={colors.textSecondary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search pieces by title, category, or material..."
          placeholderTextColor={colors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          onSubmitEditing={() => rememberSearch(searchQuery)}
          returnKeyType="search"
          accessibilityLabel="Search products"
        />
        {searchQuery ? (
          <TouchableOpacity onPress={() => setSearchQuery("")} accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={10}>
            <Feather name="x" size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          onPress={() => setShowFilters((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel="Sort and filter"
          accessibilityState={{ expanded: showFilters }}
          hitSlop={10}
          style={{ marginLeft: 10 }}
        >
          <Feather name="sliders" size={17} color={filtersActive ? colors.primary : colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {focused && !searchQuery && recent.length > 0 ? (
        <View style={styles.suggestBox}>
          <View style={styles.suggestHead}>
            <Text style={styles.suggestTitle}>RECENT SEARCHES</Text>
            <TouchableOpacity
              onPress={() => {
                setRecent([]);
                AsyncStorage.removeItem(RECENT_KEY).catch(() => {});
              }}
              accessibilityRole="button"
            >
              <Text style={styles.resetFilterText}>Clear</Text>
            </TouchableOpacity>
          </View>
          {recent.map((r) => (
            <TouchableOpacity key={r} style={styles.suggestRow} onPress={() => setSearchQuery(r)} accessibilityRole="button">
              <Feather name="clock" size={14} color={colors.textMuted} />
              <Text style={styles.suggestText}>{r}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      {focused && term.length >= 2 && (suggestions.data?.results.length ?? 0) > 0 ? (
        <View style={styles.suggestBox}>
          {suggestions.data!.results.map((s) => (
            <TouchableOpacity
              key={s.id}
              style={styles.suggestRow}
              onPress={() => {
                rememberSearch(searchQuery);
                onSelectProduct(s.id);
              }}
              accessibilityRole="button"
              accessibilityLabel={`${s.title}, ${formatCurrency(s.minPrice)}`}
            >
              <SmartImage uri={s.images[0]?.url} style={styles.suggestImg} />
              <Text style={[styles.suggestText, { flex: 1 }]} numberOfLines={1}>{s.title}</Text>
              <Text style={styles.suggestPrice}>{formatCurrency(s.minPrice)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      {showFilters ? (
        <View style={styles.filterPanel}>
          <Text style={styles.suggestTitle}>SORT</Text>
          <View style={styles.chipRow}>
            {SORTS.map((s) => (
              <TouchableOpacity
                key={s.id}
                style={[styles.pill, sort === s.id && styles.pillActive]}
                onPress={() => setSort(s.id)}
                accessibilityRole="radio"
                accessibilityState={{ selected: sort === s.id }}
              >
                <Text style={[styles.pillText, sort === s.id && styles.pillTextActive]}>{s.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.suggestTitle}>PRICE</Text>
          <View style={styles.chipRow}>
            {PRICE_BANDS.map((b) => (
              <TouchableOpacity
                key={b.id}
                style={[styles.pill, priceBand === b.id && styles.pillActive]}
                onPress={() => setPriceBand(b.id)}
                accessibilityRole="radio"
                accessibilityState={{ selected: priceBand === b.id }}
              >
                <Text style={[styles.pillText, priceBand === b.id && styles.pillTextActive]}>{b.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity
            style={styles.stockRow}
            onPress={() => setInStock((v) => !v)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: inStock }}
          >
            <Feather name={inStock ? "check-square" : "square"} size={18} color={inStock ? colors.primary : colors.textSecondary} />
            <Text style={styles.suggestText}>In stock or available to pre-order</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillsScroll}>
        {pills.map((pill) => {
          const isActive = activeFilter === pill.id;
          return (
            <TouchableOpacity
              key={pill.id}
              style={[styles.pill, isActive && styles.pillActive]}
              onPress={() => setActiveFilter(pill.id)}
              activeOpacity={0.8}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
            >
              <Text style={[styles.pillText, isActive && styles.pillTextActive]}>{pill.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={styles.countRow}>
        <Text style={styles.countText}>
          {`${total} ${total === 1 ? "piece" : "pieces"}`}
          {totalPages > 1 ? ` · page ${page} of ${totalPages}` : ""}
        </Text>
        {activeFilter !== ALL || filtersActive || term ? (
          <TouchableOpacity onPress={resetAll} accessibilityRole="button">
            <Text style={styles.resetFilterText}>Reset filters</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={onBack} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Back">
          <Feather name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>

        <View style={styles.brandContainer}>
          <Image
            source={require("../../assets/emblem-transparent.png")}
            contentFit="contain"
            accessibilityLabel="Noble Enclave"
            style={{ width: 26, height: 18, marginBottom: 2 }}
          />
          <Text style={styles.brandTitle}>NOBLE ENCLAVE</Text>
          <Text style={styles.brandSubtitle}>HOME TEXTILES • LIVING ESSENTIALS</Text>
        </View>

        <TouchableOpacity
          style={styles.iconBtn}
          onPress={onNavigateToBag}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Bag, ${cartCount} item${cartCount === 1 ? "" : "s"}`}
        >
          <Feather name="shopping-bag" size={22} color={colors.text} />
          {cartCount > 0 && (
            <View style={styles.cartBadge}>
              <Text style={styles.cartBadgeText}>{cartCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <FlashList
        ref={listRef as never}
        data={products.isLoading ? [] : displayedProducts}
        numColumns={2}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scrollContent}
        ListHeaderComponent={header}
        refreshControl={
          <RefreshControl refreshing={products.isRefetching && !products.isPlaceholderData} onRefresh={() => products.refetch()} tintColor={colors.primary} />
        }
        ListFooterComponent={
          products.isLoading ? (
            <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 30 }} />
          ) : (
            <View style={{ paddingBottom: 40 }}>
              {products.isPlaceholderData && <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 12 }} />}
              <Pager page={page} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} onChange={goToPage} disabled={products.isPlaceholderData} />
            </View>
          )
        }
        ListEmptyComponent={
          products.isLoading ? null : products.isError ? (
            <View style={styles.emptyContainer}>
              <Feather name="wifi-off" size={40} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>Couldn't load products</Text>
              <TouchableOpacity style={styles.resetBtn} onPress={() => products.refetch()}>
                <Text style={styles.resetBtnText}>Try again</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <Feather name="inbox" size={44} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>No pieces found</Text>
              <Text style={styles.emptySub}>
                {term ? `No products matched "${term}". Try a broader term.` : "No pieces match these filters."}
              </Text>
              <TouchableOpacity style={styles.resetBtn} onPress={resetAll}>
                <Text style={styles.resetBtnText}>View All Products</Text>
              </TouchableOpacity>
            </View>
          )
        }
        renderItem={({ item, index }) => (
          <View style={{ width: gridMetrics.itemWidth, marginLeft: index % 2 === 1 ? gridMetrics.gap : 0, marginBottom: gridMetrics.gap }}>
            <TouchableOpacity
              style={[styles.productCard, { width: gridMetrics.itemWidth }]}
              onPress={() => onSelectProduct(item.id)}
              activeOpacity={0.9}
              accessibilityRole="button"
              accessibilityLabel={`${item.title}, ${formatCurrency(item.minPrice)}`}
            >
              <View style={styles.productImageContainer}>
                {item.images?.[0]?.url ? (
                  <SmartImage uri={item.images[0].url} alt={item.title} style={styles.productImage} />
                ) : (
                  <View style={styles.productImageFallback}>
                    <Feather name="box" size={26} color={colors.textMuted} />
                  </View>
                )}
                <TouchableOpacity
                  style={styles.heartBtn}
                  onPress={() => toggleWishlist(item.id)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={wishlistIds.has(item.id) ? `Remove ${item.title} from saved` : `Save ${item.title}`}
                >
                  <Feather name="heart" size={15} color={wishlistIds.has(item.id) ? colors.primary : colors.text} />
                </TouchableOpacity>
              </View>

              <View style={styles.productInfo}>
                <Text style={styles.productTitle} numberOfLines={2}>{item.title}</Text>
                {item.material ? <Text style={styles.productMaterial} numberOfLines={1}>{item.material}</Text> : null}
                <Text style={styles.productPrice}>{formatCurrency(item.minPrice)}</Text>
              </View>

              <TouchableOpacity
                style={styles.addToCartBtn}
                onPress={() => onAddToCart(item)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={`Add ${item.title} to bag`}
              >
                <Feather name="shopping-bag" size={13} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.addToCartBtnText}>Add to Cart</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  suggestBox: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 8,
    paddingVertical: 6,
    marginBottom: 12,
  },
  suggestHead: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 6 },
  suggestTitle: { fontSize: 10, fontWeight: "800", letterSpacing: 1.3, color: colors.textMuted, marginBottom: 6 },
  suggestRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 9 },
  suggestText: { fontSize: 14, color: colors.text },
  suggestImg: { width: 34, height: 40, borderRadius: 4, backgroundColor: colors.surfaceCard },
  suggestPrice: { fontSize: 13, fontWeight: "700", color: colors.primary },
  filterPanel: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 8,
    padding: 14,
    marginBottom: 12,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 },
  stockRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  heartBtn: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(255,255,255,0.9)",
    alignItems: "center",
    justifyContent: "center",
  },
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
    fontSize: 19,
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
