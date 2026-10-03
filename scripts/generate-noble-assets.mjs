import sharp from "sharp";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
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

// Transform RGBA buffer into pure white (RGB=255,255,255) while keeping anti-aliased alpha
async function makePureWhite(pngBuffer) {
  const { data, info } = await sharp(pngBuffer).raw().toBuffer({ resolveWithObject: true });
  const whiteData = Buffer.from(data);
  for (let i = 0; i < whiteData.length; i += 4) {
    whiteData[i] = 255;
    whiteData[i + 1] = 255;
    whiteData[i + 2] = 255;
    // preserve alpha at i + 3
  }
  return sharp(whiteData, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toBuffer();
}

async function main() {
  console.log("Processing Noble Enclave high-resolution brand assets...");

  // 1. Process Square Emblem (Gold)
  const emblemResult = await extractTransparentCutout(imgSquare, 12, 45);
  console.log("Gold emblem extracted. Dimensions:", emblemResult.bbox.width, "x", emblemResult.bbox.height);

  // Save transparent gold emblem
  await sharp(emblemResult.croppedBuffer).toFile(resolve(publicImagesDir, "noble-emblem-transparent.png"));
  await sharp(emblemResult.croppedBuffer).toFile(resolve(publicDir, "emblem.png"));
  await sharp(emblemResult.croppedBuffer).toFile(resolve(mobileAssets, "emblem-transparent.png"));

  // 2. Generate Pure White Emblem (for app icon, favicons, dark/wine backgrounds)
  const whiteEmblemBuffer = await makePureWhite(emblemResult.croppedBuffer);
  await sharp(whiteEmblemBuffer).toFile(resolve(publicImagesDir, "noble-emblem-white.png"));
  await sharp(whiteEmblemBuffer).toFile(resolve(publicDir, "emblem-white.png"));
  await sharp(whiteEmblemBuffer).toFile(resolve(mobileAssets, "emblem-white.png"));
  console.log("Pure white emblem generated.");

  // 3. Process Horizontal Logo
  const logoResult = await extractTransparentCutout(imgHorizontal, 14, 45);
  console.log("Horizontal logo extracted. Dimensions:", logoResult.bbox.width, "x", logoResult.bbox.height);

  await sharp(logoResult.croppedBuffer).toFile(resolve(publicImagesDir, "noble-logo-horizontal.png"));
  await sharp(logoResult.croppedBuffer).toFile(resolve(publicDir, "logo.png"));
  await sharp(logoResult.croppedBuffer).toFile(resolve(publicDir, "logo-transparent.png"));
  await sharp(logoResult.croppedBuffer).toFile(resolve(mobileAssets, "logo-horizontal.png"));

  // Horizontal logo with white text & white emblem for dark headers
  const whiteLogoBuffer = await makePureWhite(logoResult.croppedBuffer);
  await sharp(whiteLogoBuffer).toFile(resolve(publicImagesDir, "noble-logo-white.png"));

  // Padded horizontal logo for website headers
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

  // 4. Create App Icons and Favicons with WHITE emblem against Noble Enclave Wine (#7A2E3C)
  const wineBg = { r: 122, g: 46, b: 60, alpha: 1 };

  // Master App Icon (1024x1024) - White emblem on solid wine background
  const whiteEmblemForIcon = await sharp(whiteEmblemBuffer)
    .resize(680, 680, { fit: "inside" })
    .toBuffer();

  await sharp({
    create: {
      width: 1024,
      height: 1024,
      channels: 4,
      background: wineBg,
    },
  })
    .composite([{ input: whiteEmblemForIcon, gravity: "center" }])
    .png()
    .toFile(resolve(mobileAssets, "icon.png"));

  // Android adaptive icon foreground (centered with safe margins ~490px inside 1024x1024)
  const whiteEmblemForAdaptive = await sharp(whiteEmblemBuffer)
    .resize(490, 490, { fit: "inside" })
    .toBuffer();

  await sharp({
    create: {
      width: 1024,
      height: 1024,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: whiteEmblemForAdaptive, gravity: "center" }])
    .png()
    .toFile(resolve(mobileAssets, "android-icon-foreground.png"));

  // Android adaptive icon background (solid wine #7A2E3C)
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

  // Android monochrome icon
  await sharp({
    create: {
      width: 1024,
      height: 1024,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: whiteEmblemForAdaptive, gravity: "center" }])
    .png()
    .toFile(resolve(mobileAssets, "android-icon-monochrome.png"));

  // Splash screen center icon (white emblem, crisp on wine background)
  await sharp({
    create: {
      width: 512,
      height: 512,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: await sharp(whiteEmblemBuffer).resize(380, 380, { fit: "inside" }).toBuffer(), gravity: "center" }])
    .png()
    .toFile(resolve(mobileAssets, "splash-icon.png"));

  // Favicon for mobile (192x192: white emblem on wine)
  await sharp({
    create: {
      width: 192,
      height: 192,
      channels: 4,
      background: wineBg,
    },
  })
    .composite([{ input: await sharp(whiteEmblemBuffer).resize(140, 140, { fit: "inside" }).toBuffer(), gravity: "center" }])
    .png()
    .toFile(resolve(mobileAssets, "favicon.png"));

  // 5. Web Favicons with WHITE emblem against wine background
  // public/icon.png (512x512)
  await sharp({
    create: {
      width: 512,
      height: 512,
      channels: 4,
      background: wineBg,
    },
  })
    .composite([{ input: await sharp(whiteEmblemBuffer).resize(360, 360, { fit: "inside" }).toBuffer(), gravity: "center" }])
    .png()
    .toFile(resolve(publicDir, "icon.png"));

  // public/apple-touch-icon.png (180x180: white emblem on wine)
  await sharp({
    create: {
      width: 180,
      height: 180,
      channels: 4,
      background: wineBg,
    },
  })
    .composite([{ input: await sharp(whiteEmblemBuffer).resize(130, 130, { fit: "inside" }).toBuffer(), gravity: "center" }])
    .png()
    .toFile(resolve(publicDir, "apple-touch-icon.png"));

  // public/favicon.ico (48x48: white emblem on wine)
  await sharp({
    create: {
      width: 48,
      height: 48,
      channels: 4,
      background: wineBg,
    },
  })
    .composite([{ input: await sharp(whiteEmblemBuffer).resize(36, 36, { fit: "inside" }).toBuffer(), gravity: "center" }])
    .png()
    .toFile(resolve(publicDir, "favicon.ico"));

  // public/favicon-transparent.png (48x48: white emblem on transparent)
  await sharp(whiteEmblemBuffer)
    .resize(48, 48, { fit: "inside" })
    .png()
    .toFile(resolve(publicDir, "favicon-transparent.png"));

  // 6. Update Android native mipmaps (White emblem on wine background)
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

    // Square launcher (white emblem on wine)
    await sharp(resolve(mobileAssets, "icon.png"))
      .resize(m.size, m.size)
      .png()
      .toFile(resolve(targetDir, "ic_launcher.png"));

    // Round launcher with circular mask (white emblem on wine)
    const circleMask = Buffer.from(
      `<svg width="${m.size}" height="${m.size}"><circle cx="${m.size / 2}" cy="${m.size / 2}" r="${m.size / 2}" fill="#fff" /></svg>`
    );
    await sharp(resolve(mobileAssets, "icon.png"))
      .resize(m.size, m.size)
      .composite([{ input: circleMask, blend: "dest-in" }])
      .png()
      .toFile(resolve(targetDir, "ic_launcher_round.png"));

    // Adaptive foreground (white emblem on transparent, 108dp base)
    const fgSize = Math.round((m.size / 48) * 108);
    await sharp(resolve(mobileAssets, "android-icon-foreground.png"))
      .resize(fgSize, fgSize)
      .png()
      .toFile(resolve(targetDir, "ic_launcher_foreground.png"));

    console.log(`Android ${m.dir} icons generated with white emblem.`);
  }

  // 7. Update splash drawables (white emblem)
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

  // 8. Update src/app/icon.svg with white emblem on wine background
  const whiteEmblemBuf = await sharp(whiteEmblemBuffer).resize(416, 416, { fit: "inside" }).png().toBuffer();
  const base64White = whiteEmblemBuf.toString("base64");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="Noble Enclave">
  <rect width="512" height="512" rx="112" fill="#7A2E3C" />
  <image href="data:image/png;base64,${base64White}" x="48" y="48" width="416" height="416" preserveAspectRatio="xMidYMid meet" />
</svg>
`;
  writeFileSync(resolve(root, "src/app/icon.svg"), svg);
  console.log("src/app/icon.svg generated with white emblem on wine background.");

  console.log("All app icons and favicons successfully updated to WHITE logo icon against backgrounds!");
}

main().catch(console.error);
