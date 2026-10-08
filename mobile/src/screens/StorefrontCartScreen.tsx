import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Modal,
  Alert,
  Linking,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { styles } from "./StorefrontCartScreen.styles";
import { toast } from "../lib/toast";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { track } from "../lib/analytics";
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

type PaymentMethod = "direct_debit" | "mobile_money" | "bank_card";

const PAYMENT_METHODS: readonly {
  id: PaymentMethod;
  label: string;
  subtitle: string;
  icon: "smartphone" | "credit-card";
  badge?: string;
}[] = [
  {
    id: "direct_debit",
    label: "Direct Debit",
    subtitle: "Receive an instant payment prompt on your phone",
    icon: "smartphone" as const,
    badge: "POPULAR IN GHANA",
  },
  {
    id: "mobile_money",
    label: "Mobile Money",
    subtitle: "Pay securely with MTN, Telecel or AT Money",
    icon: "smartphone" as const,
  },
  {
    id: "bank_card",
    label: "Bank Card",
    subtitle: "Pay securely with Visa or Mastercard",
    icon: "credit-card" as const,
  },
];

const NETWORKS: {
  id: "mtn" | "vod" | "atl";
  name: string;
  badgeColor: string;
  badgeTextColor: string;
}[] = [
  { id: "mtn", name: "MTN Mobile Money", badgeColor: "#FFCC00", badgeTextColor: "#000000" },
  { id: "vod", name: "Telecel (Vodafone)", badgeColor: "#E60000", badgeTextColor: "#FFFFFF" },
  { id: "atl", name: "AT Money (AirtelTigo)", badgeColor: "#003399", badgeTextColor: "#FFFFFF" },
];

function detectMoMoProvider(phone: string): "mtn" | "vod" | "atl" {
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
  if (["27", "57", "26", "56"].includes(prefix)) return "atl";
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
  const [showPickupContactModal, setShowPickupContactModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<PaymentMethod>(PAYMENT_METHODS[0].id);
  const [isTestMode, setIsTestMode] = useState(false);
  const [deliveryType, setDeliveryType] = useState<"delivery" | "pickup">("delivery");
  const [shippingRates, setShippingRates] = useState<ShippingRate[]>([]);
  const [selectedRateId, setSelectedRateId] = useState<string | null>(null);
  const [loadingRates, setLoadingRates] = useState(false);
  const [freeShippingThreshold, setFreeShippingThreshold] = useState<number | null>(null);
  const [availableRegions, setAvailableRegions] = useState<readonly string[]>(GHANA_REGIONS);
  const [preorderDepositOption, setPreorderDepositOption] = useState<"full" | "deposit_50">("full");

  // Customer contact states for instant MoMo and receipt delivery (no prefill, placeholders show)
  const [momoPhone, setMomoPhone] = useState(user?.phone || "");
  const [momoProvider, setMomoProvider] = useState<"mtn" | "vod" | "atl">("mtn");
  const [customerEmail, setCustomerEmail] = useState(user?.email || "");

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
  const [resendingMomo, setResendingMomo] = useState(false);
  const [momoResendAt, setMomoResendAt] = useState(0);
  const [momoNow, setMomoNow] = useState(0);
  useEffect(() => {
    if (!momoResendAt) return;
    const timer = setInterval(() => setMomoNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [momoResendAt]);
  const momoResendSeconds = Math.max(0, Math.ceil((momoResendAt - momoNow) / 1000));
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
        if (cfg.regions?.length) setAvailableRegions(cfg.regions);
      })
      .catch(() => {});
  }, []);

  // Ghanaian delivery address - initialized cleanly, synced with authenticated user if present
  const [shippingAddress, setShippingAddress] = useState<ShippingAddress>({
    firstName: user?.firstName || "",
    lastName: user?.lastName || "",
    phone: user?.phone || "",
    line1: "",
    line2: "",
    city: "",
    region: "Greater Accra",
    country: "Ghana",
  });

  // Sync user profile data into contact state when user session is active
  useEffect(() => {
    if (user) {
      setShippingAddress((prev) => ({
        ...prev,
        firstName: prev.firstName || user.firstName || "",
        lastName: prev.lastName || user.lastName || "",
        phone: prev.phone || user.phone || "",
      }));
      if (user.email && !customerEmail) {
        setCustomerEmail(user.email);
      }
      if (user.phone && !momoPhone) {
        setMomoPhone(user.phone);
      }
    }
  }, [customerEmail, momoPhone, user]);

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
    let inFlight = false;
    let done = false;
    const maxAttempts = 45; // ~2 minutes with a 2.5s interval

    const stopPolling = () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };

    const checkPayment = async () => {
      // One check at a time: a slow gateway must not stack up requests.
      if (inFlight || done) return;
      inFlight = true;
      attempts++;
      try {
        const verifyRes = await api.verifyOrderPayment(reference);
        if (verifyRes.ok && verifyRes.paid) {
          done = true;
          stopPolling();
          setMomoPolling(false);
          setMomoVerified(true);

          if (token && loggedUser) {
            await api.setSession(token, loggedUser);
            onAuthSuccess?.(loggedUser, token);
          }

          // Clear local and server cart immediately
          api.clearLocalCart().catch(() => {});
          onClearCart();

          setTimeout(() => {
            setShowMoMoPromptModal(false);
            onOrderSuccess(
              orderNum,
              phone,
              customerEmail.trim() || user?.email || undefined
            );
          }, 400);
        }
      } catch {
        // Continue polling silently
      } finally {
        inFlight = false;
        if (!done && attempts >= maxAttempts) {
          done = true;
          stopPolling();
          setMomoPolling(false);
          setMomoErrorMessage("Still waiting for approval. Check your Mobile Money approvals. If you have already approved or been debited, check payment status before resending.");
        }
      }
    };

    // Run first verification shortly after the handoff, then poll.
    setTimeout(checkPayment, 600);
    pollingIntervalRef.current = setInterval(checkPayment, 2500);
  };

  const handleManualVerifyMoMo = async () => {
    if (!momoPushData?.reference || !pendingOrderNumber) return;
    setVerifyingManual(true);
    setMomoErrorMessage(null);

    try {
      const verifyRes = await api.verifyOrderPayment(momoPushData.reference);
      if (verifyRes.ok && verifyRes.paid) {
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
        setMomoPolling(false);
        setMomoVerified(true);

        api.clearLocalCart().catch(() => {});
        onClearCart();

        setTimeout(() => {
          setShowMoMoPromptModal(false);
          onOrderSuccess(
            pendingOrderNumber,
            momoPushData.phone,
            customerEmail.trim() || user?.email || undefined
          );
        }, 400);
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

  const handleResendMoMo = async () => {
    if (!momoPushData?.reference || !pendingOrderNumber || resendingMomo || verifyingManual || submittingOtp || momoVerified || momoResendSeconds > 0) return;
    setResendingMomo(true);
    setMomoErrorMessage(null);
    try {
      const check = await api.verifyOrderPayment(momoPushData.reference);
      if (!check.ok) throw new Error("Could not confirm payment status. Check payment status before resending.");
      if (check.paid) {
        await handleManualVerifyMoMo();
        return;
      }
      const sentAt = Date.now();
      setMomoNow(sentAt);
      setMomoResendAt(sentAt + 30000);
      const res = await api.pushMomoPin(pendingOrderNumber, {
        phone: momoPushData.phone,
        provider: momoPushData.provider,
        chargeScope: is50PercentDeposit ? "DEPOSIT_50" : "FULL",
      });
      if (!res.ok || !res.reference) throw new Error(res.error || "Could not resend the prompt. Please try again.");
      setMomoPushData({ ...momoPushData, ...res, reference: res.reference, status: res.status || "pending" });
      setOtpInput("");
      startMoMoPolling(res.reference, pendingOrderNumber, res.phone || momoPushData.phone);
    } catch (err) {
      setMomoErrorMessage(err instanceof Error ? err.message : "Could not resend the prompt. Please try again.");
    } finally {
      setResendingMomo(false);
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

        api.clearLocalCart().catch(() => {});
        onClearCart();

        setTimeout(() => {
          setShowMoMoPromptModal(false);
          onOrderSuccess(
            pendingOrderNumber || "ORDER",
            momoPushData.phone,
            customerEmail.trim() || user?.email || undefined
          );
        }, 400);
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
        toast("Your Bag is Empty", "Add some handcrafted pieces before checking out.");
      }
      return;
    }

    const trimmedFirst = (shippingAddress.firstName || user?.firstName || "").trim();
    const trimmedPhone = (shippingAddress.phone || user?.phone || momoPhone || "").trim();
    const trimmedLine1 = (shippingAddress.line1 || "").trim();
    const trimmedCity = (shippingAddress.city || "").trim();

    if (deliveryType === "pickup") {
      if (!trimmedFirst) {
        if (onNotify) {
          onNotify({
            title: "Name Required",
            message: "Please enter your name for showroom collection and receipt.",
            type: "warning",
            icon: "user",
          });
        } else {
          toast("Name Required", "Please enter your name for showroom collection and receipt.");
        }
        setShowPickupContactModal(true);
        return;
      }

      if (!trimmedPhone || trimmedPhone.replace(/[^0-9]/g, "").length < 9) {
        if (onNotify) {
          onNotify({
            title: "Phone Number Required",
            message: "Please enter a valid phone number for SMS pickup notifications.",
            type: "warning",
            icon: "phone",
          });
        } else {
          toast("Phone Required", "Please enter a valid phone number for SMS pickup notifications.");
        }
        setShowPickupContactModal(true);
        return;
      }
    } else {
      if (!trimmedFirst) {
        if (onNotify) {
          onNotify({
            title: "First Name Required",
            message: "Please enter your first name for the delivery receipt.",
            type: "warning",
            icon: "user",
          });
        } else {
          toast("First Name Required", "Please enter your first name for the delivery receipt.");
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
          toast("Phone Required", "Please enter a valid phone number for your delivery and SMS receipt.");
        }
        setShowAddressModal(true);
        return;
      }

      if (!trimmedLine1 || !trimmedCity) {
        if (onNotify) {
          onNotify({
            title: "Address Required",
            message: "Please enter your delivery street address and city.",
            type: "warning",
            icon: "map-pin",
          });
        } else {
          toast("Address Required", "Please enter your delivery street address and city.");
        }
        setShowAddressModal(true);
        return;
      }
    }

    if (selectedPayment === "direct_debit") {
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
          toast("Phone Required", "Please enter a valid Ghana Mobile Money phone number.");
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
        deliveryType,
        isPickup,
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
        discountCode: null,
        preorderDepositOption: hasPreorderItems ? preorderDepositOption : null,
        paymentMethod: selectedPayment,
        momoPhone: selectedPayment === "direct_debit" ? (momoPhone || safePhone) : undefined,
        momoProvider: selectedPayment === "direct_debit" ? momoProvider : undefined,
        idempotencyKey: `mob-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      };

      track("checkout_start", { items: cart.length });
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
        if (res.momoPush) {
          const sentAt = Date.now();
          setMomoNow(sentAt);
          setMomoResendAt(sentAt + 30000);
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

        if (res.isTestOrder) {
          if (onNotify) {
            onNotify({
              title: "🧪 Test Order Placed!",
              message: `Order #${res.order.orderNumber} placed in test mode. No real money charged.`,
              type: "warning",
              icon: "check-circle",
            });
          }
        }

        if (res.paymentUrl) {
          if (onNotify) {
            onNotify({
              title: "Complete Your Payment",
              message: `Opening secure checkout for Order #${res.order.orderNumber}...`,
              type: "info",
              icon: "credit-card",
            });
          }
          setPendingOrderNumber(res.order.orderNumber);
          api.clearLocalCart().catch(() => {});
          onClearCart();
          startMoMoPolling(
            res.order.reference,
            res.order.orderNumber,
            shippingAddress.phone,
            res.token,
            res.user,
          );
          Linking.openURL(res.paymentUrl).catch(() => {
            Alert.alert(
              "Payment Initialized",
              `Order #${res.order.orderNumber} is awaiting payment. Open this secure link to continue: ${res.paymentUrl}`,
            );
          });
        } else {
          throw new Error("Payment could not be started. No charge was completed.");
        }

        // Confirmation is shown only after startMoMoPolling verifies payment.
      } else {
        throw new Error("Unable to complete order.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to place order.";
      const unavailableIds: string[] = (err as any)?.unavailableVariantIds || [];

      if (
        unavailableIds.length > 0 ||
        msg.toLowerCase().includes("no longer available") ||
        msg.toLowerCase().includes("items are no longer available")
      ) {
        Alert.alert(
          "Items Unavailable in Bag",
          "One or more products in your bag are no longer available in the store inventory. Would you like to remove only the unavailable items and keep the rest?",
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

      if (
        msg.toLowerCase().includes("invalid key") ||
        msg.toLowerCase().includes("payment gateway") ||
        msg.toLowerCase().includes("payment provider") ||
        msg.toLowerCase().includes("online payment is temporarily unavailable")
      ) {
        Alert.alert(
          "Payment Gateway Unavailable",
          "Online payment is temporarily unavailable. You can retry using Direct Debit, Mobile Money, or Bank Card.",
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Use Direct Debit",
              onPress: () => {
                setSelectedPayment("direct_debit");
                if (onNotify) {
                  onNotify({
                    title: "Payment Method Updated",
                    message: "Switched to Direct Debit. Tap the payment button to retry.",
                    type: "info",
                    icon: "check-circle",
                  });
                }
              },
            },
            {
              text: "Use Bank Card",
              onPress: () => {
                setSelectedPayment("bank_card");
                if (onNotify) {
                  onNotify({
                    title: "Payment Method Updated",
                    message: "Switched to Bank Card. Tap the payment button to retry.",
                    type: "info",
                    icon: "check-circle",
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
        toast("Order Error", msg);
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
          <TouchableOpacity style={styles.iconBtn} onPress={onBack} accessibilityRole="button" accessibilityLabel="Back">
            <Feather name="arrow-left" size={22} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.brandContainer}>
            <Text style={styles.brandTitle}>NOBLE ENCLAVE</Text>
            <Text style={styles.brandSubtitle}>HOME TEXTILES • LIVING ESSENTIALS</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconCircle}>
            <Feather name="shopping-bag" size={44} color={colors.primary} />
          </View>
          <Text style={styles.emptyTitle}>Your Bag is Empty</Text>
          <Text style={styles.emptySub}>
            Explore our curated catalog of home textiles and living essentials.
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
        <TouchableOpacity style={styles.iconBtn} onPress={onBack} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Back">
          <Feather name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>

        <View style={styles.brandContainer}>
          <Text style={styles.brandTitle}>NOBLE ENCLAVE</Text>
          <Text style={styles.brandSubtitle}>HOME TEXTILES • LIVING ESSENTIALS</Text>
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
                Sandbox payments require verification. No real money will be charged.
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
                    contentFit="cover" cachePolicy="memory-disk" transition={150}
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
                    Noble Enclave Showroom
                  </Text>
                  <View style={{ backgroundColor: "#E6F4EA", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                    <Text style={{ color: "#137333", fontSize: 11, fontWeight: "700" }}>FREE</Text>
                  </View>
                </View>
                <Text style={styles.addressDetail}>
                  Spintex Road / Airport Residential, Accra
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

        {/* If Store Pickup: Show Pickup Recipient Contact Card */}
        {deliveryType === "pickup" && (
          <View style={styles.sectionContainer}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <Text style={styles.sectionHeaderLabel}>PICKUP RECIPIENT CONTACT</Text>
              {(shippingAddress.firstName || user?.firstName) ? (
                <TouchableOpacity onPress={() => setShowPickupContactModal(true)}>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: colors.primary }}>EDIT</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            {(shippingAddress.firstName || user?.firstName) && (shippingAddress.phone || user?.phone || momoPhone) ? (
              <TouchableOpacity
                style={styles.cardSelectable}
                onPress={() => setShowPickupContactModal(true)}
                activeOpacity={0.8}
              >
                <View style={styles.cardContentLeft}>
                  <Text style={styles.addressName}>
                    {[shippingAddress.firstName || user?.firstName, shippingAddress.lastName || user?.lastName].filter(Boolean).join(" ")}
                  </Text>
                  <Text style={styles.addressDetail}>
                    📱 {shippingAddress.phone || user?.phone || momoPhone}
                    {(customerEmail || user?.email) ? ` · ✉️ ${customerEmail || user?.email}` : ""}
                  </Text>
                  <Text style={[styles.paymentMethodSub, { color: colors.primary, marginTop: 2 }]}>
                    Ready for collection SMS & receipt will be sent here
                  </Text>
                </View>
                <Feather name="chevron-right" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.cardSelectable, { borderStyle: "dashed", borderColor: colors.primary, backgroundColor: "#FAF7F5" }]}
                onPress={() => setShowPickupContactModal(true)}
                activeOpacity={0.8}
              >
                <View style={styles.cardContentLeft}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Feather name="user-plus" size={18} color={colors.primary} />
                    <Text style={[styles.paymentMethodText, { color: colors.primary }]}>Enter Pickup Recipient</Text>
                  </View>
                  <Text style={styles.paymentMethodSub}>Tap to enter who will collect order and receive SMS</Text>
                </View>
                <Feather name="chevron-right" size={20} color={colors.primary} />
              </TouchableOpacity>
            )}
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
        {selectedPayment === "direct_debit" && (
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
              {selectedPayment === "direct_debit"
                ? "SEND PAYMENT PROMPT · "
                : "CONTINUE TO PAYMENT · "}
              {formatCurrency(amountDueNow)}
            </Text>
          )}
        </TouchableOpacity>


        {/* Secure Checkout Sub-label */}
        <View style={styles.secureFooter}>
          <Feather name="shield" size={13} color={colors.primary} />
          <Text style={styles.secureText}>
            SECURE CHECKOUT · 256-BIT ENCRYPTION
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
                {availableRegions.map((reg) => {
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

      {/* Pickup Contact Modal */}
      <Modal
        visible={showPickupContactModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPickupContactModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalContent, { paddingBottom: Math.max(insets.bottom, 24) }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Pickup Recipient Details</Text>
                <Text style={styles.modalSubtitleText}>
                  Who will be collecting this order at our showroom?
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowPickupContactModal(false)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Feather name="x" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              style={{ maxHeight: 380 }}
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

              <Text style={styles.inputLabel}>Phone Number (For SMS Collection Notice) *</Text>
              <TextInput
                style={styles.input}
                keyboardType="phone-pad"
                value={shippingAddress.phone}
                placeholder="e.g. 024 123 4567"
                placeholderTextColor="#999"
                onChangeText={(val) => {
                  setShippingAddress((prev) => ({ ...prev, phone: val }));
                  if (!momoPhone) setMomoPhone(val);
                }}
              />

              <Text style={styles.inputLabel}>Email (For PDF Receipt & Invoice)</Text>
              <TextInput
                style={styles.input}
                keyboardType="email-address"
                autoCapitalize="none"
                value={customerEmail}
                placeholder="e.g. kwame@example.com"
                placeholderTextColor="#999"
                onChangeText={setCustomerEmail}
              />
            </ScrollView>

            <TouchableOpacity
              style={styles.modalSaveBtn}
              onPress={() => setShowPickupContactModal(false)}
              activeOpacity={0.85}
            >
              <Text style={styles.modalSaveText}>Confirm Pickup Recipient</Text>
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
                  {momoVerified ? "PAYMENT SUCCESSFUL" : "AWAITING PAYMENT APPROVAL"}
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
                    Check your phone screen for the payment authorization prompt. No pop-up? {momoPushData?.provider === "mtn" ? "Dial *170#, select My Wallet, then My Approvals." : "Check pending approvals in your network’s Mobile Money menu."}
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
              {!momoVerified && (
                <>
                  <Text style={styles.instructionStepText}>
                    Approve only one request. If you have already approved or been debited, check payment status instead of resending.
                  </Text>
                  <TouchableOpacity
                    style={[styles.modalActionBtn, (resendingMomo || verifyingManual || submittingOtp || momoResendSeconds > 0) && { opacity: 0.5 }]}
                    onPress={handleResendMoMo}
                    disabled={resendingMomo || verifyingManual || submittingOtp || momoResendSeconds > 0}
                    accessibilityRole="button"
                  >
                    <Text style={styles.modalActionBtnText}>{resendingMomo ? "Checking and resending…" : momoResendSeconds > 0 ? `Resend in ${momoResendSeconds}s` : "Resend MoMo Prompt"}</Text>
                  </TouchableOpacity>
                </>
              )}
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
                  onPress={handleManualVerifyMoMo}
                disabled={verifyingManual || momoVerified || resendingMomo}
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

            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
