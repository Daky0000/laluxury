import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Modal,
  ScrollView,
  Linking,
} from "react-native";
import { styles } from "./OrdersScreen.styles";
import { Image } from "expo-image";
import { FlashList } from "@shopify/flash-list";
import { Feather } from "@expo/vector-icons";
import { colors } from "../theme/colors";
import { api } from "../services/api";
import { Order, User } from "../types";
import { formatCurrency, formatDate } from "../utils/format";
import { OrderPromptModal, OrderPromptData } from "../components/OrderPromptModal";
import { ManualOrderModal } from "../components/ManualOrderModal";
import { PopNotificationData } from "../components/PopNotification";

type FilterTab =
  | "ALL"
  | "UNPAID"
  | "PAID"
  | "PROCESSING"
  | "SHIPPED"
  | "DELIVERED"
  | "CANCELLED";

type Props = {
  user: User;
  onNotify?: (data: PopNotificationData) => void;
};

export function OrdersScreen({ user, onNotify }: Props) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterTab>("ALL");

  // Modals
  const [selectedOrderForPrompt, setSelectedOrderForPrompt] = useState<OrderPromptData | null>(null);
  const [selectedOrderDetail, setSelectedOrderDetail] = useState<Order | null>(null);
  const [showManualOrderModal, setShowManualOrderModal] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);

  // Status edit form state
  const [editStatus, setEditStatus] = useState("PENDING");
  const [editFulfillment, setEditFulfillment] = useState("UNFULFILLED");
  const [editTrackingNumber, setEditTrackingNumber] = useState("");
  const [editTrackingCompany, setEditTrackingCompany] = useState("");
  const [editStaffNote, setEditStaffNote] = useState("");
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [receiptSending, setReceiptSending] = useState(false);

  const fetchOrders = useCallback(async () => {
    try {
      const filters: { status?: string; paymentStatus?: string; fulfillmentStatus?: string; q?: string } = {};
      if (searchQuery.trim()) {
        filters.q = searchQuery.trim();
      }

      if (activeFilter === "UNPAID") {
        filters.paymentStatus = "PENDING";
      } else if (activeFilter === "PAID") {
        filters.paymentStatus = "PAID";
      } else if (activeFilter === "PROCESSING") {
        filters.fulfillmentStatus = "PROCESSING";
      } else if (activeFilter === "SHIPPED") {
        filters.fulfillmentStatus = "SHIPPED";
      } else if (activeFilter === "DELIVERED") {
        filters.fulfillmentStatus = "DELIVERED";
      } else if (activeFilter === "CANCELLED") {
        filters.status = "CANCELLED";
      }

      const res = await api.getOrders(filters);
      setOrders(res.orders || []);
    } catch {
      // Fallback
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [searchQuery, activeFilter]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchOrders();
  };

  const handleOpenPrompt = (order: Order) => {
    const promptData: OrderPromptData = {
      id: order.id,
      orderNumber: order.orderNumber,
      total: order.total,
      currency: order.currency,
      status: order.status,
      paymentStatus: order.paymentStatus,
      fulfillmentStatus: order.fulfillmentStatus,
      depositAmount: order.depositAmount,
      placedAt: order.placedAt,
      customerName: order.shippingAddress
        ? `${order.shippingAddress.firstName} ${order.shippingAddress.lastName}`.trim()
        : order.email?.split("@")[0] || "Client",
      customerPhone: order.phone || order.shippingAddress?.phone,
      customerEmail: order.email,
      city: order.shippingAddress?.city,
      line1: order.shippingAddress?.line1,
      items: order.items.map((i) => ({
        id: i.id,
        productTitle: i.productTitle,
        variantTitle: i.variantTitle,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
      })),
    };
    setSelectedOrderForPrompt(promptData);
  };

  const handleSendReceipt = async (order: Order) => {
    setReceiptSending(true);
    try {
      const res = await api.resendOrderReceipt(order.orderNumber, order.phone || undefined, order.email || undefined);
      if (res.ok) {
        onNotify?.({
          type: "success",
          title: "Receipt Delivered",
          message: res.message || `Receipt dispatched to ${order.phone || order.email}.`,
        });
      } else {
        onNotify?.({
          type: "error",
          title: "Receipt Error",
          message: res.message || "Failed to deliver receipt.",
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error sending receipt.";
      onNotify?.({
        type: "error",
        title: "Receipt Error",
        message: msg,
      });
    } finally {
      setReceiptSending(false);
    }
  };

  const handleOpenStatusEdit = (order: Order) => {
    setEditStatus(order.status);
    setEditFulfillment(order.fulfillmentStatus || "UNFULFILLED");
    setEditTrackingNumber(order.trackingNumber || "");
    setEditTrackingCompany(order.trackingCompany || "");
    setEditStaffNote(order.staffNote || "");
    setShowStatusModal(true);
  };

  const handleSaveStatus = async () => {
    if (!selectedOrderDetail) return;
    setStatusUpdating(true);
    try {
      const res = await api.updateOrderStatus(selectedOrderDetail.id, {
        status: editStatus,
        fulfillmentStatus: editFulfillment,
        trackingNumber: editTrackingNumber.trim() || undefined,
        trackingCompany: editTrackingCompany.trim() || undefined,
        staffNote: editStaffNote.trim() || undefined,
      });

      if (res.ok) {
        onNotify?.({
          type: "success",
          title: "Order Updated",
          message: `Order #${selectedOrderDetail.orderNumber} successfully updated.`,
        });
        setSelectedOrderDetail(res.order);
        setShowStatusModal(false);
        fetchOrders();
      } else {
        onNotify?.({
          type: "error",
          title: "Update Failed",
          message: res.message || "Could not update order status.",
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update order.";
      onNotify?.({
        type: "error",
        title: "Update Error",
        message: msg,
      });
    } finally {
      setStatusUpdating(false);
    }
  };

  const filterTabs: FilterTab[] = [
    "ALL",
    "UNPAID",
    "PAID",
    "PROCESSING",
    "SHIPPED",
    "DELIVERED",
    "CANCELLED",
  ];

  const renderOrderItem = ({ item }: { item: Order }) => {
    const customerName = item.shippingAddress
      ? `${item.shippingAddress.firstName} ${item.shippingAddress.lastName}`.trim()
      : item.email?.split("@")[0] || "Valued Client";
    const customerPhone = item.phone || item.shippingAddress?.phone;
    const isPaid = item.paymentStatus === "PAID";
    const isUnpaid = !isPaid;

    return (
      <TouchableOpacity
        style={styles.orderCard}
        onPress={() => setSelectedOrderDetail(item)}
        activeOpacity={0.85}
      >
        {/* Card Header */}
        <View style={styles.cardHeader}>
          <View>
            <View style={styles.orderNumRow}>
              <Text style={styles.orderNumber}>#{item.orderNumber}</Text>
              {item.hasPreorderItems && (
                <View style={styles.preorderBadge}>
                  <Text style={styles.preorderBadgeText}>PRE-ORDER</Text>
                </View>
              )}
            </View>
            <Text style={styles.orderDate}>{formatDate(item.placedAt)}</Text>
          </View>

          <View style={styles.badgesCol}>
            <View
              style={[
                styles.statusBadge,
                isPaid ? styles.statusBadgePaid : styles.statusBadgePending,
              ]}
            >
              <Text
                style={[
                  styles.statusBadgeText,
                  isPaid ? styles.statusBadgeTextPaid : styles.statusBadgeTextPending,
                ]}
              >
                {item.paymentStatus || item.status}
              </Text>
            </View>

            {item.fulfillmentStatus && (
              <View
                style={[
                  styles.statusBadge,
                  item.fulfillmentStatus === "FULFILLED" || item.fulfillmentStatus === "DELIVERED"
                    ? styles.statusBadgeDelivered
                    : styles.statusBadgeProcessing,
                ]}
              >
                <Text style={styles.statusBadgeTextFulfill}>
                  {item.fulfillmentStatus}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Customer & Items Summary */}
        <View style={styles.cardBody}>
          <View style={styles.customerRow}>
            <Feather name="user" size={13} color={colors.gold} />
            <Text style={styles.customerNameText} numberOfLines={1}>
              {customerName}
            </Text>
            {customerPhone && (
              <Text style={styles.customerPhoneText}>· {customerPhone}</Text>
            )}
          </View>

          {/* Product Items Thumbnails */}
          {item.items && item.items.length > 0 && (
            <View style={styles.itemsPreviewRow}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.thumbsScroll}>
                {item.items.map((prod, idx) => (
                  <View key={prod.id || idx} style={styles.thumbWrapper}>
                    {prod.imageUrl ? (
                      <Image source={{ uri: prod.imageUrl }} style={styles.thumbImg} />
                    ) : (
                      <View style={[styles.thumbImg, styles.thumbPlaceholder]}>
                        <Feather name="box" size={12} color="#888" />
                      </View>
                    )}
                  </View>
                ))}
              </ScrollView>
              <Text style={styles.itemCountText}>
                {item.items.length} {item.items.length === 1 ? "item" : "items"}
              </Text>
            </View>
          )}

          {/* Destination */}
          {item.shippingAddress?.city && (
            <View style={styles.destRow}>
              <Feather name="map-pin" size={12} color={colors.darkTextMuted} />
              <Text style={styles.destText} numberOfLines={1}>
                {[item.shippingAddress.line1, item.shippingAddress.city, item.shippingAddress.region]
                  .filter(Boolean)
                  .join(", ")}
              </Text>
            </View>
          )}
        </View>

        {/* Card Footer: Amount and Action Buttons */}
        <View style={styles.cardFooter}>
          <View>
            <Text style={styles.amountLabel}>Total Amount</Text>
            <Text style={styles.amountValue}>
              {formatCurrency(item.total, item.currency)}
            </Text>
            {item.depositAmount && item.depositAmount < item.total && (
              <Text style={styles.depositNote}>
                Deposit: {formatCurrency(item.depositAmount)}
              </Text>
            )}
          </View>

          <View style={styles.actionButtonsRow}>
            {isUnpaid ? (
              <TouchableOpacity
                style={styles.momoPromptBtn}
                onPress={() => handleOpenPrompt(item)}
                activeOpacity={0.8}
              >
                <Feather name="smartphone" size={13} color="#FFFFFF" />
                <Text style={styles.momoPromptBtnText}>Push MoMo PIN</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.receiptBtn}
                onPress={() => handleSendReceipt(item)}
                disabled={receiptSending}
                activeOpacity={0.8}
              >
                <Feather name="send" size={13} color={colors.gold} />
                <Text style={styles.receiptBtnText}>Receipt</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.detailsBtn}
              onPress={() => setSelectedOrderDetail(item)}
              activeOpacity={0.8}
            >
              <Text style={styles.detailsBtnText}>Details</Text>
              <Feather name="chevron-right" size={14} color="#C4B89D" />
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Top Header */}
      <View style={styles.topHeader}>
        <View>
          <View style={styles.badgeRow}>
            <View style={styles.liveIndicator} />
            <Text style={styles.portalBadge}>BACKEND PORTAL</Text>
          </View>
          <Text style={styles.pageTitle}>Orders ({orders.length})</Text>
        </View>

        <View style={styles.topHeaderBtns}>
          <TouchableOpacity style={styles.iconBtn} onPress={onRefresh} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Refresh">
            <Feather name="refresh-cw" size={16} color={colors.gold} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.addOrderBtn}
            onPress={() => setShowManualOrderModal(true)}
            activeOpacity={0.8}
          >
            <Feather name="plus" size={15} color="#FFFFFF" style={{ marginRight: 4 }} />
            <Text style={styles.addOrderBtnText}>Add Order</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Search Bar */}
      <View style={styles.searchBox}>
        <Feather name="search" size={16} color="#8E9889" style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by Order #, client name, phone..."
          placeholderTextColor="#717E6B"
          value={searchQuery}
          onChangeText={setSearchQuery}
          returnKeyType="search"
          onSubmitEditing={fetchOrders}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery("")} style={{ padding: 4 }}>
            <Feather name="x" size={14} color="#8E9889" />
          </TouchableOpacity>
        )}
      </View>

      {/* Filter Tabs Horizontal Scroll */}
      <View style={styles.filterScrollContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          {filterTabs.map((tab) => {
            const isActive = activeFilter === tab;
            return (
              <TouchableOpacity
                key={tab}
                style={[styles.filterChip, isActive && styles.filterChipActive]}
                onPress={() => setActiveFilter(tab)}
                activeOpacity={0.8}
              >
                <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                  {tab}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Orders List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.gold} />
          <Text style={styles.loadingText}>Loading orders...</Text>
        </View>
      ) : orders.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Feather name="inbox" size={44} color="#4A5644" />
          <Text style={styles.emptyTitle}>No orders found</Text>
          <Text style={styles.emptySub}>
            {searchQuery
              ? `No orders matching "${searchQuery}".`
              : `There are currently no orders under the ${activeFilter} filter.`}
          </Text>
          <TouchableOpacity
            style={[styles.addOrderBtn, { marginTop: 14 }]}
            onPress={() => setShowManualOrderModal(true)}
          >
            <Text style={styles.addOrderBtnText}>Create Manual Order</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlashList
          data={orders}
          keyExtractor={(item) => item.id}
          renderItem={renderOrderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.gold}
            />
          }
        />
      )}

      {/* FULL ORDER DETAILS MODAL */}
      {selectedOrderDetail && (
        <Modal
          visible={Boolean(selectedOrderDetail)}
          transparent
          animationType="slide"
          onRequestClose={() => setSelectedOrderDetail(null)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              {/* Modal Header */}
              <View style={styles.modalHeader}>
                <View>
                  <View style={styles.orderNumRow}>
                    <Text style={styles.modalOrderNumber}>
                      #{selectedOrderDetail.orderNumber}
                    </Text>
                    <View
                      style={[
                        styles.statusBadge,
                        selectedOrderDetail.paymentStatus === "PAID"
                          ? styles.statusBadgePaid
                          : styles.statusBadgePending,
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusBadgeText,
                          selectedOrderDetail.paymentStatus === "PAID"
                            ? styles.statusBadgeTextPaid
                            : styles.statusBadgeTextPending,
                        ]}
                      >
                        {selectedOrderDetail.paymentStatus || selectedOrderDetail.status}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.modalDate}>
                    Placed on {formatDate(selectedOrderDetail.placedAt)}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setSelectedOrderDetail(null)}
                  style={styles.closeBtn}
                >
                  <Feather name="x" size={20} color={colors.text} />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
                {/* 1. Ordered Products Section */}
                <Text style={styles.detailSectionTitle}>ORDERED PRODUCTS ({selectedOrderDetail.items.length})</Text>
                <View style={styles.detailCard}>
                  {selectedOrderDetail.items.map((prod) => (
                    <View key={prod.id} style={styles.detailProductRow}>
                      {prod.imageUrl ? (
                        <Image source={{ uri: prod.imageUrl }} style={styles.detailProdImg} />
                      ) : (
                        <View style={[styles.detailProdImg, styles.thumbPlaceholder]}>
                          <Feather name="box" size={16} color="#888" />
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={styles.detailProdTitle}>{prod.productTitle}</Text>
                        <Text style={styles.detailProdVariant}>
                          {prod.variantTitle && prod.variantTitle !== "Default"
                            ? prod.variantTitle
                            : "Standard Piece"}
                          {prod.sku ? ` · SKU: ${prod.sku}` : ""}
                        </Text>
                        <Text style={styles.detailProdPrice}>
                          {prod.quantity} × {formatCurrency(prod.unitPrice, selectedOrderDetail.currency)}
                        </Text>
                      </View>
                      <Text style={styles.detailProdLineTotal}>
                        {formatCurrency(prod.total, selectedOrderDetail.currency)}
                      </Text>
                    </View>
                  ))}
                </View>

                {/* 2. Customer & Contact Details */}
                <Text style={styles.detailSectionTitle}>CUSTOMER & CONTACT</Text>
                <View style={styles.detailCard}>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Client Name:</Text>
                    <Text style={styles.infoValue}>
                      {selectedOrderDetail.shippingAddress
                        ? `${selectedOrderDetail.shippingAddress.firstName} ${selectedOrderDetail.shippingAddress.lastName}`.trim()
                        : selectedOrderDetail.email?.split("@")[0] || "Valued Client"}
                    </Text>
                  </View>

                  {selectedOrderDetail.phone && (
                    <View style={[styles.infoRow, { alignItems: "center" }]}>
                      <Text style={styles.infoLabel}>Phone Number:</Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <Text style={styles.infoValue}>{selectedOrderDetail.phone}</Text>
                        <TouchableOpacity
                          style={styles.quickDialBtn}
                          onPress={() => Linking.openURL(`tel:${selectedOrderDetail.phone}`)}
                        >
                          <Feather name="phone-call" size={11} color="#FFFFFF" />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.quickDialBtn, { backgroundColor: "#25D366" }]}
                          onPress={() => {
                            const digits = (selectedOrderDetail.phone || "").replace(/[^0-9]/g, "");
                            const wa = digits.startsWith("0") ? `233${digits.slice(1)}` : digits;
                            Linking.openURL(`https://wa.me/${wa}`);
                          }}
                        >
                          <Feather name="message-circle" size={11} color="#FFFFFF" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}

                  {selectedOrderDetail.email && (
                    <View style={styles.infoRow}>
                      <Text style={styles.infoLabel}>Email:</Text>
                      <Text style={styles.infoValue}>{selectedOrderDetail.email}</Text>
                    </View>
                  )}

                  {selectedOrderDetail.customerNote && (
                    <View style={styles.noteBox}>
                      <Text style={styles.noteTitle}>Customer Note:</Text>
                      <Text style={styles.noteText}>{selectedOrderDetail.customerNote}</Text>
                    </View>
                  )}

                  {selectedOrderDetail.staffNote && (
                    <View style={[styles.noteBox, { backgroundColor: "#F3F1EC" }]}>
                      <Text style={styles.noteTitle}>Staff Note:</Text>
                      <Text style={styles.noteText}>{selectedOrderDetail.staffNote}</Text>
                    </View>
                  )}
                </View>

                {/* 3. Delivery & Fulfillment */}
                <Text style={styles.detailSectionTitle}>SHIPPING & FULFILLMENT</Text>
                <View style={styles.detailCard}>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Fulfillment Status:</Text>
                    <View
                      style={[
                        styles.statusBadge,
                        selectedOrderDetail.fulfillmentStatus === "FULFILLED" ||
                        selectedOrderDetail.fulfillmentStatus === "DELIVERED"
                          ? styles.statusBadgeDelivered
                          : styles.statusBadgeProcessing,
                      ]}
                    >
                      <Text style={styles.statusBadgeTextFulfill}>
                        {selectedOrderDetail.fulfillmentStatus || "UNFULFILLED"}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Destination:</Text>
                    <Text style={styles.infoValue}>
                      {selectedOrderDetail.shippingAddress?.line1
                        ? `${selectedOrderDetail.shippingAddress.line1}, ${selectedOrderDetail.shippingAddress.city}, ${selectedOrderDetail.shippingAddress.region}`
                        : "Showroom Self-Pickup (Accra)"}
                    </Text>
                  </View>

                  {selectedOrderDetail.trackingNumber && (
                    <View style={styles.infoRow}>
                      <Text style={styles.infoLabel}>Tracking #:</Text>
                      <Text style={styles.infoValue}>
                        {selectedOrderDetail.trackingCompany
                          ? `${selectedOrderDetail.trackingCompany}: `
                          : ""}
                        {selectedOrderDetail.trackingNumber}
                      </Text>
                    </View>
                  )}
                </View>

                {/* 4. Financial & Payment Summary */}
                <Text style={styles.detailSectionTitle}>PAYMENT BREAKDOWN</Text>
                <View style={styles.detailCard}>
                  <View style={styles.breakdownRow}>
                    <Text style={styles.breakdownLabel}>Subtotal:</Text>
                    <Text style={styles.breakdownValue}>
                      {formatCurrency(selectedOrderDetail.subtotal, selectedOrderDetail.currency)}
                    </Text>
                  </View>

                  <View style={styles.breakdownRow}>
                    <Text style={styles.breakdownLabel}>Delivery Fee:</Text>
                    <Text style={styles.breakdownValue}>
                      {formatCurrency(selectedOrderDetail.shippingTotal, selectedOrderDetail.currency)}
                    </Text>
                  </View>

                  {selectedOrderDetail.discountTotal && selectedOrderDetail.discountTotal > 0 ? (
                    <View style={styles.breakdownRow}>
                      <Text style={styles.breakdownLabel}>Discount:</Text>
                      <Text style={[styles.breakdownValue, { color: "#10B981" }]}>
                        -{formatCurrency(selectedOrderDetail.discountTotal, selectedOrderDetail.currency)}
                      </Text>
                    </View>
                  ) : null}

                  <View style={[styles.breakdownRow, styles.grandBreakdownRow]}>
                    <Text style={styles.grandBreakdownLabel}>TOTAL:</Text>
                    <Text style={styles.grandBreakdownValue}>
                      {formatCurrency(selectedOrderDetail.total, selectedOrderDetail.currency)}
                    </Text>
                  </View>

                  {selectedOrderDetail.depositAmount ? (
                    <View style={styles.depositAlert}>
                      <Feather name="info" size={14} color={colors.gold} />
                      <Text style={styles.depositAlertText}>
                        Pre-Order Deposit: {formatCurrency(selectedOrderDetail.depositAmount)} · Balance Due:{" "}
                        {formatCurrency(Math.max(0, selectedOrderDetail.total - selectedOrderDetail.depositAmount))}
                      </Text>
                    </View>
                  ) : null}
                </View>

                {/* Action Buttons inside Details Modal */}
                <View style={styles.modalActionButtons}>
                  {selectedOrderDetail.paymentStatus !== "PAID" ? (
                    <TouchableOpacity
                      style={styles.primaryActionButton}
                      onPress={() => {
                        const ord = selectedOrderDetail;
                        setSelectedOrderDetail(null);
                        handleOpenPrompt(ord);
                      }}
                      activeOpacity={0.85}
                    >
                      <Feather name="smartphone" size={16} color="#FFFFFF" style={{ marginRight: 8 }} />
                      <Text style={styles.primaryActionText}>PUSH MOMO PIN PROMPT</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={[styles.primaryActionButton, { backgroundColor: "#10B981" }]}
                      onPress={() => handleSendReceipt(selectedOrderDetail)}
                      disabled={receiptSending}
                      activeOpacity={0.85}
                    >
                      {receiptSending ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <>
                          <Feather name="send" size={16} color="#FFFFFF" style={{ marginRight: 8 }} />
                          <Text style={styles.primaryActionText}>SEND RECEIPT (SMS & EMAIL)</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={styles.secondaryActionButton}
                    onPress={() => handleOpenStatusEdit(selectedOrderDetail)}
                    activeOpacity={0.8}
                  >
                    <Feather name="edit-2" size={15} color={colors.text} style={{ marginRight: 6 }} />
                    <Text style={styles.secondaryActionText}>Update Order & Fulfillment Status</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}

      {/* UPDATE STATUS MODAL */}
      {showStatusModal && selectedOrderDetail && (
        <Modal
          visible={showStatusModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowStatusModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalCard, { maxHeight: "85%" }]}>
              <View style={styles.modalHeader}>
                <Text style={styles.title}>Update Order #{selectedOrderDetail.orderNumber}</Text>
                <TouchableOpacity onPress={() => setShowStatusModal(false)}>
                  <Feather name="x" size={20} color={colors.text} />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                {/* Order Status */}
                <Text style={styles.inputLabel}>ORDER STATUS</Text>
                <View style={styles.optionsRow}>
                  {["PENDING", "PAID", "COMPLETED", "CANCELLED"].map((s) => (
                    <TouchableOpacity
                      key={s}
                      style={[styles.optionPill, editStatus === s && styles.optionPillActive]}
                      onPress={() => setEditStatus(s)}
                    >
                      <Text style={[styles.optionPillText, editStatus === s && styles.optionPillTextActive]}>
                        {s}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Fulfillment Status */}
                <Text style={[styles.inputLabel, { marginTop: 12 }]}>FULFILLMENT STATUS</Text>
                <View style={styles.optionsRow}>
                  {["UNFULFILLED", "PROCESSING", "SHIPPED", "DELIVERED"].map((f) => (
                    <TouchableOpacity
                      key={f}
                      style={[styles.optionPill, editFulfillment === f && styles.optionPillActive]}
                      onPress={() => setEditFulfillment(f)}
                    >
                      <Text style={[styles.optionPillText, editFulfillment === f && styles.optionPillTextActive]}>
                        {f}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={[styles.inputLabel, { marginTop: 12 }]}>TRACKING NUMBER (OPTIONAL)</Text>
                <TextInput
                  style={styles.modalInput}
                  value={editTrackingNumber}
                  onChangeText={setEditTrackingNumber}
                  placeholder="e.g. GH-POST-992381"
                  placeholderTextColor="#999"
                />

                <Text style={styles.inputLabel}>COURIER / COMPANY (OPTIONAL)</Text>
                <TextInput
                  style={styles.modalInput}
                  value={editTrackingCompany}
                  onChangeText={setEditTrackingCompany}
                  placeholder="e.g. DHL, In-house Rider"
                  placeholderTextColor="#999"
                />

                <Text style={styles.inputLabel}>STAFF NOTE</Text>
                <TextInput
                  style={[styles.modalInput, { height: 70 }]}
                  value={editStaffNote}
                  onChangeText={setEditStaffNote}
                  placeholder="Internal note for staff..."
                  placeholderTextColor="#999"
                  multiline
                />

                <TouchableOpacity
                  style={[styles.primaryActionButton, { marginTop: 16 }]}
                  onPress={handleSaveStatus}
                  disabled={statusUpdating}
                  activeOpacity={0.85}
                >
                  {statusUpdating ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.primaryActionText}>SAVE CHANGES</Text>
                  )}
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}

      {/* MoMo PIN Prompt / Message Modal */}
      <OrderPromptModal
        visible={Boolean(selectedOrderForPrompt)}
        order={selectedOrderForPrompt}
        onClose={() => setSelectedOrderForPrompt(null)}
        onSuccess={(msg) => {
          onNotify?.({
            type: "success",
            title: "Order Updated",
            message: msg,
          });
          fetchOrders();
        }}
        onError={(err) => {
          const msg = typeof err === "string" ? err : ((err as any)?.message || "Failed to trigger MoMo prompt.");
          onNotify?.({
            type: "error",
            title: "Prompt Notice",
            message: msg,
          });
        }}
      />

      {/* Manual Order Modal */}
      <ManualOrderModal
        visible={showManualOrderModal}
        onClose={() => setShowManualOrderModal(false)}
        onSuccess={(msg) => {
          onNotify?.({
            type: "success",
            title: "Order Placed",
            message: msg,
          });
          fetchOrders();
        }}
        onError={(err) => {
          onNotify?.({
            type: "error",
            title: "Error Creating Order",
            message: err,
          });
        }}
      />
    </View>
  );
}
