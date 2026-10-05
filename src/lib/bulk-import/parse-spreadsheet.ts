import { inflateRawSync } from "node:zlib";

/**
 * CSV and XLSX reading for Bulk Product Add, server/worker-side only.
 *
 * No dependency: CSV is RFC 4180 with delimiter sniffing, and XLSX is a zip of
 * XML, read with a small central-directory reader and zlib. Only the first
 * worksheet is read. Rows keep their order so row numbers survive.
 */

export const MAX_SPREADSHEET_BYTES = 60 * 1024 * 1024;
export const MAX_SPREADSHEET_ROWS = 250_000;

export type ParsedSheet = { headers: string[]; rows: string[][] };

export class SpreadsheetError extends Error {}

export function parseSpreadsheet(bytes: Buffer, filename: string): ParsedSheet {
  if (bytes.length > MAX_SPREADSHEET_BYTES) {
    throw new SpreadsheetError("That file is larger than 60 MB. Split it and import the parts.");
  }
  const lower = filename.toLowerCase();
  const isZip = bytes.length > 4 && bytes.readUInt32LE(0) === 0x04034b50;
  let table: string[][];
  if (lower.endsWith(".xlsx") || isZip) {
    if (!isZip) throw new SpreadsheetError("That .xlsx file is not a valid Excel workbook.");
    table = readXlsx(bytes);
  } else if (lower.endsWith(".csv") || lower.endsWith(".txt") || lower.endsWith(".tsv")) {
    table = readCsv(bytes.toString("utf8"));
  } else {
    throw new SpreadsheetError("Upload an .xlsx or .csv file.");
  }
  return toSheet(table);
}

function toSheet(table: string[][]): ParsedSheet {
  const nonEmpty = table.filter((r) => r.some((c) => c.trim() !== ""));
  if (!nonEmpty.length) throw new SpreadsheetError("The file has no rows.");
  const [headerRow, ...rows] = nonEmpty;
  const seen = new Map<string, number>();
  const headers = headerRow.map((h, i) => {
    const base = h.trim() || `Column ${i + 1}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n > 1 ? `${base} (${n})` : base;
  });
  if (rows.length > MAX_SPREADSHEET_ROWS) {
    throw new SpreadsheetError(`The file has ${rows.length} rows; the limit per batch is ${MAX_SPREADSHEET_ROWS}.`);
  }
  return { headers, rows: rows.map((r) => headers.map((_, i) => (r[i] ?? "").trim())) };
}

// --- CSV --------------------------------------------------------------------

export function readCsv(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const firstLine = src.slice(0, src.indexOf("\n") >= 0 ? src.indexOf("\n") : src.length);
  const delimiter = [",", ";", "\t", "|"]
    .map((d) => ({ d, n: firstLine.split(d).length }))
    .sort((a, b) => b.n - a.n)[0].d;

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"' && field === "") quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// --- XLSX -------------------------------------------------------------------

function unzip(buf: Buffer): Map<string, () => Buffer> {
  // End of central directory: scan back from the end for its signature.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new SpreadsheetError("That workbook is damaged (no zip directory).");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = new Map<string, () => Buffer>();

  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new SpreadsheetError("That workbook is damaged.");
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;

    files.set(name, () => {
      const lnameLen = buf.readUInt16LE(localOffset + 26);
      const lextraLen = buf.readUInt16LE(localOffset + 28);
      const start = localOffset + 30 + lnameLen + lextraLen;
      const data = buf.subarray(start, start + compSize);
      if (method === 0) return Buffer.from(data);
      if (method === 8) return inflateRawSync(data);
      throw new SpreadsheetError("That workbook uses an unsupported compression method.");
    });
  }
  return files;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decodeXml(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return String.fromCodePoint(code);
    }
    return ENTITIES[e.toLowerCase()] ?? _;
  });
}

function textRuns(xml: string): string {
  let out = "";
  for (const m of xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) out += m[1];
  return decodeXml(out);
}

function colIndex(ref: string): number {
  const letters = ref.replace(/[0-9]/g, "");
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function readXlsx(buf: Buffer): string[][] {
  const files = unzip(buf);
  const read = (name: string) => files.get(name)?.().toString("utf8");

  const shared: string[] = [];
  const sst = read("xl/sharedStrings.xml");
  if (sst) for (const m of sst.matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(textRuns(m[1]));

  // First sheet in workbook order, resolved through the relationships file.
  let sheetPath = "xl/worksheets/sheet1.xml";
  const workbook = read("xl/workbook.xml");
  const rels = read("xl/_rels/workbook.xml.rels");
  const firstRid = workbook?.match(/<sheet\b[^>]*\br:id="([^"]+)"/)?.[1];
  if (firstRid && rels) {
    const target = rels.match(new RegExp(`<Relationship\\b[^>]*Id="${firstRid}"[^>]*Target="([^"]+)"`))?.[1]
      ?? rels.match(new RegExp(`<Relationship\\b[^>]*Target="([^"]+)"[^>]*Id="${firstRid}"`))?.[1];
    if (target) sheetPath = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
  }
  const sheet = read(sheetPath);
  if (!sheet) throw new SpreadsheetError("The workbook has no readable worksheet.");

  const rows: string[][] = [];
  for (const rowMatch of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: string[] = [];
    for (const c of rowMatch[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1];
      const body = c[2] ?? "";
      const ref = attrs.match(/\br="([A-Z]+)\d+"/)?.[1];
      const type = attrs.match(/\bt="([^"]+)"/)?.[1];
      const idx = ref ? colIndex(ref) : row.length;
      let value = "";
      if (type === "s") value = shared[Number(body.match(/<v>([\s\S]*?)<\/v>/)?.[1])] ?? "";
      else if (type === "inlineStr") value = textRuns(body);
      else value = decodeXml(body.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "");
      while (row.length < idx) row.push("");
      row[idx] = value;
    }
    rows.push(row);
  }
  return rows;
}
