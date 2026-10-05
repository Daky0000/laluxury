import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  Modal,
  Platform,
  RefreshControl,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { colors } from "../theme/colors";
import { api } from "../services/api";
import { ShippingZoneDetail } from "../types";
import { formatCurrency } from "../utils/format";
import { PopNotificationData } from "../components/PopNotification";

type Props = {
  onBack: () => void;
  onNotify?: (data: PopNotificationData) => void;
};

export function DeliverySettingsScreen({ onBack, onNotify }: Props) {
  const [zones, setZones] = useState<ShippingZoneDetail[]>([]);
  const [availableRegions, setAvailableRegions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Edit / Add Zone Modal
  const [showZoneModal, setShowZoneModal] = useState(false);
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null);
  const [zoneName, setZoneName] = useState("");
  const [selectedRegions, setSelectedRegions] = useState<string[]>([]);
  const [zoneActive, setZoneActive] = useState(true);
  const [savingZone, setSavingZone] = useState(false);

  // Edit / Add Rate Modal
  const [showRateModal, setShowRateModal] = useState(false);
  const [editingRateId, setEditingRateId] = useState<string | null>(null);
  const [rateZoneId, setRateZoneId] = useState<string>("");
  const [rateName, setRateName] = useState("");
  const [ratePrice, setRatePrice] = useState("");
  const [freeAbove, setFreeAbove] = useState("");
  const [daysMin, setDaysMin] = useState("1");
  const [daysMax, setDaysMax] = useState("3");
  const [rateActive, setRateActive] = useState(true);
  const [savingRate, setSavingRate] = useState(false);

  const fetchZones = useCallback(async () => {
    try {
      const res = await api.getShippingZones();
      if (res && res.zones) {
        setZones(res.zones);
        setAvailableRegions([...(res.availableRegions || [])]);
      }
    } catch {
      // Fallback
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchZones();
  }, [fetchZones]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchZones();
  };

  // Open Zone Form
  const handleOpenZoneModal = (zone?: ShippingZoneDetail) => {
    if (zone) {
      setEditingZoneId(zone.id);
      setZoneName(zone.name);
      setSelectedRegions([...zone.regions]);
      setZoneActive(zone.isActive);
    } else {
      setEditingZoneId(null);
      setZoneName("");
      setSelectedRegions([]);
      setZoneActive(true);
    }
    setShowZoneModal(true);
  };

  const handleToggleRegion = (reg: string) => {
    if (selectedRegions.includes(reg)) {
      setSelectedRegions(selectedRegions.filter((r) => r !== reg));
    } else {
      setSelectedRegions([...selectedRegions, reg]);
    }
  };

  const handleSaveZone = async () => {
    if (!zoneName.trim()) {
      onNotify?.({ type: "error", title: "Missing Name", message: "Please enter a zone name." });
      return;
    }
    setSavingZone(true);
    try {
      const res = await api.saveShippingZone({
        id: editingZoneId || undefined,
        name: zoneName.trim(),
        regions: selectedRegions,
        isActive: zoneActive,
      });

      if (res.ok) {
        onNotify?.({ type: "success", title: "Saved", message: res.message });
        setShowZoneModal(false);
        fetchZones();
      } else {
        onNotify?.({ type: "error", title: "Error", message: res.message || "Failed to save zone." });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error saving zone.";
      onNotify?.({ type: "error", title: "Error", message: msg });
    } finally {
      setSavingZone(false);
    }
  };

  // Open Rate Form
  const handleOpenRateModal = (zoneId: string, rate?: ShippingZoneDetail["rates"][0]) => {
    setRateZoneId(zoneId);
    if (rate) {
      setEditingRateId(rate.id);
      setRateName(rate.name);
      setRatePrice(String(rate.price));
      setFreeAbove(rate.freeAboveSubtotal != null ? String(rate.freeAboveSubtotal) : "");
      setDaysMin(rate.estimatedDaysMin != null ? String(rate.estimatedDaysMin) : "1");
      setDaysMax(rate.estimatedDaysMax != null ? String(rate.estimatedDaysMax) : "3");
      setRateActive(rate.isActive);
    } else {
      setEditingRateId(null);
      setRateName("Standard Delivery");
      setRatePrice("50");
      setFreeAbove("");
      setDaysMin("1");
      setDaysMax("2");
      setRateActive(true);
    }
    setShowRateModal(true);
  };

  const handleSaveRate = async () => {
    if (!rateName.trim()) {
      onNotify?.({ type: "error", title: "Missing Name", message: "Please enter a rate name." });
      return;
    }
    const price = parseFloat(ratePrice);
    if (isNaN(price) || price < 0) {
      onNotify?.({ type: "error", title: "Invalid Price", message: "Please enter a valid price." });
      return;
    }

    setSavingRate(true);
    try {
      const res = await api.saveShippingRate({
        id: editingRateId || undefined,
        zoneId: rateZoneId,
        name: rateName.trim(),
        price,
        freeAboveSubtotal: freeAbove.trim() ? parseFloat(freeAbove) : null,
        estimatedDaysMin: daysMin.trim() ? parseInt(daysMin, 10) : null,
        estimatedDaysMax: daysMax.trim() ? parseInt(daysMax, 10) : null,
        isActive: rateActive,
      });

      if (res.ok) {
        onNotify?.({ type: "success", title: "Saved", message: res.message });
        setShowRateModal(false);
        fetchZones();
      } else {
        onNotify?.({ type: "error", title: "Error", message: res.message || "Failed to save rate." });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error saving rate.";
      onNotify?.({ type: "error", title: "Error", message: msg });
    } finally {
      setSavingRate(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn} activeOpacity={0.7}>
          <Feather name="arrow-left" size={20} color={colors.darkText} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={styles.headerSubtitle}>DELIVERY & SHIPPING</Text>
          <Text style={styles.headerTitle}>Zones & Rates</Text>
        </View>
        <TouchableOpacity
          style={styles.addZoneBtn}
          onPress={() => handleOpenZoneModal()}
          activeOpacity={0.8}
        >
          <Feather name="plus" size={15} color="#FFFFFF" style={{ marginRight: 4 }} />
          <Text style={styles.addZoneBtnText}>Add Zone</Text>
        </TouchableOpacity>
      </View>

      {/* Main Content */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.gold} />
          <Text style={styles.loadingText}>Loading shipping configurations...</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.gold} />
          }
        >
          <Text style={styles.explanationText}>
            Configure delivery fees and destination zones. These rates automatically power both
            the website and mobile app checkout calculations.
          </Text>

          {zones.map((zone) => (
            <View key={zone.id} style={styles.zoneCard}>
              {/* Zone Header */}
              <View style={styles.zoneHeader}>
                <View style={{ flex: 1 }}>
                  <View style={styles.zoneTitleRow}>
                    <Text style={styles.zoneName}>{zone.name}</Text>
                    <View
                      style={[
                        styles.activeBadge,
                        zone.isActive ? styles.activeBadgeOn : styles.activeBadgeOff,
                      ]}
                    >
                      <Text
                        style={[
                          styles.activeBadgeText,
                          zone.isActive ? styles.activeBadgeTextOn : styles.activeBadgeTextOff,
                        ]}
                      >
                        {zone.isActive ? "ACTIVE" : "DISABLED"}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.zoneRegions}>
                    {zone.regions.length > 0
                      ? zone.regions.join(" · ")
                      : "No regions assigned"}
                  </Text>
                </View>

                <TouchableOpacity
                  style={styles.editZoneBtn}
                  onPress={() => handleOpenZoneModal(zone)}
                  activeOpacity={0.7}
                >
                  <Feather name="edit-2" size={13} color={colors.gold} />
                  <Text style={styles.editZoneBtnText}>Edit Zone</Text>
                </TouchableOpacity>
              </View>

              {/* Rates List */}
              <View style={styles.ratesSection}>
                <View style={styles.ratesHeader}>
                  <Text style={styles.ratesSectionTitle}>
                    DELIVERY RATES ({zone.rates.length})
                  </Text>
                  <TouchableOpacity
                    style={styles.addRateBtn}
                    onPress={() => handleOpenRateModal(zone.id)}
                    activeOpacity={0.8}
                  >
                    <Feather name="plus-circle" size={13} color={colors.gold} />
                    <Text style={styles.addRateBtnText}>Add Rate</Text>
                  </TouchableOpacity>
                </View>

                {zone.rates.length === 0 ? (
                  <Text style={styles.noRatesText}>
                    No delivery rates configured for this zone.
                  </Text>
                ) : (
                  zone.rates.map((rate) => (
                    <TouchableOpacity
                      key={rate.id}
                      style={styles.rateRow}
                      onPress={() => handleOpenRateModal(zone.id, rate)}
                      activeOpacity={0.75}
                    >
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <Text style={styles.rateName}>{rate.name}</Text>
                          {!rate.isActive && (
                            <Text style={styles.rateInactiveTag}>Inactive</Text>
                          )}
                        </View>
                        <Text style={styles.rateDays}>
                          Est: {rate.estimatedDaysMin ?? 1} - {rate.estimatedDaysMax ?? 3} business days
                          {rate.freeAboveSubtotal != null && (
                            <Text style={{ color: "#10B981" }}>
                              {" "}· Free over {formatCurrency(rate.freeAboveSubtotal)}
                            </Text>
                          )}
                        </Text>
                      </View>

                      <View style={styles.ratePriceCol}>
                        <Text style={styles.ratePrice}>
                          {formatCurrency(rate.price)}
                        </Text>
                        <Feather name="chevron-right" size={14} color={colors.darkTextMuted} />
                      </View>
                    </TouchableOpacity>
                  ))
                )}
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      {/* ZONE MODAL */}
      <Modal visible={showZoneModal} transparent animationType="slide" onRequestClose={() => setShowZoneModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingZoneId ? "Edit Shipping Zone" : "Create Shipping Zone"}
              </Text>
              <TouchableOpacity onPress={() => setShowZoneModal(false)} style={styles.closeBtn}>
                <Feather name="x" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
              <Text style={styles.inputLabel}>ZONE NAME *</Text>
              <TextInput
                style={styles.input}
                value={zoneName}
                onChangeText={setZoneName}
                placeholder="e.g. Greater Accra Express"
                placeholderTextColor="#999"
              />

              <Text style={[styles.inputLabel, { marginTop: 12 }]}>ASSIGNED GHANA REGIONS</Text>
              <View style={styles.regionsContainer}>
                {availableRegions.map((reg) => {
                  const selected = selectedRegions.includes(reg);
                  return (
                    <TouchableOpacity
                      key={reg}
                      style={[styles.regionChip, selected && styles.regionChipSelected]}
                      onPress={() => handleToggleRegion(reg)}
                    >
                      <Feather
                        name={selected ? "check" : "plus"}
                        size={12}
                        color={selected ? "#FFFFFF" : colors.textSecondary}
                        style={{ marginRight: 4 }}
                      />
                      <Text style={[styles.regionChipText, selected && styles.regionChipTextSelected]}>
                        {reg}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TouchableOpacity
                style={styles.toggleRow}
                onPress={() => setZoneActive(!zoneActive)}
                activeOpacity={0.8}
              >
                <Feather
                  name={zoneActive ? "check-square" : "square"}
                  size={18}
                  color={zoneActive ? colors.primary : colors.textSecondary}
                />
                <Text style={styles.toggleLabel}>Active for Customers</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.submitBtn, savingZone && { opacity: 0.6 }]}
                onPress={handleSaveZone}
                disabled={savingZone}
              >
                {savingZone ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.submitBtnText}>SAVE SHIPPING ZONE</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* RATE MODAL */}
      <Modal visible={showRateModal} transparent animationType="slide" onRequestClose={() => setShowRateModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingRateId ? "Edit Delivery Fee" : "Add Delivery Fee"}
              </Text>
              <TouchableOpacity onPress={() => setShowRateModal(false)} style={styles.closeBtn}>
                <Feather name="x" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
              <Text style={styles.inputLabel}>RATE NAME *</Text>
              <TextInput
                style={styles.input}
                value={rateName}
                onChangeText={setRateName}
                placeholder="e.g. Standard Delivery"
                placeholderTextColor="#999"
              />

              <Text style={styles.inputLabel}>DELIVERY FEE (GHS) *</Text>
              <TextInput
                style={styles.input}
                value={ratePrice}
                onChangeText={setRatePrice}
                placeholder="e.g. 50"
                keyboardType="numeric"
                placeholderTextColor="#999"
              />

              <Text style={styles.inputLabel}>FREE SHIPPING THRESHOLD (OPTIONAL)</Text>
              <TextInput
                style={styles.input}
                value={freeAbove}
                onChangeText={setFreeAbove}
                placeholder="e.g. 1000 (Free for orders over GH₵1,000)"
                keyboardType="numeric"
                placeholderTextColor="#999"
              />

              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>EST. DAYS MIN</Text>
                  <TextInput
                    style={styles.input}
                    value={daysMin}
                    onChangeText={setDaysMin}
                    keyboardType="number-pad"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>EST. DAYS MAX</Text>
                  <TextInput
                    style={styles.input}
                    value={daysMax}
                    onChangeText={setDaysMax}
                    keyboardType="number-pad"
                  />
                </View>
              </View>

              <TouchableOpacity
                style={styles.toggleRow}
                onPress={() => setRateActive(!rateActive)}
                activeOpacity={0.8}
              >
                <Feather
                  name={rateActive ? "check-square" : "square"}
                  size={18}
                  color={rateActive ? colors.primary : colors.textSecondary}
                />
                <Text style={styles.toggleLabel}>Active Rate</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.submitBtn, savingRate && { opacity: 0.6 }]}
                onPress={handleSaveRate}
                disabled={savingRate}
              >
                {savingRate ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.submitBtnText}>SAVE DELIVERY RATE</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.darkBg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "ios" ? 14 : 10,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.darkBorder,
  },
  backBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: colors.darkSurface,
    borderWidth: 1,
    borderColor: colors.darkBorder,
  },
  headerSubtitle: {
    fontSize: 9,
    fontWeight: "800",
    color: colors.gold,
    letterSpacing: 1.2,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.darkText,
    fontFamily: "serif",
  },
  addZoneBtn: {
    backgroundColor: colors.primary,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addZoneBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 90,
  },
  explanationText: {
    fontSize: 12,
    color: colors.darkTextMuted,
    lineHeight: 17,
    marginBottom: 16,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    color: colors.darkTextMuted,
    fontSize: 13,
    marginTop: 10,
  },
  zoneCard: {
    backgroundColor: colors.darkSurface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.darkBorder,
    padding: 16,
    marginBottom: 16,
  },
  zoneHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.08)",
    paddingBottom: 12,
    marginBottom: 12,
  },
  zoneTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  zoneName: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.darkText,
  },
  activeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  activeBadgeOn: {
    backgroundColor: "rgba(16, 185, 129, 0.2)",
  },
  activeBadgeOff: {
    backgroundColor: "rgba(239, 68, 68, 0.2)",
  },
  activeBadgeText: {
    fontSize: 9,
    fontWeight: "800",
  },
  activeBadgeTextOn: {
    color: "#4ADE80",
  },
  activeBadgeTextOff: {
    color: "#F87171",
  },
  zoneRegions: {
    fontSize: 11,
    color: colors.darkTextMuted,
    marginTop: 4,
  },
  editZoneBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: "rgba(202, 160, 86, 0.12)",
    borderWidth: 1,
    borderColor: colors.gold,
  },
  editZoneBtnText: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.gold,
  },
  ratesSection: {},
  ratesHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  ratesSectionTitle: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.darkTextMuted,
    letterSpacing: 0.8,
  },
  addRateBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  addRateBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.gold,
  },
  noRatesText: {
    fontSize: 12,
    color: colors.darkTextMuted,
    fontStyle: "italic",
    paddingVertical: 6,
  },
  rateRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.05)",
  },
  rateName: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.darkText,
  },
  rateInactiveTag: {
    fontSize: 9,
    color: "#F87171",
    fontWeight: "700",
  },
  rateDays: {
    fontSize: 11,
    color: colors.darkTextMuted,
    marginTop: 2,
  },
  ratePriceCol: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  ratePrice: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.gold,
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
    maxHeight: "88%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#EFECE6",
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: colors.text,
  },
  closeBtn: {
    padding: 6,
    backgroundColor: "#F3F1EC",
    borderRadius: 20,
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.textSecondary,
    letterSpacing: 0.8,
    marginBottom: 4,
    marginTop: 8,
  },
  input: {
    backgroundColor: "#F8F7F4",
    borderWidth: 1,
    borderColor: "#E5E1D8",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: colors.text,
  },
  regionsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginVertical: 6,
  },
  regionChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F3F1EC",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#E5E1D8",
  },
  regionChipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  regionChipText: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.text,
  },
  regionChipTextSelected: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 14,
    marginBottom: 10,
  },
  toggleLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
  },
  submitBtn: {
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 10,
    marginTop: 12,
  },
  submitBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
});
