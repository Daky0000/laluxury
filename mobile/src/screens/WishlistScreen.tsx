import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, RefreshControl, ActivityIndicator } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { api } from "../services/api";
import { useApp } from "../state/AppContext";
import { colors } from "../theme/colors";
import { formatCurrency } from "../utils/format";
import { SmartImage } from "../components/SmartImage";
import type { WishlistItem } from "../types";

type Props = {
  onBack: () => void;
  onSelectProduct: (productId: string) => void;
};

/** Saved pieces - the same list as the heart on the website. */
export function WishlistScreen({ onBack, onSelectProduct }: Props) {
  const { user, toggleWishlist } = useApp();
  const query = useQuery({
    queryKey: ["wishlist", user?.id],
    queryFn: () => api.getWishlist(),
    enabled: Boolean(user),
  });

  const remove = async (item: WishlistItem) => {
    await toggleWishlist(item.productId);
    query.refetch();
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} accessibilityRole="button" accessibilityLabel="Back" hitSlop={12}>
          <Feather name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title} accessibilityRole="header">Saved Pieces</Text>
        <View style={{ width: 22 }} />
      </View>

      {!user ? (
        <Empty icon="heart" text="Sign in to see the pieces you've saved." />
      ) : query.isLoading ? (
        <ActivityIndicator style={{ marginTop: 48 }} color={colors.primary} />
      ) : query.isError ? (
        <Empty icon="wifi-off" text="Couldn't load your saved pieces. Pull to try again." />
      ) : (
        <FlashList
          data={query.data?.items ?? []}
          keyExtractor={(item) => item.productId}
          contentContainerStyle={{ padding: 16 }}
          refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={query.refetch} tintColor={colors.primary} />}
          ListEmptyComponent={<Empty icon="heart" text="Nothing saved yet. Tap the heart on any piece to keep it here." />}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.row}
              onPress={() => onSelectProduct(item.slug || item.productId)}
              accessibilityRole="button"
              accessibilityLabel={`${item.title}${item.price !== null ? `, ${formatCurrency(item.price)}` : ""}`}
            >
              <SmartImage uri={item.imageUrl} alt={item.title} style={styles.image} />
              <View style={styles.info}>
                {item.brand ? <Text style={styles.brand}>{item.brand.toUpperCase()}</Text> : null}
                <Text style={styles.name} numberOfLines={2}>{item.title}</Text>
                {item.price !== null ? <Text style={styles.price}>{formatCurrency(item.price)}</Text> : null}
                {item.isPreorder ? <Text style={styles.badge}>PRE-ORDER</Text> : null}
              </View>
              <TouchableOpacity
                onPress={() => remove(item)}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${item.title} from saved pieces`}
              >
                <Feather name="x" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

function Empty({ icon, text }: { icon: keyof typeof Feather.glyphMap; text: string }) {
  return (
    <View style={styles.empty}>
      <Feather name={icon} size={36} color={colors.textMuted} />
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: { fontSize: 17, fontWeight: "700", color: colors.text, letterSpacing: 0.5 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  image: { width: 76, height: 92, borderRadius: 6, backgroundColor: colors.surfaceCard },
  info: { flex: 1, gap: 4 },
  brand: { fontSize: 10, color: colors.textMuted, letterSpacing: 1.2, fontWeight: "700" },
  name: { fontSize: 15, color: colors.text, fontWeight: "600" },
  price: { fontSize: 14, color: colors.primary, fontWeight: "700" },
  badge: { fontSize: 10, color: colors.goldDark, fontWeight: "800", letterSpacing: 1 },
  empty: { alignItems: "center", paddingTop: 80, paddingHorizontal: 40, gap: 14 },
  emptyText: { textAlign: "center", color: colors.textSecondary, fontSize: 14, lineHeight: 21 },
});
