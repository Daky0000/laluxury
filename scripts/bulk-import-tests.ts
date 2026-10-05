/**
 * Bulk Product Add — pure logic tests (no database, no network).
 *
 * Covers option/variant generation, pricing and stock rules, AI failover,
 * spreadsheet parsing and grouping, and synthetic 1k / 10k / 100k row files.
 *
 * Loaded by scripts/test-bulk-import.ts.
 */

import { deflateRawSync } from "node:zlib";
import { buildOptions } from "../src/lib/bulk-import/build-options";
import { buildCombinations, combinationCount } from "../src/lib/bulk-import/build-variants";
import { resolveVariantPrice } from "../src/lib/bulk-import/resolve-variant-price";
import { resolveVariantStock } from "../src/lib/bulk-import/resolve-variant-stock";
import { parseSpreadsheet, readCsv } from "../src/lib/bulk-import/parse-spreadsheet";
import { groupSourceRows } from "../src/lib/bulk-import/group-source-products";
import { suggestMappingDeterministic } from "../src/lib/bulk-import/map-columns";
import { buildNormalizer, parseMoney } from "../src/lib/bulk-import/normalize-source";
import { buildItemDraft } from "../src/lib/bulk-import/merge-data";
import { batchSetupSchema } from "../src/lib/bulk-import/schema";
import { matchFilenameToOptionValue, filenameStem, matchPhotoToRow } from "../src/lib/bulk-import/image-matching";
import { runWithFailover } from "../src/lib/bulk-ai/failover";
import { BulkAiError, BulkAiExhaustedError } from "../src/lib/bulk-ai/retry";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    passed++;
    console.log(`  \x1b[32mPASS\x1b[0m  ${name}`);
  } else {
    failed++;
    console.error(`  \x1b[31mFAIL\x1b[0m  ${name} ${detail}`);
  }
}

const SIZES = { name: "Size", values: ["3ft", "4ft", "5ft", "6ft", "7ft"] };
const COLOURS = { name: "Colour", values: ["Sea Blue", "Black", "Black and White", "Wine", "Brown", "Ash"] };

async function main() {
  console.log("\nOption logic");
  check("zero options → one Default version", buildCombinations([]).length === 1 && buildCombinations([])[0].key === "Default");
  check("one option", buildCombinations([SIZES]).length === 5);
  check("Curtain Blind: 5 sizes × 6 colours = 30", buildCombinations([SIZES, COLOURS]).length === 30);
  const three = [
    { name: "Finish", values: ["Matte", "Glossy"] },
    { name: "Pack Size", values: ["1", "2", "4"] },
    { name: "Mount Type", values: ["Wall", "Ceiling"] },
  ];
  check("three custom options = 12", combinationCount(three) === 12 && buildCombinations(three)[0].byOption["Pack Size"] === "1");
  check("buildOptions dedupes values case-insensitively", buildOptions([{ name: "Size", values: ["King", "king", " King "] }])[0].values.length === 1);

  console.log("\nPricing");
  const combos = buildCombinations([SIZES, COLOURS]);
  const c5black = combos.find((c) => c.key === "5ft / Black")!;
  const c5wine = combos.find((c) => c.key === "5ft / Wine")!;
  const bySize = { mode: "BY_OPTION" as const, option: "Size", prices: { "3ft": 10000, "4ft": 12000, "5ft": 16000, "6ft": 18000, "7ft": 20000 } };
  check("same price", resolveVariantPrice({ mode: "SAME", price: 18000 }, c5black).price === 18000);
  check("price by Size: 5ft/Black = 160", resolveVariantPrice(bySize, c5black).price === 16000);
  check("price by Size: 5ft/Wine = 160", resolveVariantPrice(bySize, c5wine).price === 16000);
  const packCombo = buildCombinations(three).find((c) => c.byOption["Pack Size"] === "4")!;
  check(
    "price by custom option (Pack Size)",
    resolveVariantPrice({ mode: "BY_OPTION", option: "Pack Size", prices: { "1": 1000, "2": 1800, "4": 3200 } }, packCombo).price === 3200,
  );
  check(
    "combination price",
    resolveVariantPrice({ mode: "BY_COMBINATION", prices: { "5ft / Wine": 17500 } }, c5wine).price === 17500 &&
      resolveVariantPrice({ mode: "BY_COMBINATION", prices: {} }, c5black).price === null,
  );
  check("source price", resolveVariantPrice({ mode: "SOURCE" }, c5black, 9900).price === 9900);
  check("missing price stays null (never guessed)", resolveVariantPrice({ mode: "SOURCE" }, c5black, null).price === null);
  check(
    "several choices affect price",
    resolveVariantPrice({ mode: "BY_OPTIONS", base: 10000, adjustments: { Size: { "5ft": 6000 }, Colour: { Wine: 500 } } }, c5wine).price === 16500,
  );

  console.log("\nStock");
  check("same stock", resolveVariantStock({ mode: "SAME", quantity: 6 }, c5black).stock === 6);
  check("stock by option (Colour)", resolveVariantStock({ mode: "BY_OPTION", option: "Colour", quantities: { Black: 2 } }, c5black).stock === 2);
  check("stock by variant", resolveVariantStock({ mode: "BY_COMBINATION", quantities: { "5ft / Black": 9 } }, c5black).stock === 9);
  check("source stock", resolveVariantStock({ mode: "SOURCE" }, c5black, 4).stock === 4);
  check("untracked", resolveVariantStock({ mode: "UNTRACKED" }, c5black).track === false);

  console.log("\nDraft building");
  const normalizer = buildNormalizer([{ field: "Colour", fromValue: "Grey", toValue: "Ash", sourceKey: "" }], [{ name: "Size", values: [{ value: "Superking" }] }]);
  const setup = batchSetupSchema.parse({
    options: [SIZES, COLOURS],
    disabledCombinations: ["7ft / Wine"],
    pricing: bySize,
    stock: { mode: "SAME", quantity: 6 },
  });
  const draft = buildItemDraft({
    setup,
    recipe: null,
    rows: [],
    media: [],
    overrides: null,
    ai: { model: "x", confidence: 0.9, title: "AI Title", metaTitle: "AI meta" },
    normalizer,
    categoryBySlugOrName: new Map(),
    collectionBySlugOrName: new Map(),
    skuStem: "CUR",
  });
  check("curtain blind draft has 30 versions, 29 enabled", draft.variants.length === 30 && draft.variants.filter((v) => v.enabled).length === 29);
  check("draft 5ft prices = 16000", draft.variants.filter((v) => v.values[0] === "5ft").every((v) => v.price === 16000));
  check("AI title used only when nothing better, marked AI", draft.title?.value === "AI Title" && draft.title.source === "AI");
  const owner = buildItemDraft({
    setup,
    recipe: null,
    rows: [{ rowNumber: 1, fields: { title: "Supplier Title", price: "999" }, options: {} }],
    media: [],
    overrides: { title: "Owner Title" },
    ai: { model: "x", confidence: 0.9, title: "AI Title" },
    normalizer,
    categoryBySlugOrName: new Map(),
    collectionBySlugOrName: new Map(),
    skuStem: "CUR",
  });
  check("owner override beats source beats AI", owner.title?.value === "Owner Title" && owner.title.source === "OWNER");
  check("owner batch price beats spreadsheet price", owner.variants.every((v) => v.price !== 99900));
  check("AI never sets material", draft.material === undefined);
  check("normalisation: S-KING → Superking", normalizer.value("Size", "S-KING").value === "Superking");
  check("normalisation rule: Grey → Ash", normalizer.value("Colour", "grey").value === "Ash");
  check("money parsing", parseMoney("GHS 1,200.50") === 120050 && parseMoney("₵120") === 12000 && parseMoney("abc") === null);

  console.log("\nImages");
  check("filename → option value", matchFilenameToOptionValue("curtain-black.jpg", COLOURS.values) === "Black");
  check("longest value wins", matchFilenameToOptionValue("blind_black_and_white.jpg", COLOURS.values) === "Black and White");
  check("filename stem groups", filenameStem("rug-01-a.jpg") === filenameStem("rug-01 (2).jpg"));
  check("photo ↔ row by SKU", matchPhotoToRow("DUB-93852_front.jpg", [{ itemId: "a", imageFiles: [], keys: ["DUB-93852"] }]) === "a");

  console.log("\nAI failover (3 attempts per model, max 3 models)");
  const noWait = async () => undefined;
  const ok = (model: string) => ({ content: JSON.stringify({ model }), model });
  const fail = () => {
    throw new BulkAiError("503", "RETRYABLE", 503);
  };
  {
    const calls: string[] = [];
    const out = await runWithFailover(
      { models: ["A", "B", "C"], attemptsPerModel: 3, wait: noWait, log: () => undefined, call: async (m) => (calls.push(m), m === "A" ? fail() : ok(m)) },
      (x) => x as { model: string },
    );
    check("A fails 3, B succeeds", out.model === "B" && calls.join("") === "AAAB", calls.join(""));
  }
  {
    const calls: string[] = [];
    const out = await runWithFailover(
      { models: ["A", "B", "C"], attemptsPerModel: 3, wait: noWait, log: () => undefined, call: async (m) => (calls.push(m), m === "C" ? ok(m) : fail()) },
      (x) => x as { model: string },
    );
    check("A fails 3, B fails 3, C succeeds", out.model === "C" && calls.join("") === "AAABBBC", calls.join(""));
  }
  {
    const calls: string[] = [];
    let threw = false;
    try {
      await runWithFailover({ models: ["A", "B", "C"], attemptsPerModel: 3, wait: noWait, log: () => undefined, call: async (m) => (calls.push(m), fail()) }, (x) => x);
    } catch (e) {
      threw = e instanceof BulkAiExhaustedError;
    }
    check("A/B/C all fail → exhausted after 9 attempts", threw && calls.length === 9, String(calls.length));
  }
  {
    const calls: string[] = [];
    let threw = false;
    try {
      await runWithFailover(
        { models: ["A", "B"], attemptsPerModel: 3, wait: noWait, log: () => undefined, call: async (m) => { calls.push(m); throw new BulkAiError("bad key", "FATAL", 401); } },
        (x) => x,
      );
    } catch (e) {
      threw = e instanceof BulkAiError;
    }
    check("invalid API key stops immediately", threw && calls.length === 1);
  }
  {
    const calls: string[] = [];
    let n = 0;
    const out = await runWithFailover(
      { models: ["A", "B"], attemptsPerModel: 3, wait: noWait, log: () => undefined, call: async (m) => (calls.push(m), n++ < 1 ? { content: "not json", model: m } : ok(m)) },
      (x) => x as { model: string },
    );
    check("invalid JSON is retried on the same model", out.model === "A" && calls.join("") === "AA");
  }

  console.log("\nSpreadsheets");
  const csv = 'Item Name,Item Code,Qty,Retail,Colour,Drop\n"Grey ""Botanical"" Sheet",DUB-1,4,180,Grey,S-KING\n';
  const rows = readCsv(csv);
  check("CSV quoting", rows[1][0] === 'Grey "Botanical" Sheet');
  const sheet = parseSpreadsheet(Buffer.from(csv), "x.csv");
  const mapping = suggestMappingDeterministic(sheet.headers, ["Size", "Colour"]);
  check("column mapping suggestions", mapping["Item Name"] === "title" && mapping["Item Code"] === "sku" && mapping.Qty === "stock" && mapping.Retail === "price" && mapping.Colour === "option:Colour", JSON.stringify(mapping));
  check("xlsx reading", (() => {
    const x = parseSpreadsheet(makeXlsx([["Name", "Price"], ["Rug", "120"]]), "x.xlsx");
    return x.headers[1] === "Price" && x.rows[0][0] === "Rug";
  })());

  console.log("\nLarge files (synthetic)");
  for (const n of [1_000, 10_000, 100_000]) {
    const lines = ["Parent,SKU,Name,Size,Colour,Price,Qty"];
    for (let i = 0; i < n; i++) lines.push(`P${Math.floor(i / 6)},SKU-${i},Design ${Math.floor(i / 6)},${["Double", "King", "S-KING"][i % 3]},${["Black", "Grey"][i % 2]},${150 + (i % 3) * 10},${i % 7}`);
    const started = Date.now();
    const parsed = parseSpreadsheet(Buffer.from(lines.join("\n")), "big.csv");
    const groups = groupSourceRows(parsed.headers, parsed.rows, { Parent: "parentSku", SKU: "sku", Name: "title", Size: "option:Size", Colour: "option:Colour", Price: "price", Qty: "stock" });
    const ms = Date.now() - started;
    check(`${n.toLocaleString()} rows → ${groups.length.toLocaleString()} products in ${ms} ms`, parsed.rows.length === n && groups.length === Math.ceil(n / 6) && ms < 30_000);
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed) process.exit(1);
}

/** A minimal one-sheet xlsx with inline strings. */
function makeXlsx(table: string[][]): Buffer {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const col = (i: number) => String.fromCharCode(65 + i);
  const sheet = `<?xml version="1.0"?><worksheet><sheetData>${table
    .map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => `<c r="${col(ci)}${ri + 1}" t="inlineStr"><is><t>${esc(v)}</t></is></c>`).join("")}</row>`)
    .join("")}</sheetData></worksheet>`;
  const files = [{ name: "xl/worksheets/sheet1.xml", data: Buffer.from(sheet) }];
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const f of files) {
    const comp = deflateRawSync(f.data);
    const name = Buffer.from(f.name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(comp.length, 18);
    local.writeUInt32LE(f.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(comp.length, 20);
    central.writeUInt32LE(f.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, name, comp);
    centrals.push(central, name);
    offset += 30 + name.length + comp.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
