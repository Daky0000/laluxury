import React, { useState, useEffect, useRef } from "react";
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
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../theme/colors";
import { api } from "../services/api";
import { CartItem, User, ShippingAddress, ShippingRate, GHANA_REGIONS } from "../types";
import { formatCurrency } from "../utils/format";
import { resolveImageUrl } from "../utils/image";

type Props = {
  cart: CartItem[];
  user: User | null;
  onBack: () => void;
  onUpdateQuantity: (variantId: string, delta: number) => void;
  onRemoveItem: (variantId: string) => void;
  onClearCart: () => void;
  onOrderSuccess: (orderNumber: string, customerPhone?: string, customerEmail?: string) => void;
  onBrowseProducts: () => void;
  onNotify?: (notif: {
    title: string;
    message?: string;
    type?: "success" | "info" | "warning" | "error";
    icon?: keyof typeof Feather.glyphMap;
  }) => void;
  onAuthSuccess?: (user: User, token: string) => void;
};

const PAYMENT_METHODS = [
  {
    id: "momo_push",
    label: "Mobile Money (Instant Phone Prompt)",
    subtitle: "Prompt sent to phone — enter 4-digit PIN to pay instantly",
    icon: "smartphone" as const,
    badge: "POPULAR IN GHANA",
  },
  {
    id: "paystack",
    label: "Paystack (Debit/Credit Card)",
    subtitle: "Instant settlement via Visa, Mastercard & web gateway",
    icon: "credit-card" as const,
  },
  {
    id: "direct_momo",
    label: "Direct MoMo / Bank Transfer",
    subtitle: "Manual transfer to official merchant account with verification",
    icon: "send" as const,
  },
  {
    id: "pay_on_delivery",
    label: "Pay on Delivery / Concierge",
    subtitle: "Inspect furniture upon delivery and pay concierge",
    icon: "truck" as const,
  },
];

const NETWORKS: Array<{
  id: "mtn" | "vod" | "tgo";
  name: string;
  badgeColor: string;
  badgeTextColor: string;
}> = [
  { id: "mtn", name: "MTN Mobile Money", badgeColor: "#FFCC00", badgeTextColor: "#000000" },
  { id: "vod", name: "Telecel (Vodafone)", badgeColor: "#E60000", badgeTextColor: "#FFFFFF" },
  { id: "tgo", name: "AT Money (AirtelTigo)", badgeColor: "#003399", badgeTextColor: "#FFFFFF" },
];

function detectMoMoProvider(phone: string): "mtn" | "vod" | "tgo" {
  const clean = phone.replace(/[^0-9]/g, "");
  let prefix = "";
  if (clean.startsWith("233")) {
    prefix = clean.substring(3, 5);
  } else if (clean.startsWith("0")) {
    prefix = clean.substring(1, 3);
  } else {
    prefix = clean.substring(0, 2);
  }

  if (["24", "54", "55", "59", "53"].includes(prefix)) return "mtn";
  if (["20", "50"].includes(prefix)) return "vod";
  if (["27", "57", "26", "56"].includes(prefix)) return "tgo";
  return "mtn";
}

export function StorefrontCartScreen({
  cart,
  user,
  onBack,
  onUpdateQuantity,
  onRemoveItem,
  onClearCart,
  onOrderSuccess,
  onBrowseProducts,
  onNotify,
  onAuthSuccess,
}: Props) {
  const insets = useSafeAreaInsets();
  const [submitting, setSubmitting] = useState(false);
  const [showAddressModal, setShowAddressModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState(PAYMENT_METHODS[0].id);
  const [isTestMode, setIsTestMode] = useState(false);
  const [deliveryType, setDeliveryType] = useState<"delivery" | "pickup">("delivery");
  const [shippingRates, setShippingRates] = useState<ShippingRate[]>([]);
  const [selectedRateId, setSelectedRateId] = useState<string | null>(null);
  const [loadingRates, setLoadingRates] = useState(false);
  const [freeShippingThreshold, setFreeShippingThreshold] = useState<number | null>(null);
  const [promoCodeInput, setPromoCodeInput] = useState("");
  const [appliedPromo, setAppliedPromo] = useState<string | null>(null);
  const [preorderDepositOption, setPreorderDepositOption] = useState<"full" | "deposit_50">("full");

  // Customer contact states for instant MoMo and receipt delivery (no prefill, placeholders show)
  const [momoPhone, setMomoPhone] = useState("");
  const [momoProvider, setMomoProvider] = useState<"mtn" | "vod" | "tgo">("mtn");
  const [customerEmail, setCustomerEmail] = useState("");

  // MoMo Authorization Prompt Modal states
  const [showMoMoPromptModal, setShowMoMoPromptModal] = useState(false);
  const [momoPushData, setMomoPushData] = useState<{
    status: string;
    reference: string;
    phone: string;
    provider: string;
    providerLabel: string;
    amountFormatted: string;
    displayText: string;
  } | null>(null);
  const [pendingOrderNumber, setPendingOrderNumber] = useState<string | null>(null);
  const [momoPolling, setMomoPolling] = useState(false);
  const [momoVerified, setMomoVerified] = useState(false);
  const [momoErrorMessage, setMomoErrorMessage] = useState<string | null>(null);
  const [otpInput, setOtpInput] = useState("");
  const [submittingOtp, setSubmittingOtp] = useState(false);
  const [verifyingManual, setVerifyingManual] = useState(false);
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clean up interval on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  useEffect(() => {
    api
      .getStoreConfig()
      .then((cfg) => {
        setIsTestMode(Boolean(cfg.isTestMode));
        if (cfg.freeShippingThreshold !== undefined) {
          setFreeShippingThreshold(cfg.freeShippingThreshold);
        }
      })
      .catch(() => {});
  }, []);

  // Ghanaian delivery address - clean empty strings so placeholders show instead of dummy text
  const [shippingAddress, setShippingAddress] = useState<ShippingAddress>({
    firstName: "",
    lastName: "",
    phone: "",
    line1: "",
    line2: "",
    city: "",
    region: "Greater Accra",
    country: "Ghana",
  });

  // Calculate Subtotal & Totals in pesewas (minor units)
  const subtotal = cart.reduce((acc, item) => {
    return acc + item.variant.price * item.quantity;
  }, 0);

  // Dynamically quote shipping rates whenever region or subtotal changes
  useEffect(() => {
    if (cart.length === 0) {
      setShippingRates([]);
      return;
    }
    setLoadingRates(true);
    api
      .getShippingRates({
        region: shippingAddress.region,
        subtotal,
      })
      .then((res) => {
        if (res.ok) {
          setShippingRates(res.rates || []);
          if (res.freeShippingThreshold !== undefined) {
            setFreeShippingThreshold(res.freeShippingThreshold);
          }
          if (res.rates && res.rates.length > 0) {
            setSelectedRateId((curr) => {
              const stillExists = res.rates.some((r) => r.id === curr);
              return stillExists ? curr : res.rates[0].id;
            });
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoadingRates(false));
  }, [shippingAddress.region, subtotal, cart.length]);

  const isPickup = deliveryType === "pickup";
  const selectedRate = shippingRates.find((r) => r.id === selectedRateId) || shippingRates[0];
  const isFreeDelivery =
    isPickup ||
    Boolean(selectedRate?.isFree) ||
    (freeShippingThreshold !== null && subtotal >= freeShippingThreshold);
  const shippingFee = cart.length > 0 && !isPickup ? (isFreeDelivery ? 0 : (selectedRate?.price ?? 0)) : 0;
  const total = subtotal + shippingFee;

  const hasPreorderItems = cart.some((item) => Boolean(item.product.isPreorder));
  const is50PercentDeposit = hasPreorderItems && preorderDepositOption === "deposit_50";
  const amountDueNow = is50PercentDeposit ? Math.round(total * 0.5) : total;

  const startMoMoPolling = (
    reference: string,
    orderNum: string,
    phone: string,
    token?: string | null,
    loggedUser?: User | null,
  ) => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }

    setMomoPolling(true);
    let attempts = 0;
    const maxAttempts = 35; // ~105 seconds

    pollingIntervalRef.current = setInterval(async () => {
      attempts++;
      try {
        const verifyRes = await api.verifyOrderPayment(reference);
        if (verifyRes.ok && verifyRes.paid) {
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }
          setMomoPolling(false);
          setMomoVerified(true);

          if (token && loggedUser) {
            await api.setSession(token, loggedUser);
            onAuthSuccess?.(loggedUser, token);
          }

          setTimeout(() => {
            setShowMoMoPromptModal(false);
            onClearCart();
            onOrderSuccess(
              orderNum,
              phone,
              customerEmail.trim() || user?.email || undefined
            );
          }, 1500);
        } else if (attempts >= maxAttempts) {
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }
          setMomoPolling(false);
        }
      } catch {
        // Continue polling silently
      }
    }, 3000);
  };

  const handleManualVerifyMoMo = async (simulate = false) => {
    if (!momoPushData?.reference || !pendingOrderNumber) return;
    setVerifyingManual(true);
    setMomoErrorMessage(null);

    try {
      const verifyRes = await api.verifyOrderPayment(momoPushData.reference, simulate);
      if (verifyRes.ok && verifyRes.paid) {
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
        setMomoPolling(false);
        setMomoVerified(true);

        setTimeout(() => {
          setShowMoMoPromptModal(false);
          onClearCart();
          onOrderSuccess(
            pendingOrderNumber,
            momoPushData.phone,
            customerEmail.trim() || user?.email || undefined
          );
        }, 1200);
      } else if (verifyRes.status === "failed") {
        setMomoErrorMessage(verifyRes.error || "Payment was declined or cancelled on your handset.");
      } else {
        if (onNotify) {
          onNotify({
            title: "Awaiting Confirmation",
            message: "Payment prompt is still pending. Please authorize on your phone.",
            type: "info",
            icon: "smartphone",
          });
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Verification check failed";
      setMomoErrorMessage(msg);
    } finally {
      setVerifyingManual(false);
    }
  };

  const handleSubmitMoMoOtp = async () => {
    if (!momoPushData?.reference || !otpInput.trim()) return;
    setSubmittingOtp(true);
    setMomoErrorMessage(null);

    try {
      const res = await api.submitOrderOtp(momoPushData.reference, otpInput.trim());
      if (res.ok && res.paid) {
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
        setMomoPolling(false);
        setMomoVerified(true);
        setTimeout(() => {
          setShowMoMoPromptModal(false);
          onClearCart();
          onOrderSuccess(
            pendingOrderNumber || "ORDER",
            momoPushData.phone,
            customerEmail.trim() || user?.email || undefined
          );
        }, 1200);
      } else {
        handleManualVerifyMoMo();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Invalid voucher code or OTP.";
      setMomoErrorMessage(msg);
    } finally {
      setSubmittingOtp(false);
    }
  };

  const handlePlaceOrder = async () => {
    if (cart.length === 0) {
      if (onNotify) {
        onNotify({
          title: "Bag is Empty",
          message: "Add some handcrafted pieces before checking out.",
          type: "warning",
          icon: "shopping-bag",
        });
      } else {
        Alert.alert("Your Bag is Empty", "Add some handcrafted pieces before checking out.");
      }
      return;
    }

    const trimmedFirst = (shippingAddress.firstName || "").trim();
    const trimmedPhone = (shippingAddress.phone || "").trim();
    const trimmedLine1 = (shippingAddress.line1 || "").trim();
    const trimmedCity = (shippingAddress.city || "").trim();

    if (!trimmedFirst) {
      if (onNotify) {
        onNotify({
          title: "First Name Required",
          message: "Please enter your first name for the delivery receipt.",
          type: "warning",
          icon: "user",
        });
      } else {
        Alert.alert("First Name Required", "Please enter your first name for the delivery receipt.");
      }
      setShowAddressModal(true);
      return;
    }

    if (!trimmedPhone || trimmedPhone.replace(/[^0-9]/g, "").length < 9) {
      if (onNotify) {
        onNotify({
          title: "Phone Number Required",
          message: "Please enter a valid phone number for your delivery and SMS receipt.",
          type: "warning",
          icon: "phone",
        });
      } else {
        Alert.alert("Phone Required", "Please enter a valid phone number for your delivery and SMS receipt.");
      }
      setShowAddressModal(true);
      return;
    }

    if (deliveryType === "delivery" && (!trimmedLine1 || !trimmedCity)) {
      if (onNotify) {
        onNotify({
          title: "Address Required",
          message: "Please enter your delivery street address and city.",
          type: "warning",
          icon: "map-pin",
        });
      } else {
        Alert.alert("Address Required", "Please enter your delivery street address and city.");
      }
      setShowAddressModal(true);
      return;
    }

    if (selectedPayment === "momo_push") {
      const cleanMomo = (momoPhone || shippingAddress.phone || "").replace(/[^0-9]/g, "");
      if (cleanMomo.length < 9) {
        if (onNotify) {
          onNotify({
            title: "MoMo Number Required",
            message: "Please enter a valid Ghana Mobile Money phone number to receive the prompt.",
            type: "warning",
            icon: "smartphone",
          });
        } else {
          Alert.alert("Phone Required", "Please enter a valid Ghana Mobile Money phone number.");
        }
        return;
      }
    }

    setSubmitting(true);
    try {
      const safeFirst = trimmedFirst || user?.firstName?.trim() || "Customer";
      const safeLast = (shippingAddress.lastName || "").trim() || user?.lastName?.trim() || safeFirst;
      const safePhone = trimmedPhone || user?.phone || momoPhone || "0240000000";
      const safeEmail =
        customerEmail.trim() ||
        user?.email ||
        `${safePhone.replace(/[^0-9]/g, "")}@customer.nobleenclave.com`;

      const orderPayload = {
        items: cart.map((item) => ({
          variantId: item.variant.id,
          quantity: item.quantity,
        })),
        customer: {
          firstName: safeFirst,
          lastName: safeLast,
          email: safeEmail,
          phone: safePhone,
        },
        shippingAddress: isPickup
          ? {
              firstName: safeFirst,
              lastName: safeLast,
              phone: safePhone,
              line1: "Noble Enclave Showroom (Self-Pickup)",
              line2: "Spintex Road / Airport Residential",
              city: "Accra",
              region: "Greater Accra",
              country: "Ghana",
            }
          : {
              firstName: safeFirst,
              lastName: safeLast,
              phone: safePhone,
              line1: trimmedLine1,
              line2: shippingAddress.line2?.trim() || null,
              city: trimmedCity,
              region: shippingAddress.region || "Greater Accra",
              country: shippingAddress.country || "Ghana",
            },
        shippingRateId: isPickup ? null : (selectedRate?.id || null),
        discountCode: appliedPromo || null,
        preorderDepositOption: hasPreorderItems ? preorderDepositOption : null,
        paymentMethod: selectedPayment,
        momoPhone: selectedPayment === "momo_push" ? (momoPhone || safePhone) : undefined,
        momoProvider: selectedPayment === "momo_push" ? momoProvider : undefined,
        idempotencyKey: `mob-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      };

      const res = await api.checkout(orderPayload);
      if (res.ok) {
        // If guest checkout created an account and returned credentials, save session immediately
        if (res.token && res.user) {
          try {
            await api.setSession(res.token, res.user);
            onAuthSuccess?.(res.user, res.token);
          } catch {
            // Non-critical session persist
          }
        }

        // Direct Mobile Money USSD prompt path
        if (res.momoPush && res.momoPush.status === "pay_offline") {
          setMomoPushData(res.momoPush);
          setPendingOrderNumber(res.order.orderNumber);
          setMomoVerified(false);
          setMomoErrorMessage(null);
          setShowMoMoPromptModal(true);
          startMoMoPolling(
            res.momoPush.reference,
            res.order.orderNumber,
            res.momoPush.phone,
            res.token,
            res.user,
          );
          return;
        }

        onClearCart();

        if (res.isTestOrder) {
          if (onNotify) {
            onNotify({
              title: "🧪 Test Order Placed!",
              message: `Order #${res.order.orderNumber} placed in test mode. No real money charged.`,
              type: "warning",
              icon: "check-circle",
            });
          }
        } else if (res.paymentUrl) {
          if (onNotify) {
            onNotify({
              title: "Redirecting to Paystack",
              message: `Opening Paystack secure checkout for Order #${res.order.orderNumber}...`,
              type: "info",
              icon: "credit-card",
            });
          }
          Linking.openURL(res.paymentUrl).catch(() => {
            Alert.alert(
              "Payment Initialized",
              `Order #${res.order.orderNumber} created. Paystack gateway link: ${res.paymentUrl}`,
            );
          });
        } else {
          if (onNotify) {
            onNotify({
              title: "Order Placed Successfully",
              message: `Order #${res.order.orderNumber} received. Receipt sent via SMS & Email.`,
              type: "success",
              icon: "shopping-bag",
            });
          }
        }

        onOrderSuccess(
          res.order.orderNumber,
          shippingAddress.phone,
          customerEmail.trim() || user?.email || undefined
        );
      } else {
        throw new Error("Unable to complete order.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to place order.";
      const unavailableIds: string[] = (err as any)?.unavailableVariantIds || [];

      if (
        unavailableIds.length > 0 ||
        msg.toLowerCase().includes("no longer available") ||
        msg.toLowerCase().includes("unavailable")
      ) {
        Alert.alert(
          "Items Unavailable in Bag",
          "One or more products in your bag are no longer available in the atelier inventory. Would you like to remove only the unavailable items and keep the rest?",
          [
            { text: "Review Bag", style: "cancel" },
            {
              text: "Remove Unavailable Items",
              style: "destructive",
              onPress: () => {
                if (unavailableIds.length > 0) {
                  for (const id of unavailableIds) {
                    onRemoveItem(id);
                  }
                } else {
                  for (const item of cart) {
                    if (item.variant.id.endsWith("-default")) {
                      onRemoveItem(item.variant.id);
                    }
                  }
                }
                if (onNotify) {
                  onNotify({
                    title: "Bag Updated",
                    message: "Unavailable items were removed from your bag. You can now checkout.",
                    type: "info",
                    icon: "shopping-bag",
                  });
                }
              },
            },
          ]
        );
        return;
      }

      if (onNotify) {
        onNotify({
          title: "Order Could Not Be Placed",
          message: msg,
          type: "error",
          icon: "alert-circle",
        });
      } else {
        Alert.alert("Order Error", msg);
      }
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
            <Text style={styles.brandTitle}>NOBLE ENCLAVE</Text>
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
          <Text style={styles.brandTitle}>NOBLE ENCLAVE</Text>
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
        {/* Test Mode Banner */}
        {isTestMode ? (
          <View style={styles.testModeBanner}>
            <Feather name="shield" size={16} color="#B45309" />
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={styles.testModeBannerTitle}>🧪 TEST MODE ACTIVE</Text>
              <Text style={styles.testModeBannerSub}>
                Purchases are simulated for testing. No real money will be charged.
              </Text>
            </View>
          </View>
        ) : null}

        {/* Title */}
        <Text style={styles.checkoutTitle}>CHECKOUT & PAYMENT</Text>

        {/* Bag Items List */}
        <View style={styles.itemsList}>
          {cart.map((item) => (
            <View key={item.variant.id} style={styles.cartItemRow}>
              {/* Product Thumbnail */}
              <View style={styles.thumbnailContainer}>
                {resolveImageUrl(item.product.images?.[0]?.url) ? (
                  <Image
                    source={{ uri: resolveImageUrl(item.product.images?.[0]?.url)! }}
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

        {/* Free Shipping Qualification Banner */}
        {freeShippingThreshold !== null && (
          <View
            style={[
              styles.freeShippingNotice,
              isFreeDelivery ? styles.freeShippingNoticeActive : null,
            ]}
          >
            <Feather
              name={isFreeDelivery ? "check-circle" : "truck"}
              size={14}
              color={isFreeDelivery ? "#2E7D32" : colors.primary}
            />
            <Text
              style={[
                styles.freeShippingNoticeText,
                isFreeDelivery ? styles.freeShippingNoticeTextActive : null,
              ]}
            >
              {isFreeDelivery
                ? "Free Nationwide Delivery qualified on this order!"
                : `Add ${formatCurrency(Math.max(0, freeShippingThreshold - subtotal))} more for Free Delivery`}
            </Text>
          </View>
        )}

        {/* Pre-order Deposit Option if cart contains pre-order items */}
        {hasPreorderItems && (
          <View style={styles.preorderDepositCard}>
            <View style={styles.preorderDepositHeader}>
              <Feather name="clock" size={15} color={colors.primary} />
              <Text style={styles.preorderDepositTitle}>Pre-Order Deposit Option</Text>
            </View>
            <Text style={styles.preorderDepositSubtitle}>
              Your bag contains bespoke handcrafted pieces made to order.
            </Text>
            <View style={styles.preorderDepositTabs}>
              <TouchableOpacity
                style={[
                  styles.depositTab,
                  preorderDepositOption === "deposit_50" && styles.depositTabActive,
                ]}
                onPress={() => setPreorderDepositOption("deposit_50")}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.depositTabText,
                    preorderDepositOption === "deposit_50" && styles.depositTabTextActive,
                  ]}
                >
                  50% Deposit Now
                </Text>
                <Text style={styles.depositTabAmount}>
                  {formatCurrency(Math.round(total * 0.5))}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.depositTab,
                  preorderDepositOption === "full" && styles.depositTabActive,
                ]}
                onPress={() => setPreorderDepositOption("full")}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.depositTabText,
                    preorderDepositOption === "full" && styles.depositTabTextActive,
                  ]}
                >
                  Pay in Full
                </Text>
                <Text style={styles.depositTabAmount}>{formatCurrency(total)}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* 1. DELIVERY OR PICKUP METHOD */}
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionHeaderLabel}>DELIVERY OR PICKUP</Text>
          <View style={styles.deliveryTypeToggle}>
            <TouchableOpacity
              style={[
                styles.deliveryTypeBtn,
                deliveryType === "delivery" && styles.deliveryTypeBtnActive,
              ]}
              onPress={() => setDeliveryType("delivery")}
              activeOpacity={0.8}
            >
              <Feather
                name="truck"
                size={16}
                color={deliveryType === "delivery" ? "#FFFFFF" : colors.text}
              />
              <Text
                style={[
                  styles.deliveryTypeBtnText,
                  deliveryType === "delivery" && styles.deliveryTypeBtnTextActive,
                ]}
              >
                Door Delivery
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.deliveryTypeBtn,
                deliveryType === "pickup" && styles.deliveryTypeBtnActive,
              ]}
              onPress={() => setDeliveryType("pickup")}
              activeOpacity={0.8}
            >
              <Feather
                name="map-pin"
                size={16}
                color={deliveryType === "pickup" ? "#FFFFFF" : colors.text}
              />
              <Text
                style={[
                  styles.deliveryTypeBtnText,
                  deliveryType === "pickup" && styles.deliveryTypeBtnTextActive,
                ]}
              >
                Store Pickup (FREE)
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* If Door Delivery: Show Delivery Address + Delivery Method Rates */}
        {deliveryType === "delivery" && (
          <>
            {/* Delivery Address Card */}
            <View style={styles.sectionContainer}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <Text style={styles.sectionHeaderLabel}>DELIVERY ADDRESS</Text>
                {shippingAddress.line1 ? (
                  <TouchableOpacity onPress={() => setShowAddressModal(true)}>
                    <Text style={{ fontSize: 12, fontWeight: "700", color: colors.primary }}>EDIT</Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              {shippingAddress.line1 ? (
                <TouchableOpacity
                  style={styles.cardSelectable}
                  onPress={() => setShowAddressModal(true)}
                  activeOpacity={0.8}
                >
                  <View style={styles.cardContentLeft}>
                    <Text style={styles.addressName}>
                      {[shippingAddress.firstName, shippingAddress.lastName].filter(Boolean).join(" ")} · {shippingAddress.phone}
                    </Text>
                    <Text style={styles.addressDetail}>
                      {shippingAddress.line1}{shippingAddress.line2 ? `, ${shippingAddress.line2}` : ""}, {shippingAddress.city}, {shippingAddress.region}
                    </Text>
                  </View>
                  <Feather name="chevron-right" size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.cardSelectable, { borderStyle: "dashed", borderColor: colors.primary, backgroundColor: "#FAF7F5" }]}
                  onPress={() => setShowAddressModal(true)}
                  activeOpacity={0.8}
                >
                  <View style={styles.cardContentLeft}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Feather name="plus-circle" size={18} color={colors.primary} />
                      <Text style={[styles.paymentMethodText, { color: colors.primary }]}>Add Delivery Address</Text>
                    </View>
                    <Text style={styles.paymentMethodSub}>Tap to enter recipient name and address</Text>
                  </View>
                  <Feather name="chevron-right" size={20} color={colors.primary} />
                </TouchableOpacity>
              )}
            </View>

            {/* Delivery Method Selector */}
            <View style={styles.sectionContainer}>
              <Text style={styles.sectionHeaderLabel}>DELIVERY METHOD</Text>
              {loadingRates ? (
                <View style={[styles.cardSelectable, { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 14 }]}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={{ marginLeft: 8, fontSize: 13, color: colors.textSecondary }}>
                    Quoting delivery rates...
                  </Text>
                </View>
              ) : shippingRates.length === 0 ? (
                <View style={styles.cardSelectable}>
                  <View style={styles.cardContentLeft}>
                    <Text style={styles.paymentMethodText}>Standard Delivery</Text>
                    <Text style={styles.paymentMethodSub}>{shippingAddress.region || "Greater Accra"} · Calculated at checkout</Text>
                  </View>
                  <Text style={{ fontSize: 14, fontWeight: "700", color: colors.primary }}>
                    {isFreeDelivery ? "FREE" : "—"}
                  </Text>
                </View>
              ) : (
                <View style={{ gap: 8 }}>
                  {shippingRates.map((rate) => {
                    const isSelected = selectedRate?.id === rate.id;
                    const ratePrice = isFreeDelivery || rate.isFree ? 0 : rate.price;
                    return (
                      <TouchableOpacity
                        key={rate.id}
                        style={[
                          styles.cardSelectable,
                          isSelected && {
                            borderColor: colors.primary,
                            borderWidth: 1.5,
                            backgroundColor: "#FAF7F5",
                          },
                        ]}
                        onPress={() => setSelectedRateId(rate.id)}
                        activeOpacity={0.8}
                      >
                        <View style={styles.cardContentLeft}>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                            <Text style={[styles.paymentMethodText, isSelected && { color: colors.primary, fontWeight: "700" }]}>
                              {rate.name}
                            </Text>
                            {(rate.isFree || ratePrice === 0) && (
                              <View style={{ backgroundColor: "#E6F4EA", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                                <Text style={{ color: "#137333", fontSize: 11, fontWeight: "700" }}>FREE</Text>
                              </View>
                            )}
                          </View>
                          <Text style={styles.paymentMethodSub}>
                            {rate.estimatedDaysMin !== null && rate.estimatedDaysMax !== null
                              ? `${rate.estimatedDaysMin === rate.estimatedDaysMax ? rate.estimatedDaysMin : `${rate.estimatedDaysMin}–${rate.estimatedDaysMax}`} business days · ${rate.zoneName}`
                              : rate.zoneName}
                          </Text>
                        </View>
                        <Text style={{ fontSize: 14, fontWeight: "700", color: isSelected ? colors.primary : colors.text }}>
                          {ratePrice === 0 ? "FREE" : formatCurrency(ratePrice)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>
          </>
        )}

        {/* If Store Pickup: Show Pickup Location Details */}
        {deliveryType === "pickup" && (
          <View style={styles.sectionContainer}>
            <Text style={styles.sectionHeaderLabel}>PICKUP LOCATION</Text>
            <View style={[styles.cardSelectable, { backgroundColor: "#FAF7F5", borderColor: colors.primary }]}>
              <View style={styles.cardContentLeft}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <Text style={[styles.paymentMethodText, { color: colors.primary }]}>
                    Noble Enclave Atelier & Living Showroom
                  </Text>
                  <View style={{ backgroundColor: "#E6F4EA", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                    <Text style={{ color: "#137333", fontSize: 11, fontWeight: "700" }}>FREE</Text>
                  </View>
                </View>
                <Text style={styles.addressDetail}>
                  Spintex Road / Airport Residential Atelier, Accra
                </Text>
                <Text style={[styles.paymentMethodSub, { marginTop: 4 }]}>
                  Opening Hours: Mon – Sat, 9:00 AM – 6:00 PM
                </Text>
                <Text style={[styles.paymentMethodSub, { color: colors.primary, marginTop: 2 }]}>
                  • Ready for collection within 2–4 hours
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* 2. COST SUMMARY BREAKDOWN (Comes AFTER Delivery, BEFORE Payment!) */}
        <View style={styles.summaryBox}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>SUBTOTAL</Text>
            <Text style={styles.summaryValue}>{formatCurrency(subtotal)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>
              {deliveryType === "pickup"
                ? "STORE PICKUP"
                : `DELIVERY (${selectedRate ? selectedRate.name.toUpperCase() : "STANDARD"})`}
            </Text>
            <Text style={styles.summaryValue}>
              {deliveryType === "pickup" ? "FREE" : isFreeDelivery ? "FREE" : formatCurrency(shippingFee)}
            </Text>
          </View>
          <View style={[styles.summaryRow, styles.summaryTotalRow]}>
            <Text style={styles.totalLabel}>TOTAL</Text>
            <Text style={styles.totalValue}>{formatCurrency(total)}</Text>
          </View>
          {is50PercentDeposit && (
            <View style={[styles.summaryRow, { marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: "#EAD5D9" }]}>
              <Text style={[styles.summaryLabel, { color: colors.primary, fontWeight: "700" }]}>
                DUE TODAY (50% DEPOSIT)
              </Text>
              <Text style={[styles.summaryValue, { color: colors.primary, fontWeight: "800", fontSize: 16 }]}>
                {formatCurrency(amountDueNow)}
              </Text>
            </View>
          )}
        </View>

        {/* 3. PAYMENT METHOD (Comes AFTER Subtotal and Total!) */}
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionHeaderLabel}>PAYMENT METHOD</Text>
          <TouchableOpacity
            style={styles.cardSelectable}
            onPress={() => setShowPaymentModal(true)}
            activeOpacity={0.8}
          >
            <View style={styles.cardContentLeft}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={styles.paymentMethodText}>{currentPayment.label}</Text>
                {currentPayment.badge && (
                  <View style={{ backgroundColor: "#F3E8EC", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                    <Text style={{ color: colors.primary, fontSize: 10, fontWeight: "700" }}>{currentPayment.badge}</Text>
                  </View>
                )}
              </View>
              <Text style={styles.paymentMethodSub}>{currentPayment.subtitle}</Text>
            </View>
            <Feather name="chevron-right" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Mobile Money Inline Configuration */}
        {selectedPayment === "momo_push" && (
          <View style={styles.momoCard}>
            <View style={styles.momoCardHeader}>
              <Feather name="smartphone" size={16} color={colors.primary} />
              <Text style={styles.momoCardTitle}>INSTANT MOBILE MONEY PROMPT</Text>
            </View>
            <Text style={styles.momoCardSubtitle}>
              We will send a USSD prompt with the exact amount to your phone. Simply enter your 4-digit MoMo PIN to approve.
            </Text>

            {/* Network Chips */}
            <Text style={styles.momoInputLabel}>SELECT NETWORK</Text>
            <View style={styles.networkSelectorRow}>
              {NETWORKS.map((net) => {
                const isSelected = momoProvider === net.id;
                return (
                  <TouchableOpacity
                    key={net.id}
                    style={[
                      styles.networkChip,
                      isSelected && styles.networkChipSelected,
                    ]}
                    onPress={() => setMomoProvider(net.id)}
                    activeOpacity={0.8}
                  >
                    <View
                      style={[
                        styles.networkDot,
                        { backgroundColor: net.badgeColor },
                      ]}
                    />
                    <Text
                      style={[
                        styles.networkChipText,
                        isSelected && styles.networkChipTextSelected,
                      ]}
                    >
                      {net.name.split(" ")[0]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* MoMo Phone Number Input */}
            <Text style={styles.momoInputLabel}>MOMO PHONE NUMBER (FOR PIN PROMPT & SMS)</Text>
            <View style={styles.momoPhoneInputWrapper}>
              <View style={styles.ghanaFlagPrefix}>
                <Text style={{ fontSize: 12, fontWeight: "700", color: colors.text }}>🇬🇭 +233</Text>
              </View>
              <TextInput
                style={styles.momoPhoneInput}
                placeholder="024 123 4567"
                placeholderTextColor="#999"
                keyboardType="phone-pad"
                value={momoPhone}
                onChangeText={(val) => {
                  setMomoPhone(val);
                  setMomoProvider(detectMoMoProvider(val));
                }}
              />
            </View>

            {/* Email Input for PDF Receipt */}
            <Text style={styles.momoInputLabel}>EMAIL FOR RECEIPT & INVOICE (PDF)</Text>
            <View style={styles.momoEmailInputWrapper}>
              <Feather name="mail" size={16} color={colors.textSecondary} style={{ marginLeft: 12 }} />
              <TextInput
                style={styles.momoEmailInput}
                placeholder="Enter email to receive receipt PDF"
                placeholderTextColor="#999"
                keyboardType="email-address"
                autoCapitalize="none"
                value={customerEmail}
                onChangeText={setCustomerEmail}
              />
            </View>

            <View style={styles.momoSecurityNotice}>
              <Feather name="shield" size={12} color={colors.primary} />
              <Text style={styles.momoSecurityNoticeText}>
                No card details needed. Safe & direct USSD authentication from your telco.
              </Text>
            </View>
          </View>
        )}

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
              {selectedPayment === "momo_push"
                ? "SEND MOMO PROMPT · "
                : selectedPayment === "paystack"
                ? "PROCEED TO PAYSTACK · "
                : "PLACE ORDER · "}
              {formatCurrency(amountDueNow)}
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

        <View style={{ height: 40 + Math.max(insets.bottom, 16) }} />
      </ScrollView>

      {/* Edit Address Modal */}
      <Modal
        visible={showAddressModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAddressModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalContent, { paddingBottom: Math.max(insets.bottom, 24) }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Delivery Address</Text>
                <Text style={styles.modalSubtitleText}>
                  Enter recipient address details for nationwide delivery
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowAddressModal(false)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Feather name="x" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              style={{ maxHeight: 420 }}
            >
              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>First Name *</Text>
                  <TextInput
                    style={styles.input}
                    value={shippingAddress.firstName}
                    placeholder="e.g. Kwame"
                    placeholderTextColor="#999"
                    onChangeText={(val) =>
                      setShippingAddress((prev) => ({ ...prev, firstName: val }))
                    }
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Last Name</Text>
                  <TextInput
                    style={styles.input}
                    value={shippingAddress.lastName}
                    placeholder="e.g. Mensah"
                    placeholderTextColor="#999"
                    onChangeText={(val) =>
                      setShippingAddress((prev) => ({ ...prev, lastName: val }))
                    }
                  />
                </View>
              </View>

              <Text style={styles.inputLabel}>Phone Number *</Text>
              <TextInput
                style={styles.input}
                keyboardType="phone-pad"
                value={shippingAddress.phone}
                placeholder="e.g. 024 123 4567"
                placeholderTextColor="#999"
                onChangeText={(val) =>
                  setShippingAddress((prev) => ({ ...prev, phone: val }))
                }
              />

              <Text style={styles.inputLabel}>Street Address *</Text>
              <TextInput
                style={styles.input}
                value={shippingAddress.line1}
                placeholder="e.g. 15 Senchi Street, Airport Residential"
                placeholderTextColor="#999"
                onChangeText={(val) =>
                  setShippingAddress((prev) => ({ ...prev, line1: val }))
                }
              />

              <Text style={styles.inputLabel}>Apartment / Suite / Landmark (Optional)</Text>
              <TextInput
                style={styles.input}
                value={shippingAddress.line2 || ""}
                placeholder="e.g. Near Koala Supermarket, Apt 4B"
                placeholderTextColor="#999"
                onChangeText={(val) =>
                  setShippingAddress((prev) => ({ ...prev, line2: val }))
                }
              />

              <Text style={styles.inputLabel}>City / Town *</Text>
              <TextInput
                style={styles.input}
                value={shippingAddress.city}
                placeholder="e.g. Accra"
                placeholderTextColor="#999"
                onChangeText={(val) =>
                  setShippingAddress((prev) => ({ ...prev, city: val }))
                }
              />

              <Text style={styles.inputLabel}>Region (Ghana)</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8, paddingVertical: 6 }}
              >
                {GHANA_REGIONS.map((reg) => {
                  const isSelected = shippingAddress.region === reg;
                  return (
                    <TouchableOpacity
                      key={reg}
                      onPress={() => setShippingAddress((prev) => ({ ...prev, region: reg }))}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 7,
                        borderRadius: 8,
                        backgroundColor: isSelected ? colors.primary : "#F3F1EC",
                        borderWidth: 1,
                        borderColor: isSelected ? colors.primary : "#E5E1D8",
                      }}
                      activeOpacity={0.8}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: isSelected ? "700" : "500",
                          color: isSelected ? "#FFFFFF" : colors.text,
                        }}
                      >
                        {reg}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </ScrollView>

            <TouchableOpacity
              style={styles.modalSaveBtn}
              onPress={() => setShowAddressModal(false)}
              activeOpacity={0.85}
            >
              <Text style={styles.modalSaveText}>Save Delivery Address</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Payment Selection Modal */}
      <Modal
        visible={showPaymentModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPaymentModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalContent, { paddingBottom: Math.max(insets.bottom, 24) }]}>
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
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={styles.paymentOptionLabel}>{pm.label}</Text>
                    {pm.badge && (
                      <View style={{ backgroundColor: "#F3E8EC", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                        <Text style={{ color: colors.primary, fontSize: 10, fontWeight: "700" }}>{pm.badge}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.paymentOptionSub}>{pm.subtitle}</Text>
                </View>
                {selectedPayment === pm.id && (
                  <Feather name="check" size={18} color={colors.primary} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* MoMo Authorization Prompt Modal */}
      <Modal
        visible={showMoMoPromptModal}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }
          setMomoPolling(false);
          setShowMoMoPromptModal(false);
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalContent, { maxHeight: "90%", paddingBottom: Math.max(insets.bottom, 24) }]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View style={styles.momoModalHeaderIcon}>
                  <Feather name="smartphone" size={16} color={colors.primary} />
                </View>
                <Text style={styles.modalTitle}>Authorize Payment</Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  if (pollingIntervalRef.current) {
                    clearInterval(pollingIntervalRef.current);
                    pollingIntervalRef.current = null;
                  }
                  setMomoPolling(false);
                  setShowMoMoPromptModal(false);
                }}
              >
                <Feather name="x" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
              {/* Callout Card */}
              <View style={styles.momoPromptCard}>
                <View style={[styles.momoPromptIconCircle, momoVerified && { backgroundColor: "#E6F4EA" }]}>
                  {momoVerified ? (
                    <Feather name="check" size={32} color="#137333" />
                  ) : momoPolling ? (
                    <ActivityIndicator size="large" color={colors.primary} />
                  ) : (
                    <Feather name="smartphone" size={32} color={colors.primary} />
                  )}
                </View>

                <Text style={styles.momoPromptEyebrow}>
                  {momoVerified ? "PAYMENT SUCCESSFUL" : "USSD PROMPT DISPATCHED"}
                </Text>
                <Text style={styles.momoPromptAmount}>
                  {momoPushData?.amountFormatted || formatCurrency(amountDueNow)}
                </Text>

                <View style={styles.momoPromptRecipientBox}>
                  <Text style={styles.momoPromptRecipientText}>
                    Sent to: <Text style={{ fontWeight: "800", color: colors.text }}>{momoPushData?.phone || momoPhone}</Text>
                    {"  "}·{"  "}
                    <Text style={{ fontWeight: "700", color: colors.primary }}>
                      {momoPushData?.providerLabel || "Mobile Money"}
                    </Text>
                  </Text>
                </View>
              </View>

              {/* Step by step Instructions */}
              <View style={styles.momoInstructionsCard}>
                <Text style={styles.momoInstructionsTitle}>WHAT TO DO ON YOUR PHONE:</Text>
                <View style={styles.instructionStepRow}>
                  <View style={styles.stepBadge}><Text style={styles.stepBadgeText}>1</Text></View>
                  <Text style={styles.instructionStepText}>
                    Check your phone screen for the payment authorization prompt.
                  </Text>
                </View>
                <View style={styles.instructionStepRow}>
                  <View style={styles.stepBadge}><Text style={styles.stepBadgeText}>2</Text></View>
                  <Text style={styles.instructionStepText}>
                    Enter your 4-digit MoMo PIN to authorize payment.
                  </Text>
                </View>
                <View style={styles.instructionStepRow}>
                  <View style={styles.stepBadge}><Text style={styles.stepBadgeText}>3</Text></View>
                  <Text style={styles.instructionStepText}>
                    Keep this screen open — your receipt and SMS will arrive automatically.
                  </Text>
                </View>
              </View>

              {/* Error Message if payment failed */}
              {momoErrorMessage ? (
                <View style={styles.momoErrorBox}>
                  <Feather name="alert-triangle" size={16} color="#B91C1C" />
                  <Text style={styles.momoErrorText}>{momoErrorMessage}</Text>
                </View>
              ) : null}

              {/* Status Polling Indicator */}
              {momoPolling && (
                <View style={styles.pollingNoticeRow}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={styles.pollingNoticeText}>
                    Waiting for your authorization on your handset...
                  </Text>
                </View>
              )}

              {/* Manual Check Status CTA */}
              <TouchableOpacity
                style={[styles.modalActionBtn, (verifyingManual || momoVerified) && { opacity: 0.7 }]}
                onPress={() => handleManualVerifyMoMo(false)}
                disabled={verifyingManual || momoVerified}
                activeOpacity={0.85}
              >
                {verifyingManual ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Feather name="refresh-cw" size={14} color="#FFFFFF" />
                    <Text style={styles.modalActionBtnText}>I'VE APPROVED (CHECK NOW)</Text>
                  </>
                )}
              </TouchableOpacity>

              {/* Telecel / Vodafone Cash Voucher OTP Section */}
              <View style={styles.voucherSection}>
                <Text style={styles.voucherSectionTitle}>Using Telecel or Vodafone Cash?</Text>
                <Text style={styles.voucherSectionSub}>
                  If your provider sent a voucher code (or dialed *110# to generate one), enter it below:
                </Text>
                <View style={styles.voucherInputRow}>
                  <TextInput
                    style={styles.voucherInput}
                    placeholder="Enter Voucher Code / OTP"
                    placeholderTextColor="#999"
                    keyboardType="number-pad"
                    value={otpInput}
                    onChangeText={setOtpInput}
                  />
                  <TouchableOpacity
                    style={[styles.voucherSubmitBtn, (!otpInput.trim() || submittingOtp) && { opacity: 0.5 }]}
                    onPress={handleSubmitMoMoOtp}
                    disabled={!otpInput.trim() || submittingOtp}
                  >
                    {submittingOtp ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.voucherSubmitBtnText}>SUBMIT</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>

              {/* Test Mode / Simulation CTA */}
              <TouchableOpacity
                style={styles.simulateApprovalBtn}
                onPress={() => handleManualVerifyMoMo(true)}
                disabled={verifyingManual || momoVerified}
                activeOpacity={0.8}
              >
                <Feather name="check-circle" size={13} color="#92400E" />
                <Text style={styles.simulateApprovalBtnText}>
                  SIMULATE APPROVAL (TEST / DEMO MODE)
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
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
  freeShippingNotice: {

    backgroundColor: "#FBF5F6",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#EAD5D9",
    marginBottom: 8,
  },
  freeShippingNoticeActive: {
    backgroundColor: "#EDF7ED",
    borderColor: "#C8E6C9",
  },
  freeShippingNoticeText: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.primary,
    flex: 1,
  },
  freeShippingNoticeTextActive: {
    color: "#2E7D32",
  },
  preorderDepositCard: {
    backgroundColor: colors.surfaceWarm,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#EAD5D9",
    marginBottom: 10,
  },
  preorderDepositHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 3,
  },
  preorderDepositTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.primary,
    letterSpacing: 0.3,
  },
  preorderDepositSubtitle: {
    fontSize: 10,
    color: colors.textSecondary,
    marginBottom: 10,
  },
  preorderDepositTabs: {
    flexDirection: "row",
    gap: 8,
  },
  depositTab: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: "center",
    backgroundColor: colors.surface,
  },
  depositTabActive: {
    borderColor: colors.primary,
    backgroundColor: "#FBF5F6",
  },
  depositTabText: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.textSecondary,
    marginBottom: 2,
  },
  depositTabTextActive: {
    color: colors.primary,
    fontWeight: "700",
  },
  depositTabAmount: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.text,
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
  deliveryTypeToggle: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
    marginBottom: 4,
  },
  deliveryTypeBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: colors.surfaceWarm,
    borderWidth: 1.5,
    borderColor: colors.borderLight,
  },
  deliveryTypeBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  deliveryTypeBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.text,
  },
  deliveryTypeBtnTextActive: {
    color: "#FFFFFF",
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
  modalSubtitleText: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
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
  testModeBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEF3C7",
    borderColor: "#F59E0B",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
  },
  testModeBannerTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: "#92400E",
    letterSpacing: 0.5,
  },
  testModeBannerSub: {
    fontSize: 10,
    color: "#B45309",
    marginTop: 2,
    lineHeight: 14,
  },
  momoCard: {
    backgroundColor: "#FDFBF7",
    borderColor: "#EAD5D9",
    borderWidth: 1.5,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  momoCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  momoCardTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.primary,
    letterSpacing: 1,
  },
  momoCardSubtitle: {
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 16,
    marginBottom: 14,
  },
  momoInputLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.textSecondary,
    marginBottom: 6,
    marginTop: 6,
    letterSpacing: 0.5,
  },
  networkSelectorRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  networkChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E1D8",
  },
  networkChipSelected: {
    borderColor: colors.primary,
    backgroundColor: "#FAF4F6",
    borderWidth: 1.5,
  },
  networkDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  networkChipText: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.text,
  },
  networkChipTextSelected: {
    fontWeight: "800",
    color: colors.primary,
  },
  momoPhoneInputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#DCD6C9",
    overflow: "hidden",
    marginBottom: 10,
  },
  ghanaFlagPrefix: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: "#F5F2EB",
    borderRightWidth: 1,
    borderRightColor: "#E5E1D8",
  },
  momoPhoneInput: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
  },
  momoEmailInputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#DCD6C9",
    overflow: "hidden",
    marginBottom: 10,
  },
  momoEmailInput: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontSize: 13,
    color: colors.text,
  },
  momoSecurityNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#F0EAE1",
  },
  momoSecurityNoticeText: {
    fontSize: 10,
    color: colors.textSecondary,
    flex: 1,
    lineHeight: 14,
  },
  momoModalHeaderIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#F7EFF1",
    alignItems: "center",
    justifyContent: "center",
  },
  momoPromptCard: {
    alignItems: "center",
    paddingVertical: 18,
    paddingHorizontal: 16,
    backgroundColor: "#FAF7F3",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#ECE6DC",
    marginBottom: 16,
  },
  momoPromptIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#F7EFF1",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  momoPromptEyebrow: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.primary,
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  momoPromptAmount: {
    fontSize: 24,
    fontWeight: "800",
    color: colors.text,
    fontFamily: "serif",
    marginBottom: 8,
  },
  momoPromptRecipientBox: {
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "#E5E1D8",
  },
  momoPromptRecipientText: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  momoInstructionsCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#EAE5DB",
    marginBottom: 14,
    gap: 10,
  },
  momoInstructionsTitle: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.textSecondary,
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  instructionStepRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  stepBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  stepBadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "800",
  },
  instructionStepText: {
    flex: 1,
    fontSize: 12,
    color: colors.text,
    lineHeight: 18,
  },
  momoErrorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FEE2E2",
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#FCA5A5",
  },
  momoErrorText: {
    flex: 1,
    fontSize: 11,
    color: "#B91C1C",
    fontWeight: "600",
  },
  pollingNoticeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 8,
    marginBottom: 8,
  },
  pollingNoticeText: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: "600",
  },
  modalActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    marginBottom: 14,
  },
  modalActionBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
  },
  voucherSection: {
    backgroundColor: "#F9F8F5",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#ECE8E1",
    marginBottom: 12,
  },
  voucherSectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 2,
  },
  voucherSectionSub: {
    fontSize: 10,
    color: colors.textSecondary,
    lineHeight: 14,
    marginBottom: 8,
  },
  voucherInputRow: {
    flexDirection: "row",
    gap: 8,
  },
  voucherInput: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#DCD6C9",
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 12,
    color: colors.text,
  },
  voucherSubmitBtn: {
    backgroundColor: colors.text,
    borderRadius: 8,
    paddingHorizontal: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  voucherSubmitBtnText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
  },
  simulateApprovalBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#FEF3C7",
    borderColor: "#F59E0B",
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    marginBottom: 10,
  },
  simulateApprovalBtnText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#92400E",
    letterSpacing: 0.5,
  },
});
