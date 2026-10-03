import { rateLimit } from "./rate-limit";

export const EXPORT_ROW_LIMIT = 5000;
const EXPORT_BYTE_LIMIT = 5 * 1024 * 1024;

export class ExportTooLargeError extends Error {
  constructor() { super("This export is too large. Use a narrower order date range or a private offline export."); }
}

export function assertExportRows(rows: unknown[]): void {
  if (rows.length > EXPORT_ROW_LIMIT) throw new ExportTooLargeError();
}

export function assertExportBytes(body: string): void {
  if (Buffer.byteLength(body, "utf8") > EXPORT_BYTE_LIMIT) throw new ExportTooLargeError();
}

export function exportAllowance(userId: string) {
  return rateLimit(`exports:${userId}`, { limit: 12, windowMs: 60 * 60 * 1000 });
}
