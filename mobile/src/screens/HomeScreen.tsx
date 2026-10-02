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
} from "react-native";
import { colors } from "../theme/colors";
import { api } from "../services/api";
import { Product, User } from "../types";

type Props = {
  user: User;
  onNavigateToCatalog: (filter?: string) => void;
  onNavigateToCreate: () => void;
  onSelectProduct: (productId: string) => void;
  onLogout: () => void;
};

export function HomeScreen({
  user,
  onNavigateToCatalog,
  onNavigateToCreate,
  onSelectProduct,
  onLogout,
}: Props) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    outOfStock: 0,
    preorder: 0,
  });

  const loadDashboardData = useCallback(async () => {
    try {
      const res = await api.getProducts({ limit: 100 });
      const all = res.products;
      setProducts(all.slice(0, 6)); // top recent pieces

      const activeCount = all.filter((p) => p.status === "ACTIVE").length;
      const outOfStockCount = all.filter((p) => p.totalStock <= 0 && !p.isPreorder).length;
      const preorderCount = all.filter((p) => p.isPreorder).length;

      setStats({
        total: res.pagination?.total ?? all.length,
        active: activeCount,
        outOfStock: outOfStockCount,
        preorder: preorderCount,
      });
    } catch {
      // Graceful fallback
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadDashboardData();
  };

  const formatMoney = (minor: number) => {
    return `GHS ${(minor / 100).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const currentDate = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  return (
    <View style={styles.container}>
      {/* Top Brand Bar */}
      <View style={styles.topBar}>
        <View>
          <Text style={styles.dateText}>{currentDate.toUpperCase()}</Text>
          <Text style={styles.brandTitle}>NOBEL ENCLAVE</Text>
          <Text style={styles.staffRole}>
            {user.firstName || user.email || "Staff"} · {user.role}
          </Text>
        </View>

        <TouchableOpacity style={styles.signOutBtn} onPress={onLogout}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.gold} />
        }
      >
        {/* Server Connection Banner */}
        <View style={styles.serverStatusBanner}>
          <View style={styles.statusDot} />
          <Text style={styles.serverStatusText} numberOfLines={1}>
            Connected: {api.getBaseUrl()}
          </Text>
        </View>

        {/* Executive Metrics Overview */}
        <View style={styles.metricsGrid}>
          <TouchableOpacity
            style={styles.metricCard}
            onPress={() => onNavigateToCatalog("ALL")}
            activeOpacity={0.8}
          >
            <Text style={styles.metricNumber}>{loading ? "-" : stats.total}</Text>
            <Text style={styles.metricLabel}>TOTAL PIECES</Text>
            <Text style={styles.metricSub}>in showroom & catalog</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.metricCard}
            onPress={() => onNavigateToCatalog("ACTIVE")}
            activeOpacity={0.8}
          >
            <Text style={[styles.metricNumber, { color: colors.success }]}>
              {loading ? "-" : stats.active}
            </Text>
            <Text style={styles.metricLabel}>ACTIVE ON STORE</Text>
            <Text style={styles.metricSub}>live for shoppers</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.metricCard, stats.outOfStock > 0 && styles.metricAlert]}
            onPress={() => onNavigateToCatalog("OUT OF STOCK")}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.metricNumber,
                { color: stats.outOfStock > 0 ? colors.error : colors.textMuted },
              ]}
            >
              {loading ? "-" : stats.outOfStock}
            </Text>
            <Text style={styles.metricLabel}>OUT OF STOCK</Text>
            <Text style={styles.metricSub}>needs warehouse restock</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.metricCard}
            onPress={() => onNavigateToCatalog("ALL")}
            activeOpacity={0.8}
          >
            <Text style={[styles.metricNumber, { color: colors.goldLight }]}>
              {loading ? "-" : stats.preorder}
            </Text>
            <Text style={styles.metricLabel}>PRE-ORDERS</Text>
            <Text style={styles.metricSub}>bespoke sourcing</Text>
          </TouchableOpacity>
        </View>

        {/* Quick Actions Bar */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeading}>QUICK ACTIONS</Text>
        </View>

        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={styles.actionBtnPrimary}
            onPress={onNavigateToCreate}
            activeOpacity={0.85}
          >
            <Text style={styles.actionIcon}>➕</Text>
            <Text style={styles.actionBtnPrimaryText}>Add Piece</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionBtnSecondary}
            onPress={() => onNavigateToCatalog("ALL")}
            activeOpacity={0.85}
          >
            <Text style={styles.actionIcon}>📦</Text>
            <Text style={styles.actionBtnSecondaryText}>All Products</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionBtnSecondary}
            onPress={() => onNavigateToCatalog("OUT OF STOCK")}
            activeOpacity={0.85}
          >
            <Text style={styles.actionIcon}>⚠️</Text>
            <Text style={styles.actionBtnSecondaryText}>Stock Alerts</Text>
          </TouchableOpacity>
        </View>

        {/* Recent Catalog Pieces */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionHeading}>RECENT PIECES</Text>
          <TouchableOpacity onPress={() => onNavigateToCatalog("ALL")}>
            <Text style={styles.viewAllText}>View All ›</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.gold} style={{ marginVertical: 24 }} />
        ) : products.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No pieces yet</Text>
            <Text style={styles.emptySub}>Tap "Add Piece" above to publish your first piece.</Text>
          </View>
        ) : (
          <View style={styles.recentList}>
            {products.map((item) => {
              const mainImage = item.images?.[0]?.url;
              const fullImageUrl = mainImage
                ? mainImage.startsWith("http")
                  ? mainImage
                  : `${api.getBaseUrl()}${mainImage}`
                : null;

              return (
                <TouchableOpacity
                  key={item.id}
                  style={styles.recentCard}
                  onPress={() => onSelectProduct(item.id)}
                  activeOpacity={0.75}
                >
                  <View style={styles.recentImgBox}>
                    {fullImageUrl ? (
                      <Image source={{ uri: fullImageUrl }} style={styles.recentImg} />
                    ) : (
                      <View style={styles.noImg}>
                        <Text style={styles.noImgText}>NO PHOTO</Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.recentDetails}>
                    <View style={styles.recentHeader}>
                      <Text style={styles.recentTitle} numberOfLines={1}>
                        {item.title}
                      </Text>
                      <View
                        style={[
                          styles.recentStatus,
                          item.status === "ACTIVE"
                            ? styles.statusActive
                            : styles.statusDraft,
                        ]}
                      >
                        <Text style={styles.recentStatusText}>{item.status}</Text>
                      </View>
                    </View>

                    <Text style={styles.recentPrice}>{formatMoney(item.minPrice)}</Text>

                    <View style={styles.recentFooter}>
                      <Text style={styles.recentStock}>
                        {item.isPreorder ? "Pre-order" : `${item.totalStock} units left`}
                      </Text>
                      <Text style={styles.editPrompt}>Tap to Edit ›</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>
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
    alignItems: "flex-end",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dateText: {
    color: colors.gold,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 2,
    marginBottom: 2,
  },
  brandTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: 4,
  },
  staffRole: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  signOutBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  signOutText: {
    color: colors.textMuted,
    fontSize: 12,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 80,
  },
  serverStatusBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success,
    marginRight: 8,
  },
  serverStatusText: {
    color: colors.textSubtle,
    fontSize: 11,
    flex: 1,
  },
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 20,
  },
  metricCard: {
    flex: 1,
    minWidth: "46%",
    backgroundColor: colors.surface,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  metricAlert: {
    borderColor: colors.error,
  },
  metricNumber: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 4,
  },
  metricLabel: {
    color: colors.goldLight,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    marginBottom: 2,
  },
  metricSub: {
    color: colors.textSubtle,
    fontSize: 11,
  },
  sectionHeader: {
    marginBottom: 10,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 16,
    marginBottom: 12,
  },
  sectionHeading: {
    color: colors.gold,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
  },
  viewAllText: {
    color: colors.goldLight,
    fontSize: 12,
    fontWeight: "600",
  },
  actionsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 16,
  },
  actionBtnPrimary: {
    flex: 1.2,
    backgroundColor: colors.gold,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  actionIcon: {
    fontSize: 20,
    marginBottom: 4,
  },
  actionBtnPrimaryText: {
    color: "#000",
    fontSize: 13,
    fontWeight: "700",
  },
  actionBtnSecondary: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  actionBtnSecondaryText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "600",
  },
  recentList: {
    gap: 12,
  },
  recentCard: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  recentImgBox: {
    width: 80,
    height: 80,
    backgroundColor: colors.card,
  },
  recentImg: {
    width: "100%",
    height: "100%",
  },
  noImg: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  noImgText: {
    color: colors.textSubtle,
    fontSize: 9,
    letterSpacing: 0.5,
  },
  recentDetails: {
    flex: 1,
    padding: 10,
    justifyContent: "space-between",
  },
  recentHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  recentTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
    marginRight: 6,
  },
  recentStatus: {
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
  recentStatusText: {
    color: colors.textMuted,
    fontSize: 9,
    fontWeight: "700",
  },
  recentPrice: {
    color: colors.goldLight,
    fontSize: 14,
    fontWeight: "700",
  },
  recentFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  recentStock: {
    color: colors.textSubtle,
    fontSize: 11,
  },
  editPrompt: {
    color: colors.gold,
    fontSize: 11,
    fontWeight: "600",
  },
  emptyCard: {
    backgroundColor: colors.surface,
    padding: 24,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  emptySub: {
    color: colors.textMuted,
    fontSize: 12,
    textAlign: "center",
  },
});
