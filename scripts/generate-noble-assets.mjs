import sharp from "sharp";
import { existsSync, mkdirSync, copyFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const imgSquare = "C:/Users/ASUS/.gemini/antigravity-ide/brain/ca00c0dc-0246-4305-9c84-99d3e439bad4/.user_uploaded/media_1791031596629.png";
const imgHorizontal = "C:/Users/ASUS/.gemini/antigravity-ide/brain/ca00c0dc-0246-4305-9c84-99d3e439bad4/.user_uploaded/media_1791031596638.png";

const publicDir = resolve(root, "public");
const publicImagesDir = resolve(root, "public/images");
const mobileAssets = resolve(root, "mobile/assets");
const mobileRes = resolve(root, "mobile/android/app/src/main/res");

if (!existsSync(publicImagesDir)) mkdirSync(publicImagesDir, { recursive: true });
if (!existsSync(mobileAssets)) mkdirSync(mobileAssets, { recursive: true });

// Extract transparent cutout of an image by keying out the light textured background
async function extractTransparentCutout(inputPath, minDistance = 14, maxDistance = 45) {
  const { data, info } = await sharp(inputPath).raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.from(data);

  let bgR = 0, bgG = 0, bgB = 0, borderCount = 0;
  for (let x = 0; x < info.width; x++) {
    const iTop = x * 4;
    bgR += data[iTop]; bgG += data[iTop + 1]; bgB += data[iTop + 2];
    const iBot = ((info.height - 1) * info.width + x) * 4;
    bgR += data[iBot]; bgG += data[iBot + 1]; bgB += data[iBot + 2];
    borderCount += 2;
  }
  bgR /= borderCount; bgG /= borderCount; bgB /= borderCount;

  for (let i = 0; i < out.length; i += 4) {
    const r = out[i], g = out[i + 1], b = out[i + 2];
    const dr = bgR - r;
    const dg = bgG - g;
    const db = bgB - b;
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);

    if (dist <= minDistance) {
      out[i + 3] = 0;
    } else if (dist >= maxDistance) {
      out[i + 3] = 255;
    } else {
      const alphaNorm = (dist - minDistance) / (maxDistance - minDistance);
      out[i + 3] = Math.round(alphaNorm * 255);
      const a = alphaNorm;
      out[i] = Math.min(255, Math.max(0, Math.round((r - bgR * (1 - a)) / a)));
      out[i + 1] = Math.min(255, Math.max(0, Math.round((g - bgG * (1 - a)) / a)));
      out[i + 2] = Math.min(255, Math.max(0, Math.round((b - bgB * (1 - a)) / a)));
    }
  }

  // Find bounding box
  let minX = info.width, maxX = 0, minY = info.height, maxY = 0;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const idx = (y * info.width + x) * 4;
      if (out[idx + 3] > 10) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  const croppedBuffer = await sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } })
    .extract({
      left: minX,
      top: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
    })
    .png()
    .toBuffer();

  return {
    fullBuffer: await sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer(),
    croppedBuffer,
    bbox: { minX, maxX, minY, maxY, width: maxX - minX + 1, height: maxY - minY + 1 },
  };
}

async function main() {
  console.log("Processing Noble Enclave high-resolution brand assets...");

  // 1. Process Square Emblem
  const emblemResult = await extractTransparentCutout(imgSquare, 12, 45);
  console.log("Emblem extracted. Dimensions:", emblemResult.bbox.width, "x", emblemResult.bbox.height);

  // Save transparent emblem
  await sharp(emblemResult.croppedBuffer).toFile(resolve(publicImagesDir, "noble-emblem-transparent.png"));
  await sharp(emblemResult.croppedBuffer).toFile(resolve(publicDir, "emblem.png"));
  await sharp(emblemResult.croppedBuffer).toFile(resolve(mobileAssets, "emblem-transparent.png"));

  // 2. Process Horizontal Logo
  const logoResult = await extractTransparentCutout(imgHorizontal, 14, 45);
  console.log("Horizontal logo extracted. Dimensions:", logoResult.bbox.width, "x", logoResult.bbox.height);

  await sharp(logoResult.croppedBuffer).toFile(resolve(publicImagesDir, "noble-logo-horizontal.png"));
  await sharp(logoResult.croppedBuffer).toFile(resolve(publicDir, "logo.png"));
  await sharp(logoResult.croppedBuffer).toFile(resolve(publicDir, "logo-transparent.png"));
  await sharp(logoResult.croppedBuffer).toFile(resolve(mobileAssets, "logo-horizontal.png"));

  // Also create a padded horizontal logo suitable for website headers (with nice padding)
  await sharp({
    create: {
      width: 1000,
      height: 200,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      {
        input: await sharp(logoResult.croppedBuffer).resize(860, 148, { fit: "inside" }).toBuffer(),
        gravity: "center",
      },
    ])
    .png()
    .toFile(resolve(publicImagesDir, "noble-enclave-header.png"));

  // 3. Create Square Emblems with solid backgrounds
  // Brand Wine Background: #7A2E3C
  const wineBg = { r: 122, g: 46, b: 60, alpha: 1 };
  // Warm Ivory Background: #FAF8F5
  const ivoryBg = { r: 250, g: 248, b: 245, alpha: 1 };

  // Master App Icon (1024x1024) - Mobile & Stores require NO TRANSPARENCY
  // Emblem scaled nicely inside (700x700 inside 1024x1024)
  const emblemForIcon = await sharp(emblemResult.croppedBuffer)
    .resize(680, 680, { fit: "inside" })
    .toBuffer();

  // Wine master icon
  await sharp({
    create: {
      width: 1024,
      height: 1024,
      channels: 4,
      background: wineBg,
    },
  })
    .composite([{ input: emblemForIcon, gravity: "center" }])
    .png()
    .toFile(resolve(mobileAssets, "icon.png"));

  // Adaptive icon foreground (centered with safe margins ~480px inside 1024x1024)
  const emblemForAdaptive = await sharp(emblemResult.croppedBuffer)
    .resize(500, 500, { fit: "inside" })
    .toBuffer();

  await sharp({
    create: {
      width: 1024,
      height: 1024,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: emblemForAdaptive, gravity: "center" }])
    .png()
    .toFile(resolve(mobileAssets, "android-icon-foreground.png"));

  // Adaptive icon background (solid wine)
  await sharp({
    create: {
      width: 1024,
      height: 1024,
      channels: 4,
      background: wineBg,
    },
  })
    .png()
    .toFile(resolve(mobileAssets, "android-icon-background.png"));

  // Splash screen center icon
  await sharp({
    create: {
      width: 512,
      height: 512,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: await sharp(emblemResult.croppedBuffer).resize(380, 380, { fit: "inside" }).toBuffer(), gravity: "center" }])
    .png()
    .toFile(resolve(mobileAssets, "splash-icon.png"));

  // Favicon for mobile
  await sharp({
    create: {
      width: 192,
      height: 192,
      channels: 4,
      background: wineBg,
    },
  })
    .composite([{ input: await sharp(emblemResult.croppedBuffer).resize(140, 140, { fit: "inside" }).toBuffer(), gravity: "center" }])
    .png()
    .toFile(resolve(mobileAssets, "favicon.png"));

  // 4. Web Favicons and Apple Touch Icons
  // public/icon.png (512x512)
  await sharp({
    create: {
      width: 512,
      height: 512,
      channels: 4,
      background: wineBg,
    },
  })
    .composite([{ input: await sharp(emblemResult.croppedBuffer).resize(360, 360, { fit: "inside" }).toBuffer(), gravity: "center" }])
    .png()
    .toFile(resolve(publicDir, "icon.png"));

  // public/apple-touch-icon.png (180x180)
  await sharp({
    create: {
      width: 180,
      height: 180,
      channels: 4,
      background: wineBg,
    },
  })
    .composite([{ input: await sharp(emblemResult.croppedBuffer).resize(130, 130, { fit: "inside" }).toBuffer(), gravity: "center" }])
    .png()
    .toFile(resolve(publicDir, "apple-touch-icon.png"));

  // public/favicon.ico (48x48)
  await sharp({
    create: {
      width: 48,
      height: 48,
      channels: 4,
      background: wineBg,
    },
  })
    .composite([{ input: await sharp(emblemResult.croppedBuffer).resize(36, 36, { fit: "inside" }).toBuffer(), gravity: "center" }])
    .png()
    .toFile(resolve(publicDir, "favicon.ico"));

  // Also transparent version of favicon for web if preferred
  await sharp(emblemResult.croppedBuffer)
    .resize(48, 48, { fit: "inside" })
    .png()
    .toFile(resolve(publicDir, "favicon-transparent.png"));

  // 5. Update Android native mipmaps
  const mipmaps = [
    { dir: "mipmap-mdpi", size: 48 },
    { dir: "mipmap-hdpi", size: 72 },
    { dir: "mipmap-xhdpi", size: 96 },
    { dir: "mipmap-xxhdpi", size: 144 },
    { dir: "mipmap-xxxhdpi", size: 192 },
  ];

  for (const m of mipmaps) {
    const targetDir = resolve(mobileRes, m.dir);
    if (!existsSync(targetDir)) mkdirSync(targetDir, { recursive: true });

    // Square launcher
    await sharp(resolve(mobileAssets, "icon.png"))
      .resize(m.size, m.size)
      .png()
      .toFile(resolve(targetDir, "ic_launcher.png"));

    // Round launcher with circular mask
    const circleMask = Buffer.from(
      `<svg width="${m.size}" height="${m.size}"><circle cx="${m.size / 2}" cy="${m.size / 2}" r="${m.size / 2}" fill="#fff" /></svg>`
    );
    await sharp(resolve(mobileAssets, "icon.png"))
      .resize(m.size, m.size)
      .composite([{ input: circleMask, blend: "dest-in" }])
      .png()
      .toFile(resolve(targetDir, "ic_launcher_round.png"));

    // Adaptive foreground (108dp base)
    const fgSize = Math.round((m.size / 48) * 108);
    await sharp(resolve(mobileAssets, "android-icon-foreground.png"))
      .resize(fgSize, fgSize)
      .png()
      .toFile(resolve(targetDir, "ic_launcher_foreground.png"));

    console.log(`Android ${m.dir} icons generated.`);
  }

  // 6. Update splash drawables
  const splashDrawables = [
    { dir: "drawable-mdpi", size: 100 },
    { dir: "drawable-hdpi", size: 150 },
    { dir: "drawable-xhdpi", size: 200 },
    { dir: "drawable-xxhdpi", size: 300 },
    { dir: "drawable-xxxhdpi", size: 400 },
  ];

  for (const s of splashDrawables) {
    const targetDir = resolve(mobileRes, s.dir);
    if (!existsSync(targetDir)) mkdirSync(targetDir, { recursive: true });
    await sharp(resolve(mobileAssets, "icon.png"))
      .resize(s.size, s.size)
      .png()
      .toFile(resolve(targetDir, "splashscreen_logo.png"));
  }

  // 7. Update src/app/icon.svg with high fidelity embedded emblem
  const emblemBuf = await sharp(emblemResult.croppedBuffer).resize(416, 416, { fit: "inside" }).png().toBuffer();
  const base64 = emblemBuf.toString("base64");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="Noble Enclave">
  <rect width="512" height="512" rx="112" fill="#7A2E3C" />
  <image href="data:image/png;base64,${base64}" x="48" y="48" width="416" height="416" preserveAspectRatio="xMidYMid meet" />
</svg>
`;
  const { writeFileSync } = await import("node:fs");
  writeFileSync(resolve(root, "src/app/icon.svg"), svg);
  console.log("src/app/icon.svg generated with official emblem.");

  console.log("All Noble Enclave brand assets, icons, favicons, and splash drawables successfully generated!");
}

main().catch(console.error);
