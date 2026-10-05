import React, { useState } from "react";
import { View, Text, TouchableOpacity, TextInput, StyleSheet, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../services/api";
import { useApp } from "../state/AppContext";
import { colors } from "../theme/colors";
import { formatDate } from "../utils/format";

/** Star row; interactive when `onChange` is given. */
function Stars({ value, size = 14, onChange }: { value: number; size?: number; onChange?: (v: number) => void }) {
  return (
    <View style={{ flexDirection: "row", gap: onChange ? 8 : 2 }} accessibilityRole={onChange ? "adjustable" : "text"} accessibilityLabel={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => {
        const star = <Feather name="star" size={size} color={n <= value ? colors.gold : colors.borderDark} />;
        return onChange ? (
          <TouchableOpacity key={n} onPress={() => onChange(n)} hitSlop={6} accessibilityRole="button" accessibilityLabel={`${n} star${n > 1 ? "s" : ""}`}>
            {star}
          </TouchableOpacity>
        ) : (
          <View key={n}>{star}</View>
        );
      })}
    </View>
  );
}

/**
 * Approved reviews plus a form for signed-in customers. Reviews are moderated
 * on the website (Admin -> Reviews) before they appear, same as the web.
 */
export function ProductReviews({ productId }: { productId: string }) {
  const { user } = useApp();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["reviews", productId, user?.id],
    queryFn: () => api.getProductReviews(productId),
  });
  const [writing, setWriting] = useState(false);
  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const data = query.data;
  const mine = data?.mine;

  const submit = async () => {
    if (rating < 1) return setMessage({ ok: false, text: "Choose a star rating." });
    if (body.trim().length < 20) return setMessage({ ok: false, text: "Say a little more - at least a sentence or two." });
    setSending(true);
    setMessage(null);
    try {
      const res = await api.submitReview(productId, { rating, title: title.trim() || undefined, body: body.trim() });
      setMessage({ ok: true, text: res.message });
      setWriting(false);
      client.invalidateQueries({ queryKey: ["reviews", productId] });
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "Could not send your review." });
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={styles.section}>
      <View style={styles.headRow}>
        <Text style={styles.heading} accessibilityRole="header">Reviews</Text>
        {data && data.count > 0 ? (
          <View style={styles.summary}>
            <Stars value={Math.round(data.average ?? 0)} />
            <Text style={styles.summaryText}>
              {data.average?.toFixed(1)} · {data.count} review{data.count === 1 ? "" : "s"}
            </Text>
          </View>
        ) : null}
      </View>

      {query.isLoading ? <ActivityIndicator color={colors.primary} /> : null}

      {data && data.count === 0 && !writing ? (
        <Text style={styles.muted}>No reviews yet. Be the first to share how you find it.</Text>
      ) : null}

      {data?.reviews.slice(0, 5).map((review) => (
        <View key={review.id} style={styles.review}>
          <View style={styles.reviewTop}>
            <Stars value={review.rating} size={12} />
            <Text style={styles.reviewDate}>{formatDate(review.createdAt)}</Text>
          </View>
          {review.title ? <Text style={styles.reviewTitle}>{review.title}</Text> : null}
          <Text style={styles.reviewBody}>{review.body}</Text>
          <Text style={styles.reviewAuthor}>
            {review.authorName}
            {review.isVerifiedPurchase ? "  ·  Verified purchase" : ""}
          </Text>
        </View>
      ))}

      {mine && !mine.isApproved && !writing ? (
        <Text style={styles.muted}>Your review is waiting to be checked before it appears.</Text>
      ) : null}

      {message ? <Text style={[styles.message, { color: message.ok ? colors.success : colors.error }]}>{message.text}</Text> : null}

      {!user ? (
        <Text style={styles.muted}>Sign in from the Account tab to write a review.</Text>
      ) : writing ? (
        <View style={styles.form}>
          <Stars value={rating} size={26} onChange={setRating} />
          <TextInput
            style={styles.input}
            placeholder="Title (optional)"
            placeholderTextColor={colors.textMuted}
            value={title}
            onChangeText={setTitle}
            maxLength={120}
            accessibilityLabel="Review title"
          />
          <TextInput
            style={[styles.input, styles.textarea]}
            placeholder="What do you love about it? How is the quality?"
            placeholderTextColor={colors.textMuted}
            value={body}
            onChangeText={setBody}
            multiline
            maxLength={2000}
            accessibilityLabel="Your review"
          />
          <View style={styles.formActions}>
            <TouchableOpacity onPress={() => setWriting(false)} accessibilityRole="button">
              <Text style={styles.cancel}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.submit} onPress={submit} disabled={sending} accessibilityRole="button" accessibilityLabel="Submit review">
              {sending ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={styles.submitText}>SUBMIT</Text>}
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.writeBtn}
          onPress={() => {
            setRating(mine?.rating ?? 0);
            setTitle(mine?.title ?? "");
            setBody(mine?.body ?? "");
            setWriting(true);
            setMessage(null);
          }}
          accessibilityRole="button"
        >
          <Feather name="edit-3" size={14} color={colors.primary} />
          <Text style={styles.writeText}>{mine ? "EDIT YOUR REVIEW" : "WRITE A REVIEW"}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 28, paddingTop: 20, borderTopWidth: 1, borderTopColor: colors.borderLight },
  headRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  heading: { fontSize: 19, fontWeight: "700", color: colors.text },
  summary: { alignItems: "flex-end", gap: 2 },
  summaryText: { fontSize: 12, color: colors.textSecondary },
  muted: { fontSize: 13, color: colors.textSecondary, marginBottom: 12, lineHeight: 19 },
  review: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  reviewTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  reviewDate: { fontSize: 11, color: colors.textMuted },
  reviewTitle: { fontSize: 14, fontWeight: "700", color: colors.text, marginTop: 6 },
  reviewBody: { fontSize: 14, color: colors.text, marginTop: 4, lineHeight: 20 },
  reviewAuthor: { fontSize: 12, color: colors.textSecondary, marginTop: 6 },
  message: { fontSize: 13, marginVertical: 8, fontWeight: "600" },
  form: { gap: 12, marginTop: 8 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    backgroundColor: colors.surfaceInput,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text,
  },
  textarea: { minHeight: 110, textAlignVertical: "top" },
  formActions: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 20 },
  cancel: { color: colors.textSecondary, fontWeight: "600" },
  submit: { backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 4, minWidth: 110, alignItems: "center" },
  submitText: { color: "#FFFFFF", fontWeight: "800", letterSpacing: 1.2 },
  writeBtn: { flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "flex-start", marginTop: 12, paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.primary, borderRadius: 4 },
  writeText: { color: colors.primary, fontWeight: "800", letterSpacing: 1, fontSize: 12 },
});
