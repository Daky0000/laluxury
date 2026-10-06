import React, { useState } from "react";
import { View, Text, TouchableOpacity, TextInput, StyleSheet, Keyboard } from "react-native";
import { Feather } from "@expo/vector-icons";
import { colors } from "../theme/colors";

/**
 * Numbered pagination with gaps — ‹ 1 … 4 5 6 … 20 › — plus a box to type a
 * page number and jump straight to it.
 */

type Props = {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  /** Total items, for the "41–60 of 312" line. */
  total?: number;
  pageSize?: number;
  disabled?: boolean;
};

/** Pages to show: first, last, current ±1, with null where a gap goes. */
export function pageWindow(page: number, totalPages: number): (number | null)[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const pages = new Set([1, totalPages, page - 1, page, page + 1]);
  if (page <= 3) [2, 3, 4].forEach((p) => pages.add(p));
  if (page >= totalPages - 2) [totalPages - 3, totalPages - 2, totalPages - 1].forEach((p) => pages.add(p));
  const sorted = [...pages].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
  const out: (number | null)[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push(null);
    out.push(p);
  });
  return out;
}

export function Pager({ page, totalPages, onChange, total, pageSize, disabled }: Props) {
  const [jump, setJump] = useState("");
  if (totalPages <= 1) {
    return total != null ? <Text style={styles.range}>{total} {total === 1 ? "item" : "items"}</Text> : null;
  }

  const go = (p: number) => {
    const next = Math.min(totalPages, Math.max(1, p));
    if (next !== page && !disabled) onChange(next);
  };
  const submitJump = () => {
    const n = parseInt(jump, 10);
    setJump("");
    Keyboard.dismiss();
    if (!isNaN(n)) go(n);
  };

  const from = total != null && pageSize ? (page - 1) * pageSize + 1 : null;
  const to = total != null && pageSize ? Math.min(total, page * pageSize) : null;

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <PageBtn label={<Feather name="chevron-left" size={16} color={page <= 1 ? colors.textMuted : colors.text} />} onPress={() => go(page - 1)} disabled={disabled || page <= 1} a11y="Previous page" />
        {pageWindow(page, totalPages).map((p, i) =>
          p === null ? (
            <Text key={`gap-${i}`} style={styles.gap}>…</Text>
          ) : (
            <PageBtn key={p} label={String(p)} active={p === page} onPress={() => go(p)} disabled={disabled} a11y={`Page ${p}`} />
          ),
        )}
        <PageBtn label={<Feather name="chevron-right" size={16} color={page >= totalPages ? colors.textMuted : colors.text} />} onPress={() => go(page + 1)} disabled={disabled || page >= totalPages} a11y="Next page" />
      </View>
      <View style={styles.jumpRow}>
        {from != null && <Text style={styles.range}>{from}–{to} of {total}</Text>}
        <View style={styles.jumpBox}>
          <Text style={styles.jumpLabel}>Go to page</Text>
          <TextInput
            style={styles.jumpInput}
            value={jump}
            onChangeText={(t) => setJump(t.replace(/[^0-9]/g, ""))}
            onSubmitEditing={submitJump}
            keyboardType="number-pad"
            returnKeyType="go"
            placeholder={`${page}`}
            placeholderTextColor={colors.textMuted}
            maxLength={5}
            accessibilityLabel={`Go to page, 1 to ${totalPages}`}
          />
          <Text style={styles.jumpLabel}>/ {totalPages}</Text>
          <TouchableOpacity style={styles.goBtn} onPress={submitJump} disabled={!jump || disabled} accessibilityRole="button">
            <Text style={styles.goText}>Go</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

function PageBtn({ label, onPress, active, disabled, a11y }: {
  label: React.ReactNode; onPress: () => void; active?: boolean; disabled?: boolean; a11y: string;
}) {
  return (
    <TouchableOpacity
      style={[styles.btn, active && styles.btnActive, disabled && !active && styles.btnDisabled]}
      onPress={onPress}
      disabled={disabled || active}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityState={{ selected: active, disabled }}
      hitSlop={4}
    >
      {typeof label === "string" ? <Text style={[styles.btnText, active && styles.btnTextActive]}>{label}</Text> : label}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingVertical: 16, alignItems: "center" },
  row: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", justifyContent: "center" },
  btn: {
    minWidth: 36,
    height: 36,
    paddingHorizontal: 8,
    marginHorizontal: 3,
    marginVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  btnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  btnDisabled: { opacity: 0.45 },
  btnText: { color: colors.text, fontSize: 14, fontWeight: "600" },
  btnTextActive: { color: colors.textLight },
  gap: { color: colors.textMuted, fontSize: 14, marginHorizontal: 4 },
  jumpRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", flexWrap: "wrap", marginTop: 10 },
  range: { color: colors.textSecondary, fontSize: 12, marginRight: 12, textAlign: "center" },
  jumpBox: { flexDirection: "row", alignItems: "center" },
  jumpLabel: { color: colors.textSecondary, fontSize: 12, marginHorizontal: 4 },
  jumpInput: {
    width: 54,
    height: 34,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    backgroundColor: colors.surface,
    color: colors.text,
    textAlign: "center",
    fontSize: 14,
    paddingVertical: 0,
  },
  goBtn: { marginLeft: 6, paddingHorizontal: 12, height: 34, borderRadius: 6, backgroundColor: colors.primary, justifyContent: "center" },
  goText: { color: colors.textLight, fontSize: 13, fontWeight: "700" },
});
