import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Image,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { colors } from "../theme/colors";
import { api } from "../services/api";
import { User, DashboardData } from "../types";
import { formatCurrency, formatDate } from "../utils/format";
import { CustomNotificationModal } from "../components/CustomNotificationModal";
import { OrderPromptModal, OrderPromptData } from "../components/OrderPromptModal";
import { PopNotificationData } from "../components/PopNotification";

type Props = {
  user: User;
  onNavigateToProducts: () => void;
  onNavigateToCreate: () => void;
  onSelectProduct: (productId: string) => void;
  onSwitchToStorefront: () => void;
  onNavigateToStoreDesign?: () => void;
  onNavigateToOrders?: () => void;
  onNavigateToDeliverySettings?: () => void;
  onLogout: () => void;
  onNotify?: (data: PopNotificationData) => void;
};

export function BackendDashboardScreen({
  user,
  onNavigateToProducts,
  onNavigateToCreate,
  onSelectProduct,
  onSwitchToStorefront,
  onNavigateToStoreDesign,
  onNavigateToOrders,
  onNavigateToDeliverySettings,
  onLogout,
  onNotify,
}: Props) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const [selectedOrderForPrompt, setSelectedOrderForPrompt] = useState<OrderPromptData | null>(null);
  const [orderFilter, setOrderFilter] = useState<"all" | "pending">("all");

  const loadData = useCallback(async () => {
    try {
      const res = await api.getDashboard();
      setData(res);
    } catch {
      // Graceful fallback to products count if needed
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

  const pendingOrders = (data?.recentOrders || []).filter(
    (o) => o.fulfillmentStatus !== "FULFILLED" || o.status === "PENDING"
  );
  const displayedOrders =
    orderFilter === "pending" ? pendingOrders : (data?.recentOrders || []);

  return (
    <View style={styles.container}>
      {/* Top Backend Navigation Bar */}
      <View style={styles.topBar}>
        <View>
          <View style={styles.badgeRow}>
            <View style={styles.liveIndicator} />
            <Text style={styles.portalTitle}>NOBLE ENCLAVE BACKEND</Text>
          </View>
          <Text style={styles.ownerTitle}>
            {user.firstName || user.email?.split("@")[0] || "Owner"} · {user.role}
          </Text>
        </View>

        {/* View Customer Storefront Button */}
        <TouchableOpacity
          style={styles.storefrontBtn}
          onPress={onSwitchToStorefront}
          activeOpacity={0.8}
        >
          <Feather name="eye" size={14} color="#FFFFFF" />
          <Text style={styles.storefrontBtnText}>View Store</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.gold}
          />
        }
      >
        {/* KPI Grid */}
        <View style={styles.kpiGrid}>
          {/* Revenue */}
          <View style={styles.kpiCard}>
            <View style={styles.kpiHeader}>
              <Text style={styles.kpiLabel}>30-DAY REVENUE</Text>
              <Feather name="trending-up" size={16} color={colors.gold} />
            </View>
            <Text style={styles.kpiValue}>
              {loading
                ? "..."
                : formatCurrency(data?.metrics.totalRevenue ?? 0)}
            </Text>
            <Text style={styles.kpiSub}>From completed sales</Text>
          </View>

          {/* Orders */}
          <View style={styles.kpiCard}>
            <View style={styles.kpiHeader}>
              <Text style={styles.kpiLabel}>ORDERS COUNT</Text>
              <Feather name="shopping-bag" size={16} color="#4ADE80" />
            </View>
            <Text style={styles.kpiValue}>
              {loading ? "..." : (data?.metrics.ordersCount ?? 0)}
            </Text>
            <Text style={styles.kpiSub}>Past 30 days</Text>
          </View>

          {/* Pending Fulfilment (Interactive: tap to filter & send direct prompt) */}
          <TouchableOpacity
            style={[
              styles.kpiCard,
              orderFilter === "pending" && styles.kpiCardActive,
            ]}
            onPress={() =>
              setOrderFilter((prev) => (prev === "pending" ? "all" : "pending"))
            }
            activeOpacity={0.8}
          >
            <View style={styles.kpiHeader}>
              <Text
                style={[
                  styles.kpiLabel,
                  orderFilter === "pending" && { color: "#FBBF24" },
                ]}
              >
                ORDERS TO PACK
              </Text>
              <Feather name="package" size={16} color="#FBBF24" />
            </View>
            <Text style={styles.kpiValue}>
              {loading ? "..." : (data?.metrics.pendingFulfilment ?? 0)}
            </Text>
            <Text style={styles.kpiSub}>
              {orderFilter === "pending"
                ? "Active: showing pending orders"
                : "Tap to view & prompt"}
            </Text>
          </TouchableOpacity>

          {/* Active Products */}
          <View style={styles.kpiCard}>
            <View style={styles.kpiHeader}>
              <Text style={styles.kpiLabel}>CATALOG PRODUCTS</Text>
              <Feather name="box" size={16} color="#60A5FA" />
            </View>
            <Text style={styles.kpiValue}>
              {loading ? "..." : (data?.metrics.activeProducts ?? 0)}
            </Text>
            <Text style={styles.kpiSub}>
              {data?.metrics.totalProducts ?? 0} total in database
            </Text>
          </View>
        </View>

        {/* Quick Action Buttons */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.actionBtnPrimary}
            onPress={onNavigateToCreate}
            activeOpacity={0.8}
          >
            <Feather name="plus-circle" size={16} color="#FFFFFF" />
            <Text style={styles.actionBtnText}>Add Product</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionBtnSecondary}
            onPress={onNavigateToProducts}
            activeOpacity={0.8}
          >
            <Feather name="box" size={16} color={colors.gold} />
            <Text style={styles.actionBtnSecondaryText}>Manage Catalog</Text>
          </TouchableOpacity>
        </View>

        {/* Custom Notification / SMS Broadcast Quick Action */}
        <TouchableOpacity
          style={styles.actionBtnNotif}
          onPress={() => setShowNotificationModal(true)}
          activeOpacity={0.8}
        >
          <View style={styles.notifIconCircle}>
            <Feather name="bell" size={16} color={colors.gold} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.notifActionTitle}>SEND CUSTOM NOTIFICATION</Text>
            <Text style={styles.notifActionSub}>Direct customer SMS or storewide banner</Text>
          </View>
          <Feather name="chevron-right" size={16} color={colors.gold} />
        </TouchableOpacity>

        {/* Store Design Quick Action */}
        {onNavigateToStoreDesign && (
          <TouchableOpacity
            style={[styles.actionBtnNotif, { marginTop: 10 }]}
            onPress={onNavigateToStoreDesign}
            activeOpacity={0.8}
          >
            <View style={styles.notifIconCircle}>
              <Feather name="layout" size={16} color={colors.gold} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.notifActionTitle}>STORE DESIGN</Text>
              <Text style={styles.notifActionSub}>Manage category cards & background photos</Text>
            </View>
            <Feather name="chevron-right" size={16} color={colors.gold} />
          </TouchableOpacity>
        )}

        {/* Delivery Zones & Shipping Rates Quick Action */}
        {onNavigateToDeliverySettings && (
          <TouchableOpacity
            style={[styles.actionBtnNotif, { marginTop: 10 }]}
            onPress={onNavigateToDeliverySettings}
            activeOpacity={0.8}
          >
            <View style={styles.notifIconCircle}>
              <Feather name="truck" size={16} color={colors.gold} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.notifActionTitle}>DELIVERY ZONES & RATES</Text>
              <Text style={styles.notifActionSub}>Manage delivery fees and regional shipping</Text>
            </View>
            <Feather name="chevron-right" size={16} color={colors.gold} />
          </TouchableOpacity>
        )}

        {/* Low Stock Alerts */}
        {data?.lowStockItems && data.lowStockItems.length > 0 && (
          <View style={styles.sectionContainer}>
            <View style={styles.sectionHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Feather name="alert-triangle" size={16} color={colors.warning} />
                <Text style={styles.sectionTitle}>LOW STOCK ALERTS</Text>
              </View>
              <TouchableOpacity onPress={onNavigateToProducts}>
                <Text style={styles.sectionLink}>Manage</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.lowStockList}>
              {data.lowStockItems.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.lowStockCard}
                  onPress={() => onSelectProduct(item.productId)}
                  activeOpacity={0.8}
                >
                  <View style={styles.lowStockImageWrap}>
                    {item.imageUrl ? (
                      <Image
                        source={{ uri: item.imageUrl }}
                        style={styles.lowStockImage}
                        resizeMode="cover"
                      />
                    ) : (
                      <Feather name="box" size={18} color="#8E9889" />
                    )}
                  </View>
                  <View style={styles.lowStockInfo}>
                    <Text style={styles.lowStockTitle} numberOfLines={1}>
                      {item.productTitle}
                    </Text>
                    <Text style={styles.lowStockSku}>SKU: {item.sku}</Text>
                  </View>
                  <View style={styles.stockBadge}>
                    <Text style={styles.stockBadgeText}>
                      {item.stock} left
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Store Orders & Direct Prompts */}
        <View style={styles.sectionContainer}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>STORE ORDERS & PROMPTS</Text>
              <Text style={styles.sectionSub}>Tap any order to send direct prompt</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              {pendingOrders.length > 0 && (
                <View style={styles.pendingBadgeHeader}>
                  <Text style={styles.pendingBadgeHeaderText}>
                    {pendingOrders.length} TO PACK
                  </Text>
                </View>
              )}
              {onNavigateToOrders && (
                <TouchableOpacity
                  onPress={onNavigateToOrders}
                  style={{ flexDirection: "row", alignItems: "center", gap: 3 }}
                >
                  <Text style={{ fontSize: 12, fontWeight: "700", color: colors.gold }}>All Orders</Text>
                  <Feather name="arrow-right" size={13} color={colors.gold} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Filter Pills */}
          <View style={styles.orderFilterRow}>
            <TouchableOpacity
              style={[
                styles.filterChip,
                orderFilter === "all" && styles.filterChipActive,
              ]}
              onPress={() => setOrderFilter("all")}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.filterChipText,
                  orderFilter === "all" && styles.filterChipTextActive,
                ]}
              >
                All Orders ({data?.recentOrders?.length ?? 0})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.filterChip,
                orderFilter === "pending" && styles.filterChipActive,
              ]}
              onPress={() => setOrderFilter("pending")}
              activeOpacity={0.7}
            >
              <Feather
                name="package"
                size={12}
                color={orderFilter === "pending" ? "#FFFFFF" : "#FBBF24"}
                style={{ marginRight: 4 }}
              />
              <Text
                style={[
                  styles.filterChipText,
                  orderFilter === "pending" && styles.filterChipTextActive,
                ]}
              >
                Orders to Pack ({pendingOrders.length})
              </Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <ActivityIndicator size="small" color={colors.gold} style={{ marginVertical: 20 }} />
          ) : displayedOrders.length === 0 ? (
            <View style={styles.emptyOrders}>
              <Feather name="check-circle" size={24} color="#10B981" style={{ marginBottom: 6 }} />
              <Text style={styles.emptyText}>
                {orderFilter === "pending"
                  ? "All pending orders have been packed and dispatched!"
                  : "No store orders recorded yet."}
              </Text>
            </View>
          ) : (
            <View style={styles.ordersList}>
              {displayedOrders.map((ord) => (
                <TouchableOpacity
                  key={ord.id}
                  style={styles.orderRow}
                  onPress={() => setSelectedOrderForPrompt(ord)}
                  activeOpacity={0.75}
                >
                  <View style={styles.orderLeft}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 }}>
                      <Text style={styles.orderNumber}>#{ord.orderNumber}</Text>
                      {ord.fulfillmentStatus !== "FULFILLED" && (
                        <View style={styles.pendingTag}>
                          <Text style={styles.pendingTagText}>TO PACK</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.orderCustomer}>{ord.customerName}</Text>
                    <View style={styles.orderMetaRow}>
                      <Text style={styles.orderDate}>{formatDate(ord.placedAt)}</Text>
                      {ord.customerPhone ? (
                        <Text style={styles.orderPhoneTag}>• {ord.customerPhone}</Text>
                      ) : null}
                    </View>
                  </View>
                  <View style={styles.orderRight}>
                    <Text style={styles.orderTotal}>
                      {formatCurrency(ord.total, ord.currency)}
                    </Text>
                    <View
                      style={[
                        styles.orderStatusBadge,
                        ord.paymentStatus === "PAID"
                          ? styles.statusPaid
                          : styles.statusPending,
                      ]}
                    >
                      <Text style={styles.orderStatusText}>{ord.status}</Text>
                    </View>
                    <View style={styles.promptActionBtn}>
                      <Feather name="send" size={10} color={colors.gold} style={{ marginRight: 4 }} />
                      <Text style={styles.promptActionBtnText}>Prompt</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Connected API Info */}
        <View style={styles.footerInfo}>
          <Text style={styles.footerLabel}>LIVE BACKEND SYNCHRONIZATION</Text>
          <Text style={styles.footerUrl}>{api.getBaseUrl()}</Text>
          <Text style={styles.footerSub}>
            All edits and inventory changes update the website in real-time.
          </Text>
        </View>

        <View style={{ height: 60 }} />
      </ScrollView>

      {/* Owner Custom Notification / Banner Modal */}
      <CustomNotificationModal
        visible={showNotificationModal}
        onClose={() => setShowNotificationModal(false)}
        onSuccess={(msg) => {
          if (onNotify) {
            onNotify({
              title: "Notification Sent",
              message: msg,
              type: "success",
              icon: "check-circle",
            });
          }
        }}
        onError={(err) => {
          if (onNotify) {
            onNotify({
              title: "Failed to Send",
              message: err,
              type: "error",
              icon: "alert-circle",
            });
          }
        }}
      />

      {/* Owner Direct Prompt to Customer for Pending Order */}
      <OrderPromptModal
        visible={!!selectedOrderForPrompt}
        order={selectedOrderForPrompt}
        onClose={() => setSelectedOrderForPrompt(null)}
        onSuccess={(msg) => {
          if (onNotify) {
            onNotify({
              title: "Prompt Sent",
              message: msg,
              type: "success",
              icon: "send",
            });
          }
        }}
        onError={(err) => {
          if (onNotify) {
            onNotify({
              title: "Prompt Failed",
              message: err,
              type: "error",
              icon: "alert-circle",
            });
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  actionBtnNotif: {
    backgroundColor: colors.darkSurface,
    borderRadius: 14,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "rgba(212, 175, 55, 0.35)",
  },
  notifIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(212, 175, 55, 0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  notifActionTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: 1,
    marginBottom: 2,
  },
  notifActionSub: {
    fontSize: 11,
    color: "#9CA3AF",
  },
  container: {
    flex: 1,
    backgroundColor: colors.darkBg,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 14,
    backgroundColor: colors.darkSurface,
    borderBottomWidth: 1,
    borderBottomColor: colors.darkBorder,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  liveIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#10B981",
  },
  portalTitle: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.gold,
    letterSpacing: 1.5,
  },
  ownerTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
    marginTop: 2,
  },
  storefrontBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    gap: 6,
  },
  storefrontBtnText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 16,
  },
  kpiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 16,
  },
  kpiCard: {
    flex: 1,
    minWidth: "45%",
    backgroundColor: colors.darkSurface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.darkBorder,
  },
  kpiCardActive: {
    borderColor: "#FBBF24",
    backgroundColor: "#221D15",
  },
  kpiHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  kpiLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: "#9CA3AF",
    letterSpacing: 0.8,
  },
  kpiValue: {
    fontSize: 18,
    fontWeight: "800",
    color: "#FFFFFF",
    marginBottom: 4,
  },
  kpiSub: {
    fontSize: 10,
    color: "#6B7280",
  },
  actionRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 20,
  },
  actionBtnPrimary: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
    borderRadius: 16,
    paddingVertical: 13,
    gap: 8,
  },
  actionBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  actionBtnSecondary: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.darkSurface,
    borderRadius: 16,
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: colors.gold,
    gap: 8,
  },
  actionBtnSecondaryText: {
    color: colors.gold,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  sectionContainer: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: "#E5E7EB",
    letterSpacing: 1,
  },
  sectionSub: {
    fontSize: 10,
    color: "#9CA3AF",
  },
  sectionLink: {
    fontSize: 11,
    color: colors.gold,
    fontWeight: "700",
  },
  lowStockList: {
    gap: 8,
  },
  lowStockCard: {
    backgroundColor: colors.darkSurface,
    borderRadius: 12,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(217, 119, 6, 0.3)",
  },
  lowStockImageWrap: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: colors.darkCard,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  lowStockImage: {
    width: "100%",
    height: "100%",
  },
  lowStockInfo: {
    flex: 1,
    marginLeft: 12,
  },
  lowStockTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: 2,
  },
  lowStockSku: {
    fontSize: 10,
    color: "#9CA3AF",
  },
  stockBadge: {
    backgroundColor: "rgba(220, 38, 38, 0.2)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  stockBadgeText: {
    color: "#EF4444",
    fontSize: 10,
    fontWeight: "800",
  },
  emptyOrders: {
    backgroundColor: colors.darkSurface,
    borderRadius: 12,
    padding: 20,
    alignItems: "center",
  },
  emptyText: {
    color: "#9CA3AF",
    fontSize: 12,
  },
  ordersList: {
    gap: 8,
  },
  orderRow: {
    backgroundColor: colors.darkSurface,
    borderRadius: 12,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: colors.darkBorder,
  },
  orderLeft: {
    flex: 1,
  },
  orderNumber: {
    fontSize: 12,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  orderCustomer: {
    fontSize: 11,
    color: "#D1D5DB",
    marginBottom: 2,
  },
  orderDate: {
    fontSize: 10,
    color: "#6B7280",
  },
  orderRight: {
    alignItems: "flex-end",
  },
  orderTotal: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.gold,
    marginBottom: 4,
  },
  pendingBadgeHeader: {
    backgroundColor: "rgba(245, 158, 11, 0.2)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.4)",
  },
  pendingBadgeHeaderText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#FBBF24",
    letterSpacing: 0.5,
  },
  orderFilterRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.darkSurface,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.darkBorder,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterChipText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#9CA3AF",
  },
  filterChipTextActive: {
    color: "#FFFFFF",
  },
  pendingTag: {
    backgroundColor: "rgba(245, 158, 11, 0.2)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.4)",
  },
  pendingTagText: {
    fontSize: 8,
    fontWeight: "800",
    color: "#FBBF24",
    letterSpacing: 0.5,
  },
  orderMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  orderPhoneTag: {
    fontSize: 10,
    color: colors.gold,
    fontWeight: "600",
  },
  promptActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(212, 175, 55, 0.15)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 4,
    borderWidth: 1,
    borderColor: "rgba(212, 175, 55, 0.35)",
  },
  promptActionBtnText: {
    fontSize: 9,
    fontWeight: "800",
    color: colors.gold,
    letterSpacing: 0.5,
  },
  orderStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusPaid: {
    backgroundColor: "rgba(16, 185, 129, 0.2)",
  },
  statusPending: {
    backgroundColor: "rgba(245, 158, 11, 0.2)",
  },
  orderStatusText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  footerInfo: {
    backgroundColor: colors.darkSurface,
    borderRadius: 14,
    padding: 16,
    marginTop: 10,
    borderWidth: 1,
    borderColor: colors.darkBorder,
    alignItems: "center",
  },
  footerLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: colors.gold,
    letterSpacing: 1,
    marginBottom: 4,
  },
  footerUrl: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: 4,
  },
  footerSub: {
    fontSize: 10,
    color: "#9CA3AF",
    textAlign: "center",
  },
});
