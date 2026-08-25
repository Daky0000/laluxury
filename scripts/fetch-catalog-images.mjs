/**
 * Downloads the storefront artwork from the Claude Design project and writes
 * web-sized WebP copies into `public/catalog`.
 *
 * The originals are 2-3 MB JPEGs; serving them straight to shoppers would cost
 * more bandwidth than the rest of the page combined. Run this once after
 * cloning (or whenever the artwork changes) — the output is committed so a
 * deploy never depends on the source host being up.
 *
 *   node scripts/fetch-catalog-images.mjs
 */

import { mkdir, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const SOURCE = (id) => `https://www.trybloom.ai/img/${id}`;
const OUT_DIR = path.join(process.cwd(), "public", "catalog");

/** name → [source id, width, height|null, quality] */
const IMAGES = {
  // Editorial
  "hero-bedroom": ["94ad994b-7fae-473e-ad25-e62b111328c4", 2000, null, 72],
  "bundle-bed-set": ["d9560429-50cf-4c90-8356-9d4688d2a4ab", 1800, null, 72],

  // Rooms (3:4 portrait crops)
  "room-bedroom": ["f364239c-4bd7-41cd-b129-d685eb21d443", 900, 1200, 74],
  "room-living": ["a69883de-13e2-4076-843b-28a0be10a7cb", 900, 1200, 74],
  "room-windows": ["826c14f1-fa43-45f9-b3f6-2134d243dd89", 900, 1200, 74],
  "room-student": ["63b05339-f60f-4d3b-8305-1ce5ddbe1727", 900, 1200, 74],

  // Products (square crops, matching the grid)
  "rabbit-fur-duvet": ["94ad994b-7fae-473e-ad25-e62b111328c4", 1000, 1000, 76],
  "king-size-duvet": ["d9560429-50cf-4c90-8356-9d4688d2a4ab", 1000, 1000, 76],
  "king-bed-topper": ["f364239c-4bd7-41cd-b129-d685eb21d443", 1000, 1000, 76],
  "cotton-bedsheet-set": ["63b05339-f60f-4d3b-8305-1ce5ddbe1727", 1000, 1000, 76],
  "white-king-bedsheet": ["47c309a5-8291-48d2-b295-b0bb48c7cc15", 1000, 1000, 76],
  "heavy-blanket-double": ["438bfed5-ac1c-41c3-a394-d09d364259c4", 1000, 1000, 76],
  "waterproof-bed-cover": ["9ad63915-4571-4df5-b9e2-54b156f4b5bd", 1000, 1000, 76],
  "soft-sleep-pillow": ["bde3daa0-0180-406f-8774-c531e7f34a4a", 1000, 1000, 76],
  "fluffy-carpet": ["3e13cae9-f18e-4348-aef7-068681e152a0", 1000, 1000, 76],
  "coffee-table": ["a69883de-13e2-4076-843b-28a0be10a7cb", 1000, 1000, 76],
  "round-stool": ["0ce0d30c-3684-48fd-b573-0bd56a65d3b9", 1000, 1000, 76],
  "throw-pillow": ["111c7f0e-7be9-47b4-a1a2-629c62dc9d46", 1000, 1000, 76],
  doormat: ["cb8dffc5-b6d8-4f3d-b4b9-e7caa61cc04f", 1000, 1000, 76],
  "window-curtain": ["826c14f1-fa43-45f9-b3f6-2134d243dd89", 1000, 1000, 76],
  "curtain-blinds": ["89b1f5e7-0572-4fb6-a599-bfb95c0a8eff", 1000, 1000, 76],
  "curtain-pole": ["aff5451f-0cc0-4ad5-8848-43929cbdfc2a", 1000, 1000, 76],
  "shower-curtain": ["93c49e55-84db-49dc-9005-3411154b807c", 1000, 1000, 76],

  // Student essentials (4:5 portrait crops)
  "student-bedsheet": ["63b05339-f60f-4d3b-8305-1ce5ddbe1727", 800, 1000, 76],
  "student-white-bedsheet": ["47c309a5-8291-48d2-b295-b0bb48c7cc15", 800, 1000, 76],
  "student-blanket": ["438bfed5-ac1c-41c3-a394-d09d364259c4", 800, 1000, 76],
  "student-pillow": ["bde3daa0-0180-406f-8774-c531e7f34a4a", 800, 1000, 76],
};

const cache = new Map();

async function download(id) {
  if (cache.has(id)) return cache.get(id);
  const response = await fetch(SOURCE(id));
  if (!response.ok) throw new Error(`${SOURCE(id)} -> HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  cache.set(id, buffer);
  return buffer;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  for (const [name, [id, width, height, quality]] of Object.entries(IMAGES)) {
    const source = await download(id);
    const file = path.join(OUT_DIR, `${name}.webp`);

    await sharp(source)
      .resize({ width, height, fit: height ? "cover" : "inside", position: "attention" })
      .webp({ quality })
      .toFile(file);

    const { size } = await stat(file);
    console.log(`  ${name}.webp  ${(size / 1024).toFixed(0)} KB`);
  }

  // A tiny manifest so the seed and the app can agree on what exists.
  await writeFile(
    path.join(OUT_DIR, "index.json"),
    `${JSON.stringify(Object.keys(IMAGES).sort(), null, 2)}\n`,
    "utf8",
  );

  console.log(`\nWrote ${Object.keys(IMAGES).length} images to public/catalog`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
