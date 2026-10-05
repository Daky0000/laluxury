import { applyMapping } from "./map-columns";
import type { ColumnMapping } from "./schema";

/**
 * Groups spreadsheet rows into products. Rows that share an external key or a
 * parent/style code are one product with several versions; otherwise a titled
 * row with option columns groups by title, and anything else is one row, one
 * product. Grouping is deterministic — AI is only consulted for ambiguity.
 */

export type SourceRow = {
  rowNumber: number;
  fields: Partial<Record<string, string>>;
  options: Record<string, string>;
};

export type SourceGroup = {
  groupKey: string;
  externalKey: string | null;
  rows: SourceRow[];
};

export function groupSourceRows(
  headers: string[],
  rows: string[][],
  mapping: ColumnMapping,
  startRow = 1,
): SourceGroup[] {
  const groups = new Map<string, SourceGroup>();
  const hasOptionColumns = Object.values(mapping).some((t) => t.startsWith("option:"));

  rows.forEach((row, i) => {
    const { fields, options } = applyMapping(headers, row, mapping);
    if (!Object.keys(fields).length && !Object.keys(options).length) return;
    const rowNumber = startRow + i;
    const external = fields.externalKey?.trim() || null;
    const parent = fields.parentSku?.trim() || null;
    const title = fields.title?.trim().toLowerCase() || null;

    const groupKey = external
      ? `ext:${external}`
      : parent
        ? `parent:${parent}`
        : hasOptionColumns && title
          ? `title:${title}`
          : fields.sku
            ? `sku:${fields.sku.trim()}`
            : `row:${rowNumber}`;

    const group = groups.get(groupKey) ?? { groupKey, externalKey: external ?? parent, rows: [] };
    group.rows.push({ rowNumber, fields, options });
    groups.set(groupKey, group);
  });

  return [...groups.values()];
}
