import React, { useState, useEffect } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { colors } from "../theme/colors";
import { api } from "../services/api";
import { Product } from "../types";
import { formatCurrency } from "../utils/format";

type Props = {
  visible: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
  onError: (error: string) => void;
};

type SelectedItem = {
  variantId: string;
  productId: string;
  productTitle: string;
  variantTitle: string;
  price: number;
  quantity: number;
};

const GHANA_REGIONS = [
  "Greater Accra",
  "Ashanti",
  "Central",
  "Eastern",
  "Western",
  "Northern",
  "Volta",
  "Upper East",
  "Upper West",
  "Bono",
  "Bono East",
  "Ahafo",
  "Oti",
  "Savannah",
  "North East",
  "Western North",
];

export function ManualOrderModal({
  visible,
  onClose,
  onSuccess,
  onError,
}: Props) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);

  // Line items state
  const [lines, setLines] = useState<SelectedItem[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [selectedVariantId, setSelectedVariantId] = useState<string>("");
  const [itemQuantity, setItemQuantity] = useState<string>("1");

  // Customer state
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [staffNote, setStaffNote] = useState("");

  // Delivery state
  const [isPickup, setIsPickup] = useState(false);
  const [line1, setLine1] = useState("");
  const [city, setCity] = useState("Accra");
  const [region, setRegion] = useState("Greater Accra");
  const [shippingFee, setShippingFee] = useState("0");

  // Payment state
  const [markPaid, setMarkPaid] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Load catalog products for selection
  useEffect(() => {
    if (visible) {
      setLoadingProducts(true);
      api
        .getProducts({ limit: 100 })
        .then((res) => {
          setProducts(res.products || []);
          if (res.products && res.products.length > 0) {
            setSelectedProductId(res.products[0].id);
          }
        })
        .catch(() => {})
        .finally(() => setLoadingProducts(false));
    }
  }, [visible]);

  // Update selected variant when product changes
  useEffect(() => {
    if (selectedProductId) {
      const prod = products.find((p) => p.id === selectedProductId);
      if (prod && prod.variants && prod.variants.length > 0) {
        setSelectedVariantId(prod.variants[0].id);
      } else {
        setSelectedVariantId("");
      }
    }
  }, [selectedProductId, products]);

  if (!visible) return null;

  const currentProduct = products.find((p) => p.id === selectedProductId);
  const currentVariant = currentProduct?.variants?.find((v) => v.id === selectedVariantId);

  const handleAddItem = () => {
    if (!currentProduct || !currentVariant) {
      onError("Please select a valid product and variant.");
      return;
    }

    const qty = parseInt(itemQuantity, 10);
    if (isNaN(qty) || qty <= 0) {
      onError("Please enter a valid quantity.");
      return;
    }

    const existingIndex = lines.findIndex((l) => l.variantId === currentVariant.id);
    if (existingIndex >= 0) {
      const updated = [...lines];
      updated[existingIndex].quantity += qty;
      setLines(updated);
    } else {
      setLines([
        ...lines,
        {
          variantId: currentVariant.id,
          productId: currentProduct.id,
          productTitle: currentProduct.title,
          variantTitle: currentVariant.title || "Standard",
          price: currentVariant.price,
          quantity: qty,
        },
      ]);
    }

    setItemQuantity("1");
  };

  const handleRemoveLine = (variantId: string) => {
    setLines(lines.filter((l) => l.variantId !== variantId));
  };

  const subtotal = lines.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const parsedShippingFee = isPickup ? 0 : parseFloat(shippingFee) || 0;
  const grandTotal = subtotal + parsedShippingFee;

  const handleSubmit = async () => {
    if (lines.length === 0) {
      onError("Please add at least one product item to the order.");
      return;
    }

    if (!firstName.trim()) {
      onError("Please enter customer first name.");
      return;
    }

    if (!phone.trim()) {
      onError("Please enter customer phone number.");
      return;
    }

    setSubmitting(true);
    try {
      const customerEmail =
        email.trim() ||
        `${phone.replace(/[^0-9]/g, "")}@customer.nobleenclave.com`;

      const checkoutPayload = {
        customer: {
          firstName: firstName.trim(),
          lastName: lastName.trim() || firstName.trim(),
          email: customerEmail,
          phone: phone.trim(),
        },
        shippingAddress: {
          firstName: firstName.trim(),
          lastName: lastName.trim() || firstName.trim(),
          phone: phone.trim(),
          line1: isPickup ? "Showroom Self-Pickup" : (line1.trim() || "Address not specified"),
          city: isPickup ? "Accra" : city.trim(),
          region: isPickup ? "Greater Accra" : region,
          country: "GH",
        },
        items: lines.map((l) => ({
          variantId: l.variantId,
          quantity: l.quantity,
        })),
        deliveryType: (isPickup ? "pickup" : "delivery") as "pickup" | "delivery",
        paymentMethod: (markPaid ? "bank_card" : "mobile_money") as "bank_card" | "mobile_money",
        staffNote: staffNote.trim()
          ? `${staffNote.trim()}${markPaid ? " · (Marked as Paid in Showroom)" : ""}`
          : markPaid
          ? "Showroom Walk-in / WhatsApp Order - Paid"
          : "Created via Mobile App Admin",
      };

      const res = await api.checkout(checkoutPayload);

      if (res && res.order) {
        // If marked as paid, immediately update the order status
        if (markPaid) {
          try {
            await api.updateOrderStatus(res.order.id, {
              status: "PAID",
              staffNote: "Marked as PAID upon manual creation by store owner.",
            });
          } catch {}
        }

        onSuccess(`Order #${res.order.orderNumber} created successfully!`);
        // Reset form
        setLines([]);
        setFirstName("");
        setLastName("");
        setPhone("");
        setEmail("");
        setStaffNote("");
        setLine1("");
        onClose();
      } else {
        onError("Could not create order. Please check inputs.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create manual order.";
      onError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.overlay}
      >
        <View style={styles.card}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.badge}>STORE CONSOLE</Text>
              <Text style={styles.title}>Create New Order</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Feather name="x" size={20} color={colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
            {/* 1. SELECT PRODUCT & ADD LINES */}
            <Text style={styles.sectionHeading}>1. SELECT PRODUCTS</Text>
            {loadingProducts ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: 12 }} />
            ) : (
              <View style={styles.productPickerBox}>
                <Text style={styles.inputLabel}>Choose Product</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalScroll}>
                  {products.map((p) => (
                    <TouchableOpacity
                      key={p.id}
                      style={[
                        styles.chip,
                        selectedProductId === p.id && styles.chipActive,
                      ]}
                      onPress={() => setSelectedProductId(p.id)}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          selectedProductId === p.id && styles.chipTextActive,
                        ]}
                        numberOfLines={1}
                      >
                        {p.title}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                {currentProduct && currentProduct.variants && currentProduct.variants.length > 0 && (
                  <>
                    <Text style={[styles.inputLabel, { marginTop: 10 }]}>Variant / Size</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalScroll}>
                      {currentProduct.variants.map((v) => (
                        <TouchableOpacity
                          key={v.id}
                          style={[
                            styles.chip,
                            selectedVariantId === v.id && styles.chipActive,
                          ]}
                          onPress={() => setSelectedVariantId(v.id)}
                        >
                          <Text
                            style={[
                              styles.chipText,
                              selectedVariantId === v.id && styles.chipTextActive,
                            ]}
                          >
                            {v.title || "Default"} ({formatCurrency(v.price)})
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </>
                )}

                <View style={styles.qtyAddRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>Quantity</Text>
                    <TextInput
                      style={styles.qtyInput}
                      value={itemQuantity}
                      onChangeText={setItemQuantity}
                      keyboardType="number-pad"
                    />
                  </View>
                  <TouchableOpacity
                    style={styles.addBtn}
                    onPress={handleAddItem}
                    activeOpacity={0.8}
                  >
                    <Feather name="plus" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                    <Text style={styles.addBtnText}>ADD TO ORDER</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Added Lines List */}
            {lines.length > 0 ? (
              <View style={styles.linesCard}>
                <Text style={styles.linesTitle}>ORDER ITEMS ({lines.length})</Text>
                {lines.map((item) => (
                  <View key={item.variantId} style={styles.lineRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.lineProductTitle}>{item.productTitle}</Text>
                      <Text style={styles.lineVariantTitle}>
                        {item.variantTitle} · {formatCurrency(item.price)} each
                      </Text>
                    </View>
                    <Text style={styles.lineQty}>Qty: {item.quantity}</Text>
                    <Text style={styles.lineTotal}>
                      {formatCurrency(item.price * item.quantity)}
                    </Text>
                    <TouchableOpacity
                      onPress={() => handleRemoveLine(item.variantId)}
                      style={styles.trashBtn}
                    >
                      <Feather name="trash-2" size={15} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            ) : null}

            {/* 2. CUSTOMER DETAILS */}
            <Text style={styles.sectionHeading}>2. CUSTOMER DETAILS</Text>
            <View style={styles.gridRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>First Name *</Text>
                <TextInput
                  style={styles.input}
                  value={firstName}
                  onChangeText={setFirstName}
                  placeholder="e.g. Kwame"
                  placeholderTextColor="#999"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>Last Name</Text>
                <TextInput
                  style={styles.input}
                  value={lastName}
                  onChangeText={setLastName}
                  placeholder="e.g. Mensah"
                  placeholderTextColor="#999"
                />
              </View>
            </View>

            <Text style={styles.inputLabel}>Phone Number (Ghana MoMo/Call) *</Text>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              placeholder="e.g. 024 123 4567"
              placeholderTextColor="#999"
              keyboardType="phone-pad"
            />

            <Text style={styles.inputLabel}>Email Address (Optional)</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="e.g. kwame@example.com"
              placeholderTextColor="#999"
              keyboardType="email-address"
              autoCapitalize="none"
            />

            {/* 3. DELIVERY METHOD */}
            <Text style={styles.sectionHeading}>3. DELIVERY & DESTINATION</Text>
            <View style={styles.deliveryToggleRow}>
              <TouchableOpacity
                style={[styles.toggleBtn, !isPickup && styles.toggleBtnActive]}
                onPress={() => setIsPickup(false)}
              >
                <Feather
                  name="truck"
                  size={15}
                  color={!isPickup ? "#FFFFFF" : colors.textSecondary}
                />
                <Text style={[styles.toggleBtnText, !isPickup && styles.toggleBtnTextActive]}>
                  Delivery
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.toggleBtn, isPickup && styles.toggleBtnActive]}
                onPress={() => setIsPickup(true)}
              >
                <Feather
                  name="map-pin"
                  size={15}
                  color={isPickup ? "#FFFFFF" : colors.textSecondary}
                />
                <Text style={[styles.toggleBtnText, isPickup && styles.toggleBtnTextActive]}>
                  Showroom Pickup
                </Text>
              </TouchableOpacity>
            </View>

            {!isPickup ? (
              <>
                <Text style={styles.inputLabel}>Delivery Street Address *</Text>
                <TextInput
                  style={styles.input}
                  value={line1}
                  onChangeText={setLine1}
                  placeholder="e.g. 14 Senchi Street, Airport Residential"
                  placeholderTextColor="#999"
                />

                <View style={styles.gridRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>City / Town</Text>
                    <TextInput
                      style={styles.input}
                      value={city}
                      onChangeText={setCity}
                      placeholder="e.g. Accra"
                      placeholderTextColor="#999"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>Shipping Fee (GHS)</Text>
                    <TextInput
                      style={styles.input}
                      value={shippingFee}
                      onChangeText={setShippingFee}
                      keyboardType="numeric"
                    />
                  </View>
                </View>

                <Text style={styles.inputLabel}>Region</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalScroll}>
                  {GHANA_REGIONS.map((r) => (
                    <TouchableOpacity
                      key={r}
                      style={[styles.chip, region === r && styles.chipActive]}
                      onPress={() => setRegion(r)}
                    >
                      <Text style={[styles.chipText, region === r && styles.chipTextActive]}>
                        {r}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            ) : (
              <View style={styles.pickupCard}>
                <Feather name="check" size={16} color="#10B981" />
                <Text style={styles.pickupText}>
                  Client will collect in person from the Noble Enclave Showroom in Accra. (Free of charge)
                </Text>
              </View>
            )}

            {/* 4. PAYMENT & NOTES */}
            <Text style={styles.sectionHeading}>4. PAYMENT STATUS & NOTES</Text>
            <TouchableOpacity
              style={[styles.markPaidCard, markPaid && styles.markPaidCardActive]}
              onPress={() => setMarkPaid(!markPaid)}
              activeOpacity={0.8}
            >
              <Feather
                name={markPaid ? "check-circle" : "circle"}
                size={20}
                color={markPaid ? "#10B981" : colors.textSecondary}
              />
              <View style={{ flex: 1 }}>
                <Text style={[styles.markPaidTitle, markPaid && { color: "#065F46" }]}>
                  Mark Order as PAID Immediately
                </Text>
                <Text style={styles.markPaidSub}>
                  Use when client paid via Showroom POS, Cash, or Direct Bank Transfer. If left unchecked, order will be marked as PENDING and you can push MoMo PIN.
                </Text>
              </View>
            </TouchableOpacity>

            <Text style={styles.inputLabel}>Staff / Order Note</Text>
            <TextInput
              style={[styles.input, { height: 60 }]}
              value={staffNote}
              onChangeText={setStaffNote}
              placeholder="e.g. Client requested dispatch next Tuesday."
              placeholderTextColor="#999"
              multiline
            />

            {/* TOTAL BREAKDOWN */}
            <View style={styles.totalCard}>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Subtotal ({lines.length} items):</Text>
                <Text style={styles.totalValue}>{formatCurrency(subtotal)}</Text>
              </View>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Delivery Fee:</Text>
                <Text style={styles.totalValue}>{formatCurrency(parsedShippingFee)}</Text>
              </View>
              <View style={[styles.totalRow, styles.grandTotalRow]}>
                <Text style={styles.grandTotalLabel}>TOTAL ORDER AMOUNT:</Text>
                <Text style={styles.grandTotalValue}>{formatCurrency(grandTotal)}</Text>
              </View>
            </View>

            {/* SUBMIT BUTTON */}
            <TouchableOpacity
              style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
              onPress={handleSubmit}
              disabled={submitting}
              activeOpacity={0.85}
            >
              {submitting ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <>
                  <Feather name="check" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                  <Text style={styles.submitBtnText}>CREATE ORDER ({formatCurrency(grandTotal)})</Text>
                </>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "flex-end",
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: Platform.OS === "ios" ? 36 : 20,
    maxHeight: "92%",
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#EFECE6",
  },
  badge: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.primary,
    letterSpacing: 1.2,
    marginBottom: 2,
  },
  title: {
    fontFamily: "serif",
    fontSize: 20,
    fontWeight: "700",
    color: colors.text,
  },
  closeBtn: {
    padding: 6,
    backgroundColor: "#F3F1EC",
    borderRadius: 20,
  },
  sectionHeading: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.primary,
    letterSpacing: 1,
    marginTop: 14,
    marginBottom: 8,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textSecondary,
    marginBottom: 4,
    marginTop: 6,
  },
  input: {
    backgroundColor: "#F8F7F4",
    borderWidth: 1,
    borderColor: "#E5E1D8",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    color: colors.text,
    marginBottom: 4,
  },
  gridRow: {
    flexDirection: "row",
    gap: 10,
  },
  horizontalScroll: {
    marginVertical: 4,
  },
  chip: {
    backgroundColor: "#F3F1EC",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    marginRight: 8,
    borderWidth: 1,
    borderColor: "#E5E1D8",
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.text,
  },
  chipTextActive: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  productPickerBox: {
    backgroundColor: "#FAF8F5",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#EAE6DE",
  },
  qtyAddRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    marginTop: 10,
  },
  qtyInput: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E1D8",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    textAlign: "center",
    fontWeight: "700",
  },
  addBtn: {
    backgroundColor: colors.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 8,
  },
  addBtnText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  linesCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#EAE6DE",
    padding: 12,
    marginTop: 10,
  },
  linesTitle: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.textSecondary,
    marginBottom: 8,
  },
  lineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F1EC",
  },
  lineProductTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.text,
  },
  lineVariantTitle: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  lineQty: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.text,
  },
  lineTotal: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.primary,
  },
  trashBtn: {
    padding: 4,
  },
  deliveryToggleRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 10,
  },
  toggleBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#F3F1EC",
    borderWidth: 1,
    borderColor: "#E5E1D8",
  },
  toggleBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  toggleBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textSecondary,
  },
  toggleBtnTextActive: {
    color: "#FFFFFF",
  },
  pickupCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#F0FDF4",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#BBF7D0",
  },
  pickupText: {
    flex: 1,
    fontSize: 12,
    color: "#166534",
    lineHeight: 16,
  },
  markPaidCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "#F8F7F4",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E5E1D8",
    padding: 12,
    marginVertical: 6,
  },
  markPaidCardActive: {
    backgroundColor: "rgba(16, 185, 129, 0.08)",
    borderColor: "#10B981",
  },
  markPaidTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.text,
  },
  markPaidSub: {
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 15,
    marginTop: 2,
  },
  totalCard: {
    backgroundColor: "#FAF7EE",
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.gold,
    marginTop: 14,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  totalLabel: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  totalValue: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.text,
  },
  grandTotalRow: {
    borderTopWidth: 1,
    borderTopColor: "#EAE3D2",
    paddingTop: 8,
    marginTop: 4,
    marginBottom: 0,
  },
  grandTotalLabel: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.primary,
  },
  grandTotalValue: {
    fontSize: 16,
    fontWeight: "900",
    color: colors.primary,
  },
  submitBtn: {
    backgroundColor: colors.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 10,
    marginTop: 16,
  },
  submitBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
});
