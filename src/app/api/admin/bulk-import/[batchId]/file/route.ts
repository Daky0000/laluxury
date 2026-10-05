import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guardBatchRoute } from "@/lib/bulk-import/route-auth";
import { MAX_SPREADSHEET_BYTES, parseSpreadsheet, SpreadsheetError } from "@/lib/bulk-import/parse-spreadsheet";
import { suggestMapping } from "@/lib/bulk-import/map-columns";
import { getBulkAiConfig } from "@/lib/bulk-ai/model-registry";
import { readSetup } from "@/lib/bulk-import/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/bulk-import/:batchId/file — the spreadsheet.
 *
 * The file is kept on the batch and parsed in full by the worker; this request
 * only reads the headers and a few sample rows for the mapping screen, so the
 * browser never holds every row.
 */
export async function POST(request: Request, { params }: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await params;
  const guard = await guardBatchRoute(batchId, "products:write");
  if ("error" in guard) return guard.error;

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) {
    return NextResponse.json({ ok: false, message: "Choose an .xlsx or .csv file." }, { status: 400 });
  }
  if (file.size > MAX_SPREADSHEET_BYTES) {
    return NextResponse.json({ ok: false, message: "That file is larger than 60 MB." }, { status: 413 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  let headers: string[];
  let rows: string[][];
  try {
    ({ headers, rows } = parseSpreadsheet(bytes, file.name));
  } catch (error) {
    const message = error instanceof SpreadsheetError ? error.message : "That file could not be read.";
    return NextResponse.json({ ok: false, message }, { status: 400 });
  }

  const sample = rows.slice(0, 8).map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""])));
  const [library, aiConfig] = await Promise.all([
    db.catalogOptionDefinition.findMany({ select: { name: true } }),
    getBulkAiConfig(),
  ]);

  // A saved profile's mapping wins when the headers line up.
  const profileId = String(form.get("profileId") ?? "");
  let mapping: Record<string, string> | null = null;
  let profileName: string | null = null;
  let sourceName: string | null = null;
  if (profileId) {
    const profile = await db.catalogSourceProfile.findUnique({ where: { id: profileId }, include: { source: true } });
    const saved = (profile?.config as { columnMapping?: Record<string, string> } | null)?.columnMapping;
    if (profile && saved) {
      mapping = Object.fromEntries(headers.map((h) => [h, saved[h] ?? "ignore"]));
      profileName = profile.name;
      sourceName = profile.source.name;
    }
  }
  let aiUsed = false;
  if (!mapping) {
    const suggestion = await suggestMapping(
      headers,
      sample,
      library.map((o) => o.name),
      aiConfig.bulkAiEnabled && readSetup(guard.batch.setup).aiEnabled,
      batchId,
    );
    mapping = suggestion.mapping;
    aiUsed = suggestion.aiUsed;
  }

  await db.productImportBatch.update({
    where: { id: batchId },
    data: {
      fileName: file.name.slice(0, 200),
      fileData: bytes,
      fileHeaders: headers,
      rowCount: rows.length,
      columnMapping: mapping,
      ...(profileId && profileName ? { profileId } : {}),
    },
  });

  return NextResponse.json({ ok: true, headers, sample, rowCount: rows.length, mapping, aiUsed, profileName, sourceName });
}
