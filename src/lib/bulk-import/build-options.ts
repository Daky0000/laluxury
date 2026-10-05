import type { OptionSpec } from "./schema";

/**
 * Cleans an option list: trims names and values, drops empty options and
 * duplicate values (case-insensitive), and merges options that share a name.
 * Any option name is allowed — Size and Colour are not special.
 */
export function buildOptions(options: OptionSpec[]): OptionSpec[] {
  const byName = new Map<string, OptionSpec>();
  for (const option of options) {
    const name = option.name.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    const target = byName.get(key) ?? { name, values: [] };
    const seen = new Set(target.values.map((v) => v.toLowerCase()));
    for (const raw of option.values) {
      const value = raw.trim();
      if (!value || seen.has(value.toLowerCase())) continue;
      seen.add(value.toLowerCase());
      target.values.push(value);
    }
    byName.set(key, target);
  }
  return [...byName.values()].filter((o) => o.values.length > 0);
}

/** Adds observed values (e.g. from spreadsheet rows) to an option list. */
export function mergeOptionValues(options: OptionSpec[], observed: Record<string, string[]>): OptionSpec[] {
  const extra = Object.entries(observed).map(([name, values]) => ({ name, values }));
  return buildOptions([...options, ...extra]);
}
