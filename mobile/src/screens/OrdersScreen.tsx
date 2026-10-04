import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Image,
  Modal,
  ScrollView,
  Linking,
  Platform,
  Alert,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { colors } from "../theme/colors";
import { api } from "../services/api";
import { Order, OrderItemDetail, User } from "../types";
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
          <TouchableOpacity style={styles.iconBtn} onPress={onRefresh} activeOpacity={0.7}>
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
        <FlatList
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
          onNotify?.({
            type: "error",
            title: "Prompt Error",
            message: err,
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.darkBg,
  },
  topHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "ios" ? 14 : 10,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.darkBorder,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 2,
  },
  liveIndicator: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.gold,
  },
  portalBadge: {
    fontSize: 9,
    fontWeight: "800",
    color: colors.gold,
    letterSpacing: 1.2,
  },
  pageTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.darkText,
    fontFamily: "serif",
  },
  topHeaderBtns: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  iconBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: colors.darkSurface,
    borderWidth: 1,
    borderColor: colors.darkBorder,
  },
  addOrderBtn: {
    backgroundColor: colors.primary,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addOrderBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.darkSurface,
    borderWidth: 1,
    borderColor: colors.darkBorder,
    borderRadius: 10,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 10 : 6,
  },
  searchInput: {
    flex: 1,
    color: colors.darkText,
    fontSize: 13,
  },
  filterScrollContainer: {
    marginBottom: 8,
  },
  filterScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.darkSurface,
    borderWidth: 1,
    borderColor: colors.darkBorder,
  },
  filterChipActive: {
    backgroundColor: colors.gold,
    borderColor: colors.gold,
  },
  filterChipText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.darkTextMuted,
  },
  filterChipTextActive: {
    color: "#182216",
    fontWeight: "800",
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 90,
    gap: 12,
  },
  orderCard: {
    backgroundColor: colors.darkSurface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.darkBorder,
    padding: 14,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.06)",
    paddingBottom: 8,
  },
  orderNumRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  orderNumber: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.gold,
  },
  preorderBadge: {
    backgroundColor: "rgba(245, 158, 11, 0.2)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  preorderBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#F59E0B",
  },
  orderDate: {
    fontSize: 11,
    color: colors.darkTextMuted,
    marginTop: 2,
  },
  badgesCol: {
    alignItems: "flex-end",
    gap: 4,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusBadgePaid: {
    backgroundColor: "rgba(16, 185, 129, 0.18)",
  },
  statusBadgePending: {
    backgroundColor: "rgba(245, 158, 11, 0.18)",
  },
  statusBadgeDelivered: {
    backgroundColor: "rgba(59, 130, 246, 0.18)",
  },
  statusBadgeProcessing: {
    backgroundColor: "rgba(168, 85, 247, 0.18)",
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: "800",
  },
  statusBadgeTextPaid: {
    color: "#4ADE80",
  },
  statusBadgeTextPending: {
    color: "#FBBF24",
  },
  statusBadgeTextFulfill: {
    fontSize: 9,
    fontWeight: "700",
    color: "#93C5FD",
  },
  cardBody: {
    marginBottom: 12,
  },
  customerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  customerNameText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.darkText,
  },
  customerPhoneText: {
    fontSize: 12,
    color: colors.darkTextMuted,
  },
  itemsPreviewRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginVertical: 4,
  },
  thumbsScroll: {
    flexDirection: "row",
  },
  thumbWrapper: {
    marginRight: 6,
  },
  thumbImg: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: "#2B3527",
  },
  thumbPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  itemCountText: {
    fontSize: 11,
    color: colors.darkTextMuted,
    fontWeight: "600",
  },
  destRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 4,
  },
  destText: {
    fontSize: 11,
    color: colors.darkTextMuted,
    flex: 1,
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.06)",
    paddingTop: 8,
  },
  amountLabel: {
    fontSize: 10,
    color: colors.darkTextMuted,
  },
  amountValue: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.darkText,
  },
  depositNote: {
    fontSize: 10,
    color: colors.gold,
    fontWeight: "600",
  },
  actionButtonsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  momoPromptBtn: {
    backgroundColor: colors.primary,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
  },
  momoPromptBtnText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "800",
  },
  receiptBtn: {
    backgroundColor: "rgba(202, 160, 86, 0.15)",
    borderWidth: 1,
    borderColor: colors.gold,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
  },
  receiptBtnText: {
    color: colors.gold,
    fontSize: 11,
    fontWeight: "800",
  },
  detailsBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
  detailsBtnText: {
    fontSize: 11,
    color: "#C4B89D",
    fontWeight: "700",
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 60,
  },
  loadingText: {
    color: colors.darkTextMuted,
    fontSize: 13,
    marginTop: 10,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 80,
    paddingHorizontal: 30,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: colors.darkText,
    marginTop: 12,
  },
  emptySub: {
    fontSize: 12,
    color: colors.darkTextMuted,
    textAlign: "center",
    marginTop: 4,
    lineHeight: 18,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 20,
    paddingTop: 18,
    maxHeight: "92%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#EFECE6",
  },
  modalOrderNumber: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.primary,
  },
  modalDate: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
    backgroundColor: "#F3F1EC",
    borderRadius: 20,
  },
  title: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.text,
  },
  detailSectionTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.primary,
    letterSpacing: 1,
    marginTop: 12,
    marginBottom: 6,
  },
  detailCard: {
    backgroundColor: "#F8F7F4",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#EAE6DE",
    padding: 12,
    marginBottom: 6,
  },
  detailProductRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#EFECE6",
  },
  detailProdImg: {
    width: 44,
    height: 44,
    borderRadius: 6,
    backgroundColor: "#EAE6DE",
  },
  detailProdTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
  },
  detailProdVariant: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  detailProdPrice: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  detailProdLineTotal: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.primary,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 5,
  },
  infoLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: "600",
  },
  infoValue: {
    fontSize: 12,
    color: colors.text,
    fontWeight: "700",
    flexShrink: 1,
    textAlign: "right",
  },
  quickDialBtn: {
    backgroundColor: colors.primary,
    padding: 4,
    borderRadius: 4,
  },
  noteBox: {
    backgroundColor: "#FFFBEB",
    padding: 8,
    borderRadius: 6,
    marginTop: 6,
  },
  noteTitle: {
    fontSize: 10,
    fontWeight: "800",
    color: "#B45309",
    marginBottom: 2,
  },
  noteText: {
    fontSize: 11,
    color: "#92400E",
  },
  breakdownRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  breakdownLabel: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  breakdownValue: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.text,
  },
  grandBreakdownRow: {
    borderTopWidth: 1,
    borderTopColor: "#E5E1D8",
    paddingTop: 8,
    marginTop: 4,
  },
  grandBreakdownLabel: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.primary,
  },
  grandBreakdownValue: {
    fontSize: 16,
    fontWeight: "900",
    color: colors.primary,
  },
  depositAlert: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FAF7EE",
    padding: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.gold,
    marginTop: 8,
  },
  depositAlertText: {
    fontSize: 11,
    color: colors.text,
    fontWeight: "600",
    flex: 1,
  },
  modalActionButtons: {
    marginTop: 14,
    gap: 8,
  },
  primaryActionButton: {
    backgroundColor: colors.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 10,
  },
  primaryActionText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  secondaryActionButton: {
    backgroundColor: "#F3F1EC",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E5E1D8",
  },
  secondaryActionText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "700",
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.textSecondary,
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  optionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 8,
  },
  optionPill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: "#F3F1EC",
    borderWidth: 1,
    borderColor: "#E5E1D8",
  },
  optionPillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  optionPillText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.text,
  },
  optionPillTextActive: {
    color: "#FFFFFF",
  },
  modalInput: {
    backgroundColor: "#F8F7F4",
    borderWidth: 1,
    borderColor: "#E5E1D8",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    color: colors.text,
    marginBottom: 10,
  },
});
