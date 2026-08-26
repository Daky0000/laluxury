/**
 * Converts the supplier's product photographs into web-sized WebP and writes
 * them to `public/catalog/products`.
 *
 * The originals are 1-3 MB phone JPEGs sitting in a Downloads folder on one
 * machine, so this is the step that turns them into something a storefront can
 * serve. The output is committed — a deploy must never depend on a folder that
 * only exists on a laptop — which also means this only has to be re-run when
 * new photographs arrive.
 *
 *   node scripts/import-product-photos.mjs
 *   PHOTO_SOURCE="D:/somewhere/else" node scripts/import-product-photos.mjs
 *
 * Two things the mapping below encodes that the filenames do not:
 *
 *   - `trim`. Most of the photos carry a camera watermark burned into the
 *     bottom-left corner ("vivo S30 Pro mini" and a date). Cropping the bottom
 *     ninth removes it; the studio renders have no watermark and are left whole.
 *   - `rotate` / `position`. A handful were shot sideways, or have the stock
 *     pushed to one edge with a street scene filling the rest. Sharp's
 *     entropy-led crop reads those backwards and frames the bystander instead
 *     of the carpet, so those few say explicitly which way to turn and which
 *     edge to keep.
 *   - Order. The array order becomes the gallery order in `prisma/seed.ts`, so
 *     the first entry of each group is the one that appears on the grid tile.
 *
 * Counterfeit prints (Gucci, Louis Vuitton, Versace, Chanel, Burberry logos)
 * present in the Bedsheet folder are deliberately absent — see README.
 */

import { mkdir, writeFile, stat, access } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";

const SOURCE = process.env.PHOTO_SOURCE ?? path.join(os.homedir(), "Downloads", "Product");
const OUT_DIR = path.join(process.cwd(), "public", "catalog", "products");

/** 4:5, matching the product gallery and the aspect the grid tile crops from. */
const WIDTH = 1000;
const HEIGHT = 1250;
const QUALITY = 76;

const wa = (time) => `WhatsApp Image 2026-08-22 at ${time}.jpeg`;

/**
 * output name → {
 *   from:     [folder, file]
 *   trim:     crop this fraction off the bottom, before anything else
 *   rotate:   clockwise degrees, for photographs shot sideways
 *   position: which edge the crop keeps; omitted means "let sharp decide"
 * }
 */
const PHOTOS = {
  // --- 3D carpet: five studio renders, then four shots of real stock --------
  "3d-carpet-1": { from: ["3d Carpet", wa("12.46.51 PM (1)")] },
  "3d-carpet-2": { from: ["3d Carpet", wa("12.46.51 PM (3)")] },
  "3d-carpet-3": { from: ["3d Carpet", wa("12.46.51 PM (2)")] },
  "3d-carpet-4": { from: ["3d Carpet", wa("12.46.51 PM (4)")] },
  "3d-carpet-5": { from: ["3d Carpet", wa("12.46.52 PM")] },
  "3d-carpet-6": { from: ["3d Carpet", wa("12.46.51 PM")], trim: 0.09 },
  "3d-carpet-7": { from: ["3d Carpet", wa("12.46.52 PM (1)")] },
  // Two further shots of the same stock (12.46.52 PM (2) and (3)) are skipped:
  // both were taken in the street with someone holding the roll up, and the
  // carpet only ever fills part of the frame. No crop of either reads as a
  // product photograph rather than a snapshot of a bystander.

  // --- Windows --------------------------------------------------------------
  "already-made-curtain-1": { from: ["Already Made Curtains", wa("11.23.28 AM")], trim: 0.09 },
  "already-made-curtain-2": { from: ["Already Made Curtains", wa("11.23.29 AM")], trim: 0.09 },
  "curtain-blinds-1": { from: ["Curtain Blinds", wa("12.01.32 PM (1)")] },

  // --- Living ---------------------------------------------------------------
  "doormat-1": { from: ["Doormat", wa("10.23.33 AM (1)")], trim: 0.09 },
  "fury-throw-pillow-1": { from: ["Fury heavy throw pillow", wa("10.27.59 AM")], trim: 0.09 },

  // --- Bedsheets: florals and warm prints first, bold and monochrome after ---
  "bedsheet-01": { from: ["Bedsheet", wa("10.25.49 AM")], trim: 0.09 },
  "bedsheet-02": { from: ["Bedsheet", wa("10.25.59 AM (3)")], trim: 0.09 },
  "bedsheet-03": { from: ["Bedsheet", wa("10.25.58 AM (2)")], trim: 0.09 },
  "bedsheet-04": { from: ["Bedsheet", wa("10.25.58 AM (1)")], trim: 0.09 },
  "bedsheet-05": { from: ["Bedsheet", wa("10.25.59 AM (1)")], trim: 0.09 },
  "bedsheet-06": { from: ["Bedsheet", wa("10.26.02 AM (2)")], trim: 0.09 },
  "bedsheet-07": { from: ["Bedsheet", wa("10.26.02 AM (3)")], trim: 0.09 },
  "bedsheet-08": { from: ["Bedsheet", wa("10.25.53 AM")], trim: 0.09, rotate: 270 },
  "bedsheet-09": { from: ["Bedsheet", wa("10.25.59 AM (2)")], trim: 0.09 },
  "bedsheet-10": { from: ["Bedsheet", wa("10.26.00 AM")], trim: 0.09 },
  "bedsheet-11": { from: ["Bedsheet", wa("10.26.02 AM (1)")], trim: 0.09 },
  "bedsheet-12": { from: ["Bedsheet", wa("10.25.53 AM (3)")], trim: 0.09 },
  "bedsheet-13": { from: ["Bedsheet", wa("10.25.59 AM (4)")], trim: 0.09 },
  "bedsheet-14": { from: ["Bedsheet", wa("10.26.01 AM (3)")], trim: 0.09 },
  "bedsheet-15": { from: ["Bedsheet", wa("10.26.03 AM")], trim: 0.09 },
  "bedsheet-16": { from: ["Bedsheet", wa("10.26.03 AM (1)")], trim: 0.09 },
  "bedsheet-17": { from: ["Bedsheet", wa("10.26.02 AM (4)")], trim: 0.09 },
  "bedsheet-18": { from: ["Bedsheet", wa("10.26.02 AM")], trim: 0.09 },
  "bedsheet-19": { from: ["Bedsheet", wa("10.25.49 AM (1)")], trim: 0.09 },
  "bedsheet-20": { from: ["Bedsheet", wa("10.25.53 AM (1)")], trim: 0.09 },
  "bedsheet-21": { from: ["Bedsheet", wa("10.26.00 AM (2)")], trim: 0.09 },
  "bedsheet-22": { from: ["Bedsheet", wa("10.25.52 AM (1)")], trim: 0.09 },
  "bedsheet-23": { from: ["Bedsheet", wa("10.26.00 AM (1)")], trim: 0.09 },
  "bedsheet-24": { from: ["Bedsheet", wa("10.25.49 AM (2)")], trim: 0.09 },
  "bedsheet-25": { from: ["Bedsheet", wa("10.26.00 AM (4)")], trim: 0.09 },
  "bedsheet-26": { from: ["Bedsheet", wa("10.26.01 AM")], trim: 0.09 },
  "bedsheet-27": { from: ["Bedsheet", wa("10.26.01 AM (2)")], trim: 0.09 },
  "bedsheet-28": { from: ["Bedsheet", wa("10.25.59 AM")], trim: 0.09 },
  "bedsheet-29": { from: ["Bedsheet", wa("10.26.01 AM (4)")], trim: 0.09 },
  "bedsheet-30": { from: ["Bedsheet", wa("10.26.01 AM (1)")], trim: 0.09 },
  "bedsheet-31": { from: ["Bedsheet", wa("10.26.00 AM (3)")], trim: 0.09 },
};

async function convert(name, spec) {
  const source = path.join(SOURCE, ...spec.from);

  // Each step ends in a buffer and the next starts from it, because sharp does
  // not honour the order operations are chained in: within one pipeline it
  // always rotates before it extracts, so a trim written before a rotation is
  // measured against the turned image and falls outside it. Separate passes
  // also mean the trim is measured against the upright image, not the raw file.
  let image = await sharp(source).rotate().toBuffer({ resolveWithObject: true });

  // Trim before rotating: the watermark is anchored to the bottom edge as shot,
  // and a rotation moves that edge somewhere else.
  if (spec.trim) {
    image = await sharp(image.data)
      .extract({
        left: 0,
        top: 0,
        width: image.info.width,
        height: Math.round(image.info.height * (1 - spec.trim)),
      })
      .toBuffer({ resolveWithObject: true });
  }

  if (spec.rotate) {
    image = await sharp(image.data).rotate(spec.rotate).toBuffer({ resolveWithObject: true });
  }

  const file = path.join(OUT_DIR, `${name}.webp`);

  await sharp(image.data)
    .resize({
      width: WIDTH,
      height: HEIGHT,
      fit: "cover",
      position: spec.position ?? "attention",
    })
    .webp({ quality: QUALITY })
    .toFile(file);

  const { size } = await stat(file);
  return size;
}

async function main() {
  try {
    await access(SOURCE);
  } catch {
    console.error(
      `Source folder not found: ${SOURCE}\n` +
        "The converted images are committed, so this only needs running when new\n" +
        "photographs arrive. Point PHOTO_SOURCE at the folder holding them.",
    );
    process.exit(1);
  }

  await mkdir(OUT_DIR, { recursive: true });

  let total = 0;
  const failed = [];

  for (const [name, spec] of Object.entries(PHOTOS)) {
    try {
      const size = await convert(name, spec);
      total += size;
      console.log(`  ${name}.webp  ${(size / 1024).toFixed(0)} KB`);
    } catch (error) {
      failed.push(`${name} (${spec.from.join("/")}): ${error.message}`);
    }
  }

  // A manifest the seed can be checked against, so a missing file is caught
  // here rather than as a broken image on a product page.
  await writeFile(
    path.join(OUT_DIR, "index.json"),
    `${JSON.stringify(Object.keys(PHOTOS).sort(), null, 2)}\n`,
    "utf8",
  );

  const count = Object.keys(PHOTOS).length - failed.length;
  console.log(
    `\nWrote ${count} images to public/catalog/products (${(total / 1024 / 1024).toFixed(1)} MB)`,
  );

  if (failed.length) {
    console.error(`\n${failed.length} failed:`);
    for (const line of failed) console.error(`  ${line}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
