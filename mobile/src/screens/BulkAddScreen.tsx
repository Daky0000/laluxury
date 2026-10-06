import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Switch,
  RefreshControl,
} from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { colors } from "../theme/colors";
import { api } from "../services/api";
import { toast } from "../lib/toast";
import { formatCurrency, formatDate } from "../utils/format";
import type { BulkImportDetail, BulkImportItem, BulkImportOverview } from "../types";

/**
 * Bulk Product Add for owners and admins. Photo imports run through the same
 * server pipeline, queue and AI as the web admin (/admin/products/bulk-add),
 * so a batch started here can be reviewed on the website and the other way
 * round. Spreadsheet imports stay on the web.
 */

type Props = { onBack: () => void };

type Photo = { uri: string; base64: string; mimeType?: string | null; fileName?: string | null };

const BUSY = new Set(["UPLOADING", "PARSING", "NORMALIZING", "MATCHING", "ENRICHING", "VALIDATING", "IMPORTING"]);

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  UPLOADING: "Uploading",
  PARSING: "Reading",
  NORMALIZING: "Preparing",
  MATCHING: "Matching",
  ENRICHING: "AI writing",
  VALIDATING: "Checking",
  READY_FOR_REVIEW: "Ready to review",
  IMPORTING: "Importing",
  PARTIAL: "Partly imported",
  COMPLETED: "Completed",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
  PUBLISHED: "Published",
  IMPORTED: "Imported (draft)",
};

export function BulkAddScreen({ onBack }: Props) {
  const [batchId, setBatchId] = useState<string | null>(null);
  return batchId ? (
    <BatchView batchId={batchId} onBack={() => setBatchId(null)} />
  ) : (
    <SetupView onBack={onBack} onOpen={setBatchId} />
  );
}

// --- New import + history ---------------------------------------------------

function SetupView({ onBack, onOpen }: { onBack: () => void; onOpen: (id: string) => void }) {
  const [overview, setOverview] = useState<BulkImportOverview | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [name, setName] = useState("");
  const [priceGHS, setPriceGHS] = useState("");
  const [stock, setStock] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [recipeId, setRecipeId] = useState<string | null>(null);
  const [onePerPhoto, setOnePerPhoto] = useState(true);
  const [useAi, setUseAi] = useState(true);
  const [note, setNote] = useState("");
  const [progress, setProgress] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setOverview(await api.getBulkImports());
    } catch (err) {
      toast("Error", err instanceof Error ? err.message : "Could not load imports.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const addPhotos = async (camera: boolean) => {
    if (camera) {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        toast("Permission needed", "Camera access is needed to photograph stock.");
        return;
      }
    }
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 0.7, base64: true };
    const result = camera
      ? await ImagePicker.launchCameraAsync(opts)
      : await ImagePicker.launchImageLibraryAsync({ ...opts, allowsMultipleSelection: true, selectionLimit: 100 });
    if (result.canceled) return;
    const picked = result.assets
      .filter((a) => a.base64)
      .map((a) => ({ uri: a.uri, base64: a.base64 as string, mimeType: a.mimeType, fileName: a.fileName }));
    setPhotos((prev) => [...prev, ...picked].slice(0, 200));
  };

  const start = async () => {
    if (!photos.length) {
      toast("No photos", "Add at least one photo.");
      return;
    }
    const price = priceGHS.trim() ? Math.round(parseFloat(priceGHS) * 100) : null;
    if (price !== null && (isNaN(price) || price < 0)) {
      toast("Invalid price", "Enter a price in GHS, or leave it empty to fill in later.");
      return;
    }
    const stockNum = stock.trim() ? parseInt(stock, 10) : null;

    try {
      setProgress("Creating import…");
      const { batchId } = await api.createBulkImport({
        name: name.trim() || undefined,
        recipeId,
        categoryIds: categoryId ? [categoryId] : [],
        price,
        stock: stockNum !== null && !isNaN(stockNum) ? stockNum : null,
        aiEnabled: useAi,
        grouping: onePerPhoto ? "SEPARATE_PRODUCTS" : "SAME_PRODUCT",
        instruction: note.trim() || null,
      });

      let failed = 0;
      for (let i = 0; i < photos.length; i++) {
        setProgress(`Uploading photo ${i + 1} of ${photos.length}…`);
        let tries = 0;
        for (;;) {
          try {
            await api.addBulkImportPhoto(batchId, photos[i]);
            break;
          } catch {
            if (++tries >= 3) {
              failed++;
              break;
            }
          }
        }
      }
      if (failed === photos.length) throw new Error("No photo could be uploaded. Check your connection.");

      setProgress("Starting…");
      await api.bulkImportAction(batchId, { action: "start" });
      if (failed) toast("Some photos skipped", `${failed} photo(s) could not be uploaded.`);
      setPhotos([]);
      setName("");
      setNote("");
      onOpen(batchId);
    } catch (err) {
      toast("Import not started", err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setProgress(null);
    }
  };

  const vendor = overview?.ai.vendor === "NVIDIA" ? "NVIDIA" : "OpenRouter";

  return (
    <View style={styles.container}>
      <Header title="Bulk Add" left="Back" onLeft={onBack} />
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      >
        <View style={styles.card}>
          <Text style={styles.cardTitle}>New photo import</Text>
          <Text style={styles.hint}>
            Add many photos at once. We group, title and describe them{overview?.ai.enabled ? ` with AI (${vendor})` : ""}, then you review before anything goes live.
          </Text>

          <View style={styles.row}>
            <TouchableOpacity style={[styles.btnOutline, { flex: 1, marginRight: 6 }]} onPress={() => addPhotos(false)}>
              <Text style={styles.btnOutlineText}>Choose photos</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btnOutline, { flex: 1, marginLeft: 6 }]} onPress={() => addPhotos(true)}>
              <Text style={styles.btnOutlineText}>Take photo</Text>
            </TouchableOpacity>
          </View>

          {photos.length > 0 && (
            <>
              <Text style={styles.label}>{photos.length} PHOTO{photos.length === 1 ? "" : "S"}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                {photos.map((p, i) => (
                  <TouchableOpacity key={`${p.uri}-${i}`} onLongPress={() => setPhotos((prev) => prev.filter((_, j) => j !== i))}>
                    <Image source={{ uri: p.uri }} style={styles.thumb} contentFit="cover" />
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <Text style={styles.hintSmall}>Long-press a photo to remove it.</Text>
            </>
          )}

          <Field label="IMPORT NAME" value={name} onChange={setName} placeholder="e.g. Duvet delivery — October" />
          <View style={styles.row}>
            <View style={{ flex: 1, marginRight: 6 }}>
              <Field label="PRICE (GHS)" value={priceGHS} onChange={setPriceGHS} placeholder="Optional" numeric />
            </View>
            <View style={{ flex: 1, marginLeft: 6 }}>
              <Field label="STOCK EACH" value={stock} onChange={setStock} placeholder="Optional" numeric />
            </View>
          </View>

          {!!overview?.categories.length && (
            <Chips label="CATEGORY" items={overview.categories} selected={categoryId} onSelect={setCategoryId} />
          )}
          {!!overview?.recipes.length && (
            <Chips label="RECIPE" items={overview.recipes} selected={recipeId} onSelect={setRecipeId} />
          )}

          <Field label="NOTE FOR AI (OPTIONAL)" value={note} onChange={setNote} placeholder="e.g. Egyptian cotton, sizes King and Superking" multiline />

          <Toggle label="One product per photo" value={onePerPhoto} onChange={setOnePerPhoto} hint={onePerPhoto ? undefined : "All photos become one product's gallery."} />
          <Toggle label="Use AI for titles and descriptions" value={useAi} onChange={setUseAi} />

          <TouchableOpacity style={[styles.btn, (!!progress || !photos.length) && styles.disabled]} disabled={!!progress || !photos.length} onPress={start}>
            {progress ? (
              <View style={styles.row}>
                <ActivityIndicator color="#000" />
                <Text style={[styles.btnText, { marginLeft: 8 }]}>{progress}</Text>
              </View>
            ) : (
              <Text style={styles.btnText}>Prepare products</Text>
            )}
          </TouchableOpacity>
        </View>

        <Text style={styles.section}>RECENT IMPORTS</Text>
        {!overview && <ActivityIndicator color={colors.gold} style={{ marginTop: 16 }} />}
        {overview?.batches.length === 0 && <Text style={styles.hint}>No imports yet.</Text>}
        {overview?.batches.map((b) => (
          <TouchableOpacity key={b.id} style={styles.listRow} onPress={() => onOpen(b.id)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.listTitle} numberOfLines={1}>{b.name}</Text>
              <Text style={styles.hintSmall}>
                {formatDate(b.createdAt)} · {b.summary?.total ?? 0} item(s) · {b.sourceKind === "PHOTOS" ? "photos" : "spreadsheet"}
              </Text>
            </View>
            <StatusPill status={b.status} />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

// --- One import: progress, review, import, publish --------------------------

function BatchView({ batchId, onBack }: { batchId: string; onBack: () => void }) {
  const [detail, setDetail] = useState<BulkImportDetail | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<BulkImportItem | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await api.getBulkImport(batchId);
      setDetail(d);
      return d;
    } catch (err) {
      toast("Error", err instanceof Error ? err.message : "Could not load the import.");
      return null;
    }
  }, [batchId]);

  // Poll while the server is working; each poll also advances the queue.
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const d = await load();
      if (!alive) return;
      const working = d && (d.pending > 0 || BUSY.has(d.batch.status));
      timer.current = setTimeout(tick, working ? 2500 : 8000);
    };
    void tick();
    return () => {
      alive = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [load]);

  const run = async (label: string, body: Parameters<typeof api.bulkImportAction>[1], done?: string) => {
    setBusy(label);
    try {
      const res = await api.bulkImportAction(batchId, body);
      if (done) toast("Done", res.message || done);
      await load();
    } catch (err) {
      toast("Not done", err instanceof Error ? err.message : "That did not work.");
    } finally {
      setBusy(null);
    }
  };

  if (!detail) {
    return (
      <View style={styles.container}>
        <Header title="Import" left="Back" onLeft={onBack} />
        <ActivityIndicator color={colors.gold} style={{ marginTop: 40 }} />
      </View>
    );
  }

  const { batch, items } = detail;
  const counts = (s: string) => items.filter((i) => i.status === s).length;
  const ready = counts("READY");
  const attention = items.filter((i) => i.status === "NEEDS_REVIEW" || i.status === "BLOCKED").length;
  const imported = counts("IMPORTED") + counts("UPDATED");
  const published = items.filter((i) => i.published).length;
  const failed = items.filter((i) => i.status === "FAILED" || i.aiStatus === "FAILED").length;
  const aiQueued = items.filter((i) => i.aiStatus === "PENDING").length;
  const working = detail.pending > 0 || BUSY.has(batch.status);
  const closed = batch.status === "CANCELLED";

  return (
    <View style={styles.container}>
      <Header title={batch.name} left="Back" onLeft={onBack} />
      <ScrollView contentContainerStyle={styles.scroll} refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}>
        <View style={styles.card}>
          <View style={[styles.row, { justifyContent: "space-between", marginBottom: 8 }]}>
            <StatusPill status={batch.status} />
            {working && <ActivityIndicator color={colors.gold} />}
          </View>
          <Text style={styles.hint}>
            {detail.photoCount} photo(s) · {items.length} item(s) · {ready} ready · {attention} need a look · {imported} imported · {published} published
            {failed ? ` · ${failed} failed` : ""}
          </Text>
          {aiQueued > 0 && (
            <Text style={styles.hintSmall}>AI is writing {aiQueued} item(s). Busy free models are retried automatically.</Text>
          )}
          {!!batch.error && <Text style={styles.errorText}>{batch.error}</Text>}

          {!closed && (
            <View style={{ marginTop: 12 }}>
              {ready > 0 && (
                <>
                  <ActionBtn label={`Import ${ready} as drafts`} busy={busy} onPress={() => run("import", { action: "import", publish: false }, "Import queued.")} />
                  <ActionBtn label={`Import ${ready} and publish`} busy={busy} primary onPress={() =>
                    Alert.alert("Publish now?", `${ready} product(s) will go live on the website and app.`, [
                      { text: "Cancel", style: "cancel" },
                      { text: "Publish", onPress: () => run("importPublish", { action: "import", publish: true }, "Import queued; products will go live.") },
                    ])
                  } />
                </>
              )}
              {imported > 0 && (
                <ActionBtn label="Publish imported drafts" busy={busy} onPress={() => run("publish", { action: "publish" }, "Publishing queued.")} />
              )}
              {failed > 0 && <ActionBtn label={`Retry ${failed} failed`} busy={busy} onPress={() => run("retry", { action: "retry" }, "Retrying.")} />}
              {batch.status !== "COMPLETED" && (
                <TouchableOpacity
                  onPress={() =>
                    Alert.alert("Cancel import?", "Nothing more from this import will be added.", [
                      { text: "Keep", style: "cancel" },
                      { text: "Cancel import", style: "destructive", onPress: () => run("cancel", { action: "cancel" }) },
                    ])
                  }
                >
                  <Text style={styles.linkDanger}>Cancel import</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        <Text style={styles.section}>ITEMS</Text>
        {items.map((it) => (
          <TouchableOpacity
            key={it.id}
            style={styles.itemRow}
            disabled={["IMPORTED", "UPDATED", "IMPORTING"].includes(it.status)}
            onPress={() => setEditing(it)}
          >
            {it.imageUrl ? (
              <Image source={{ uri: it.imageUrl }} style={styles.itemThumb} contentFit="cover" />
            ) : (
              <View style={[styles.itemThumb, { backgroundColor: colors.surfaceWarm }]} />
            )}
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.listTitle} numberOfLines={1}>{it.title || "Untitled"}</Text>
              <Text style={styles.hintSmall}>
                {it.price != null ? formatCurrency(it.price) : "No price"} · {it.stock} in stock
                {it.variantCount > 1 ? ` · ${it.variantCount} versions` : ""}
              </Text>
              {it.issues?.filter((x) => x.severity !== "INFO").slice(0, 2).map((x) => (
                <Text key={x.code} style={x.severity === "BLOCK" ? styles.errorSmall : styles.warnSmall}>{x.message}</Text>
              ))}
              {it.aiStatus === "PENDING" && <Text style={styles.hintSmall}>AI working…</Text>}
            </View>
            <StatusPill status={it.published ? "PUBLISHED" : it.status} small />
          </TouchableOpacity>
        ))}
      </ScrollView>

      {editing && (
        <ItemEditor
          item={editing}
          onClose={() => setEditing(null)}
          onSave={async (changes) => {
            await run("edit", { action: "editItem", itemId: editing.id, changes });
            setEditing(null);
          }}
        />
      )}
    </View>
  );
}

function ItemEditor({
  item,
  onClose,
  onSave,
}: {
  item: BulkImportItem;
  onClose: () => void;
  onSave: (changes: { title?: string; price?: number | null; stock?: number | null; skip?: boolean }) => Promise<void>;
}) {
  const [title, setTitle] = useState(item.title ?? "");
  const [price, setPrice] = useState(item.price != null ? String(item.price / 100) : "");
  const [stock, setStock] = useState(String(item.stock ?? ""));
  const [saving, setSaving] = useState(false);
  const skipped = item.status === "SKIPPED";

  const save = async (extra?: { skip: boolean }) => {
    setSaving(true);
    const p = price.trim() ? Math.round(parseFloat(price) * 100) : null;
    const s = stock.trim() ? parseInt(stock, 10) : null;
    await onSave({
      title: title.trim() || undefined,
      price: p !== null && !isNaN(p) ? p : null,
      stock: s !== null && !isNaN(s) ? s : null,
      ...extra,
    });
    setSaving(false);
  };

  return (
    <View style={styles.sheetBackdrop}>
      <View style={styles.sheet}>
        <Text style={styles.cardTitle}>Edit item</Text>
        <Field label="TITLE" value={title} onChange={setTitle} />
        <View style={styles.row}>
          <View style={{ flex: 1, marginRight: 6 }}>
            <Field label="PRICE (GHS)" value={price} onChange={setPrice} numeric />
          </View>
          <View style={{ flex: 1, marginLeft: 6 }}>
            <Field label="STOCK" value={stock} onChange={setStock} numeric />
          </View>
        </View>
        <TouchableOpacity style={[styles.btn, saving && styles.disabled]} disabled={saving} onPress={() => save()}>
          {saving ? <ActivityIndicator color="#000" /> : <Text style={styles.btnText}>Save</Text>}
        </TouchableOpacity>
        <View style={[styles.row, { justifyContent: "space-between", marginTop: 12 }]}>
          <TouchableOpacity disabled={saving} onPress={() => save({ skip: !skipped })}>
            <Text style={skipped ? styles.link : styles.linkDanger}>{skipped ? "Include again" : "Skip this item"}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.link}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// --- Small pieces -------------------------------------------------------------

function Header({ title, left, onLeft }: { title: string; left: string; onLeft: () => void }) {
  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={onLeft} style={{ paddingVertical: 6, width: 60 }}>
        <Text style={styles.backText}>{left}</Text>
      </TouchableOpacity>
      <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
      <View style={{ width: 60 }} />
    </View>
  );
}

function Field({ label, value, onChange, placeholder, numeric, multiline }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; numeric?: boolean; multiline?: boolean;
}) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && { minHeight: 64, textAlignVertical: "top" }]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textSubtle}
        keyboardType={numeric ? "decimal-pad" : "default"}
        multiline={multiline}
      />
    </View>
  );
}

function Chips({ label, items, selected, onSelect }: {
  label: string; items: { id: string; name: string }[]; selected: string | null; onSelect: (id: string | null) => void;
}) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.label}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {items.map((c) => {
          const on = selected === c.id;
          return (
            <TouchableOpacity key={c.id} style={[styles.chip, on && styles.chipOn]} onPress={() => onSelect(on ? null : c.id)}>
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{c.name}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

function Toggle({ label, value, onChange, hint }: { label: string; value: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <View style={[styles.row, { justifyContent: "space-between" }]}>
        <Text style={styles.toggleText}>{label}</Text>
        <Switch value={value} onValueChange={onChange} trackColor={{ false: colors.border, true: colors.gold }} thumbColor="#FFFFFF" />
      </View>
      {hint && <Text style={styles.hintSmall}>{hint}</Text>}
    </View>
  );
}

function ActionBtn({ label, onPress, busy, primary }: { label: string; onPress: () => void; busy: string | null; primary?: boolean }) {
  return (
    <TouchableOpacity
      style={[primary ? styles.btn : styles.btnOutline, { marginBottom: 8 }, !!busy && styles.disabled]}
      disabled={!!busy}
      onPress={onPress}
    >
      <Text style={primary ? styles.btnText : styles.btnOutlineText}>{label}</Text>
    </TouchableOpacity>
  );
}

function StatusPill({ status, small }: { status: string; small?: boolean }) {
  const tone =
    ["COMPLETED", "PUBLISHED", "IMPORTED", "UPDATED", "READY"].includes(status) ? { bg: colors.successBg, fg: colors.success }
    : ["FAILED", "BLOCKED", "CANCELLED"].includes(status) ? { bg: colors.errorBg, fg: colors.error }
    : ["NEEDS_REVIEW", "PARTIAL", "READY_FOR_REVIEW"].includes(status) ? { bg: colors.warningBg, fg: colors.warning }
    : { bg: colors.infoBg, fg: colors.info };
  const text = STATUS_LABEL[status] ?? status.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
  return (
    <View style={[styles.pill, { backgroundColor: tone.bg }, small && { paddingHorizontal: 6 }]}>
      <Text style={[styles.pillText, { color: tone.fg }]}>{text}</Text>
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
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backText: { color: colors.textMuted, fontSize: 15 },
  headerTitle: { color: colors.text, fontSize: 17, fontWeight: "700", flex: 1, textAlign: "center" },
  scroll: { padding: 16, paddingBottom: 60 },
  card: { backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 16 },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: "700", marginBottom: 6 },
  hint: { color: colors.textSecondary, fontSize: 13, marginBottom: 12, lineHeight: 18 },
  hintSmall: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  label: { color: colors.goldDark, fontSize: 10, fontWeight: "700", letterSpacing: 1, marginBottom: 6 },
  input: {
    backgroundColor: colors.surfaceInput,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  row: { flexDirection: "row", alignItems: "center" },
  thumb: { width: 64, height: 64, borderRadius: 6, marginRight: 6, backgroundColor: colors.surfaceWarm },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8,
  },
  chipOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  chipText: { color: colors.textMuted, fontSize: 12, fontWeight: "600" },
  chipTextOn: { color: "#000" },
  toggleText: { color: colors.text, fontSize: 13, fontWeight: "600", flex: 1, marginRight: 8 },
  btn: { backgroundColor: colors.gold, borderRadius: 8, paddingVertical: 13, alignItems: "center", marginTop: 4 },
  btnText: { color: "#000", fontSize: 14, fontWeight: "700" },
  btnOutline: { borderRadius: 8, paddingVertical: 12, alignItems: "center", borderWidth: 1, borderColor: colors.gold, marginBottom: 12 },
  btnOutlineText: { color: colors.goldDark, fontSize: 14, fontWeight: "700" },
  disabled: { opacity: 0.55 },
  section: { color: colors.textMuted, fontSize: 11, fontWeight: "700", letterSpacing: 1, marginBottom: 8 },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 8,
  },
  listTitle: { color: colors.text, fontSize: 14, fontWeight: "600" },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 10,
    marginBottom: 8,
  },
  itemThumb: { width: 52, height: 52, borderRadius: 6 },
  pill: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, marginLeft: 8 },
  pillText: { fontSize: 10, fontWeight: "700" },
  errorText: { color: colors.error, fontSize: 12, marginTop: 6 },
  errorSmall: { color: colors.error, fontSize: 11, marginTop: 2 },
  warnSmall: { color: colors.warning, fontSize: 11, marginTop: 2 },
  link: { color: colors.goldDark, fontSize: 14, fontWeight: "600" },
  linkDanger: { color: colors.error, fontSize: 14, fontWeight: "600", textAlign: "center", marginTop: 6 },
  sheetBackdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, paddingBottom: 32 },
});
