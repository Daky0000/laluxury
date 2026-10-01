import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  Modal,
  Alert,
  Linking,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { colors } from "../theme/colors";
import { api } from "../services/api";
import { CartItem, User, ShippingAddress } from "../types";
import { formatCurrency } from "../utils/format";

type Props = {
  cart: CartItem[];
  user: User | null;
  onBack: () => void;
  onUpdateQuantity: (variantId: string, delta: number) => void;
  onRemoveItem: (variantId: string) => void;
  onClearCart: () => void;
  onOrderSuccess: (orderNumber: string) => void;
  onBrowseProducts: () => void;
};

const PAYMENT_METHODS = [
  {
    id: "paystack",
    label: "Paystack (Card & Mobile Money)",
    subtitle: "Instant settlement via MTN, Telecel, AT & Visa/Mastercard",
    icon: "credit-card" as const,
  },
  {
    id: "direct_momo",
    label: "Direct MoMo / Bank Transfer",
    subtitle: "Manual transfer to official store account with verification",
    icon: "smartphone" as const,
  },
  {
    id: "pay_on_delivery",
    label: "Pay on Delivery / Concierge",
    subtitle: "Inspect furniture upon delivery and pay concierge",
    icon: "truck" as const,
  },
];

export function StorefrontCartScreen({
  cart,
  user,
  onBack,
  onUpdateQuantity,
  onRemoveItem,
  onClearCart,
  onOrderSuccess,
  onBrowseProducts,
}: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [showAddressModal, setShowAddressModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState(PAYMENT_METHODS[0].id);

  // Default Ghanaian delivery address
  const [shippingAddress, setShippingAddress] = useState<ShippingAddress>({
    firstName: user?.firstName || "Akua",
    lastName: user?.lastName || "Mensah",
    phone: user?.phone || "+233 24 123 4567",
    line1: "15 Senchi Street, Airport Residential",
    line2: "",
    city: "Accra",
    region: "Greater Accra",
    country: "Ghana",
  });

  // Calculate Subtotal & Totals in pesewas (minor units)
  const subtotal = cart.reduce((acc, item) => {
    return acc + item.variant.price * item.quantity;
  }, 0);

  const shippingFee = cart.length > 0 ? 2500 : 0; // GH₵ 25.00 (in minor units)
  const total = subtotal + shippingFee;

  const handlePlaceOrder = async () => {
    if (cart.length === 0) {
      Alert.alert("Your Bag is Empty", "Add some handcrafted pieces before checking out.");
      return;
    }

    if (!shippingAddress.line1 || !shippingAddress.city) {
      Alert.alert("Shipping Address Required", "Please enter your street address.");
      setShowAddressModal(true);
      return;
    }

    setSubmitting(true);
    try {
      const orderPayload = {
        items: cart.map((item) => ({
          variantId: item.variant.id,
          quantity: item.quantity,
        })),
        customer: {
          firstName: shippingAddress.firstName,
          lastName: shippingAddress.lastName,
          email: user?.email || "customer@laluxurys.com",
          phone: shippingAddress.phone,
        },
        shippingAddress: {
          firstName: shippingAddress.firstName,
          lastName: shippingAddress.lastName,
          phone: shippingAddress.phone,
          line1: shippingAddress.line1,
          line2: shippingAddress.line2 || null,
          city: shippingAddress.city,
          region: shippingAddress.region,
          country: shippingAddress.country,
        },
        paymentMethod: selectedPayment,
      };

      const res = await api.checkout(orderPayload);
      if (res.ok) {
        onClearCart();

        // If Paystack returned a live authorization URL, open it in browser!
        if (res.paymentUrl) {
          Linking.openURL(res.paymentUrl).catch(() => {
            Alert.alert(
              "Payment Initialized",
              `Order #${res.order.orderNumber} created. Paystack gateway link: ${res.paymentUrl}`,
            );
          });
        }

        onOrderSuccess(res.order.orderNumber);
      } else {
        throw new Error("Unable to complete order.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to place order.";
      Alert.alert("Order Error", msg);
    } finally {
      setSubmitting(false);
    }
  };

  const currentPayment =
    PAYMENT_METHODS.find((p) => p.id === selectedPayment) || PAYMENT_METHODS[0];

  if (cart.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.iconBtn} onPress={onBack}>
            <Feather name="arrow-left" size={22} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.brandContainer}>
            <Text style={styles.brandTitle}>LALUXURY</Text>
            <Text style={styles.brandSubtitle}>ATELIER & LIVING</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconCircle}>
            <Feather name="shopping-bag" size={44} color={colors.primary} />
          </View>
          <Text style={styles.emptyTitle}>Your Bag is Empty</Text>
          <Text style={styles.emptySub}>
            Explore our curated catalog of handcrafted furniture and atelier decor.
          </Text>
          <TouchableOpacity style={styles.browseBtn} onPress={onBrowseProducts}>
            <Text style={styles.browseBtnText}>EXPLORE CATALOG</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Top Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={onBack} activeOpacity={0.7}>
          <Feather name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>

        <View style={styles.brandContainer}>
          <Text style={styles.brandTitle}>LALUXURY</Text>
          <Text style={styles.brandSubtitle}>ATELIER & LIVING</Text>
        </View>

        <View style={styles.cartIconWrapper}>
          <Feather name="shopping-bag" size={22} color={colors.text} />
          <View style={styles.cartBadge}>
            <Text style={styles.cartBadgeText}>{cart.length}</Text>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Title */}
        <Text style={styles.checkoutTitle}>CHECKOUT & PAYMENT</Text>

        {/* Bag Items List */}
        <View style={styles.itemsList}>
          {cart.map((item) => (
            <View key={item.variant.id} style={styles.cartItemRow}>
              {/* Product Thumbnail */}
              <View style={styles.thumbnailContainer}>
                {item.product.images?.[0]?.url ? (
                  <Image
                    source={{ uri: item.product.images[0].url }}
                    style={styles.thumbnailImage}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={styles.thumbnailFallback}>
                    <Feather name="box" size={20} color={colors.textMuted} />
                  </View>
                )}
              </View>

              {/* Product Info */}
              <View style={styles.itemInfo}>
                <Text style={styles.itemTitle} numberOfLines={1}>
                  {item.product.title.toUpperCase()}
                </Text>
                <Text style={styles.itemSubtitle}>
                  {item.variant.title !== "Default" ? item.variant.title : (item.product.material || "Standard")}
                </Text>
                <Text style={styles.itemPrice}>
                  {formatCurrency(item.variant.price * item.quantity)}
                </Text>
              </View>

              {/* Quantity Selector `[ - 1 + ]` & Trash */}
              <View style={styles.controlsGroup}>
                <View style={styles.quantityPill}>
                  <TouchableOpacity
                    style={styles.qtyBtn}
                    onPress={() => onUpdateQuantity(item.variant.id, -1)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.qtyBtnText}>−</Text>
                  </TouchableOpacity>
                  <Text style={styles.qtyValueText}>{item.quantity}</Text>
                  <TouchableOpacity
                    style={styles.qtyBtn}
                    onPress={() => onUpdateQuantity(item.variant.id, 1)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.qtyBtnText}>+</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={() => onRemoveItem(item.variant.id)}
                  activeOpacity={0.7}
                >
                  <Feather name="trash-2" size={16} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>

        {/* Cost Summary Breakdown */}
        <View style={styles.summaryBox}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>SUBTOTAL</Text>
            <Text style={styles.summaryValue}>{formatCurrency(subtotal)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>DELIVERY (STANDARD)</Text>
            <Text style={styles.summaryValue}>{formatCurrency(shippingFee)}</Text>
          </View>
          <View style={[styles.summaryRow, styles.summaryTotalRow]}>
            <Text style={styles.totalLabel}>TOTAL</Text>
            <Text style={styles.totalValue}>{formatCurrency(total)}</Text>
          </View>
        </View>

        {/* Shipping Address Card */}
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionHeaderLabel}>DELIVERY ADDRESS</Text>
          <TouchableOpacity
            style={styles.cardSelectable}
            onPress={() => setShowAddressModal(true)}
            activeOpacity={0.8}
          >
            <View style={styles.cardContentLeft}>
              <Text style={styles.addressName}>
                {shippingAddress.firstName} {shippingAddress.lastName} · {shippingAddress.phone}
              </Text>
              <Text style={styles.addressDetail}>
                {shippingAddress.line1}, {shippingAddress.city}, {shippingAddress.region}
              </Text>
            </View>
            <Feather name="chevron-right" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Payment Method Card */}
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionHeaderLabel}>PAYMENT METHOD</Text>
          <TouchableOpacity
            style={styles.cardSelectable}
            onPress={() => setShowPaymentModal(true)}
            activeOpacity={0.8}
          >
            <View style={styles.cardContentLeft}>
              <Text style={styles.paymentMethodText}>{currentPayment.label}</Text>
              <Text style={styles.paymentMethodSub}>{currentPayment.subtitle}</Text>
            </View>
            <Feather name="chevron-right" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Place Order CTA */}
        <TouchableOpacity
          style={[styles.placeOrderBtn, submitting && { opacity: 0.7 }]}
          onPress={handlePlaceOrder}
          disabled={submitting}
          activeOpacity={0.85}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.placeOrderText}>
              {selectedPayment === "paystack" ? "PROCEED TO PAYSTACK · " : "PLACE ORDER · "}
              {formatCurrency(total)}
            </Text>
          )}
        </TouchableOpacity>

        {/* Secure Checkout Sub-label */}
        <View style={styles.secureFooter}>
          <Feather name="shield" size={13} color={colors.primary} />
          <Text style={styles.secureText}>
            SECURE CHECKOUT · PAYSTACK & 256-BIT ENCRYPTION
          </Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Edit Address Modal */}
      <Modal visible={showAddressModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Delivery Address</Text>
              <TouchableOpacity onPress={() => setShowAddressModal(false)}>
                <Feather name="x" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 380 }}>
              <Text style={styles.inputLabel}>Full Name</Text>
              <TextInput
                style={styles.input}
                value={`${shippingAddress.firstName} ${shippingAddress.lastName}`}
                onChangeText={(val) => {
                  const parts = val.split(" ");
                  setShippingAddress((prev) => ({
                    ...prev,
                    firstName: parts[0] || "",
                    lastName: parts.slice(1).join(" ") || "",
                  }));
                }}
              />

              <Text style={styles.inputLabel}>Phone Number</Text>
              <TextInput
                style={styles.input}
                keyboardType="phone-pad"
                value={shippingAddress.phone}
                onChangeText={(val) =>
                  setShippingAddress((prev) => ({ ...prev, phone: val }))
                }
              />

              <Text style={styles.inputLabel}>Street Address</Text>
              <TextInput
                style={styles.input}
                value={shippingAddress.line1}
                onChangeText={(val) =>
                  setShippingAddress((prev) => ({ ...prev, line1: val }))
                }
              />

              <Text style={styles.inputLabel}>City & Region</Text>
              <TextInput
                style={styles.input}
                value={`${shippingAddress.city}, ${shippingAddress.region}`}
                onChangeText={(val) => {
                  const parts = val.split(",");
                  setShippingAddress((prev) => ({
                    ...prev,
                    city: parts[0]?.trim() || "Accra",
                    region: parts[1]?.trim() || "Greater Accra",
                  }));
                }}
              />
            </ScrollView>

            <TouchableOpacity
              style={styles.modalSaveBtn}
              onPress={() => setShowAddressModal(false)}
            >
              <Text style={styles.modalSaveText}>Save Delivery Address</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Payment Selection Modal */}
      <Modal visible={showPaymentModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Choose Payment Method</Text>
              <TouchableOpacity onPress={() => setShowPaymentModal(false)}>
                <Feather name="x" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>

            {PAYMENT_METHODS.map((pm) => (
              <TouchableOpacity
                key={pm.id}
                style={[
                  styles.paymentOption,
                  selectedPayment === pm.id && styles.paymentOptionActive,
                ]}
                onPress={() => {
                  setSelectedPayment(pm.id);
                  setShowPaymentModal(false);
                }}
              >
                <Feather name={pm.icon} size={20} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.paymentOptionLabel}>{pm.label}</Text>
                  <Text style={styles.paymentOptionSub}>{pm.subtitle}</Text>
                </View>
                {selectedPayment === pm.id && (
                  <Feather name="check" size={18} color={colors.primary} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>
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
  cartIconWrapper: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
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
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 14,
  },
  checkoutTitle: {
    fontFamily: "serif",
    fontSize: 16,
    fontWeight: "800",
    color: colors.text,
    letterSpacing: 1.5,
    marginBottom: 18,
  },
  itemsList: {
    gap: 14,
    marginBottom: 20,
  },
  cartItemRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  thumbnailContainer: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: "#E4E0D7",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  thumbnailImage: {
    width: "100%",
    height: "100%",
  },
  thumbnailFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  itemInfo: {
    flex: 1,
    marginLeft: 14,
  },
  itemTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.text,
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  itemSubtitle: {
    fontSize: 10,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  itemPrice: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.primary,
  },
  controlsGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  quantityPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceWarm,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  qtyBtn: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
  },
  qtyValueText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.text,
    paddingHorizontal: 8,
  },
  deleteBtn: {
    padding: 4,
  },
  summaryBox: {
    backgroundColor: colors.surfaceWarm,
    borderRadius: 16,
    padding: 16,
    marginVertical: 12,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  summaryLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.textSecondary,
    letterSpacing: 0.8,
  },
  summaryValue: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.text,
  },
  summaryTotalRow: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: 8,
    paddingTop: 8,
  },
  totalLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.text,
    letterSpacing: 1,
  },
  totalValue: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.primary,
  },
  sectionContainer: {
    marginTop: 14,
  },
  sectionHeaderLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: colors.textSecondary,
    letterSpacing: 1,
    marginBottom: 8,
  },
  cardSelectable: {
    backgroundColor: colors.surfaceWarm,
    borderRadius: 14,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  cardContentLeft: {
    flex: 1,
    paddingRight: 10,
  },
  addressName: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 2,
  },
  addressDetail: {
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  paymentMethodText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 2,
  },
  paymentMethodSub: {
    fontSize: 10,
    color: colors.textSecondary,
  },
  placeOrderBtn: {
    backgroundColor: colors.primary,
    borderRadius: 24,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 24,
    marginBottom: 12,
  },
  placeOrderText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  secureFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  secureText: {
    fontSize: 9,
    fontWeight: "800",
    color: colors.textSecondary,
    letterSpacing: 1,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  emptyIconCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: colors.surfaceWarm,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyTitle: {
    fontFamily: "serif",
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 8,
  },
  emptySub: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 18,
    marginBottom: 24,
  },
  browseBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 20,
  },
  browseBtnText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  modalTitle: {
    fontFamily: "serif",
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.textSecondary,
    marginBottom: 4,
    marginTop: 8,
  },
  input: {
    backgroundColor: colors.surfaceWarm,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 12,
    color: colors.text,
  },
  modalSaveBtn: {
    backgroundColor: colors.primary,
    borderRadius: 18,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 20,
  },
  modalSaveText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  paymentOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: colors.surfaceWarm,
    marginVertical: 6,
    gap: 12,
  },
  paymentOptionActive: {
    borderWidth: 1,
    borderColor: colors.primary,
  },
  paymentOptionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.text,
  },
  paymentOptionSub: {
    fontSize: 10,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
