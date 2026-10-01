import sharp from "sharp";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const svgPath = resolve(root, "src/app/icon.svg");
const mobileRes = resolve(root, "mobile/android/app/src/main/res");
const mobileAssets = resolve(root, "mobile/assets");

// Full icon SVG with wine background (#7a2e3c) and cream L (#f1f0ec)
const fullIconSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="1024" height="1024">
  <rect width="64" height="64" fill="#7a2e3c" />
  <path d="M20 14h6.5v3.5h-2.5v25.5h18.5v-3h3.5v7H20v-3.5h2.5V17.5H20z" fill="#f1f0ec" />
</svg>
`;

// Round icon SVG for ic_launcher_round
const roundIconSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="1024" height="1024">
  <clipPath id="circleClip">
    <circle cx="32" cy="32" r="32" />
  </clipPath>
  <g clip-path="url(#circleClip)">
    <rect width="64" height="64" fill="#7a2e3c" />
    <path d="M20 14h6.5v3.5h-2.5v25.5h18.5v-3h3.5v7H20v-3.5h2.5V17.5H20z" fill="#f1f0ec" />
  </g>
</svg>
`;

// Adaptive foreground SVG (centered with safe margins for Android adaptive icons)
const adaptiveForegroundSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108" width="1024" height="1024">
  <g transform="translate(22, 22)">
    <!-- 64x64 centered within 108x108 safe zone -->
    <path d="M20 14h6.5v3.5h-2.5v25.5h18.5v-3h3.5v7H20v-3.5h2.5V17.5H20z" fill="#f1f0ec" />
  </g>
</svg>
`;

// Adaptive background (pure wine #7a2e3c)
const adaptiveBackgroundSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108" width="1024" height="1024">
  <rect width="108" height="108" fill="#7a2e3c" />
</svg>
`;

async function main() {
  console.log("Generating LaLuxury brand icons...");

  // 1. Assets folder for Expo
  await sharp(Buffer.from(fullIconSvg)).resize(1024, 1024).png().toFile(resolve(mobileAssets, "icon.png"));
  await sharp(Buffer.from(adaptiveForegroundSvg)).resize(1024, 1024).png().toFile(resolve(mobileAssets, "android-icon-foreground.png"));
  await sharp(Buffer.from(adaptiveBackgroundSvg)).resize(1024, 1024).png().toFile(resolve(mobileAssets, "android-icon-background.png"));
  await sharp(Buffer.from(fullIconSvg)).resize(512, 512).png().toFile(resolve(mobileAssets, "splash-icon.png"));
  await sharp(Buffer.from(fullIconSvg)).resize(192, 192).png().toFile(resolve(mobileAssets, "favicon.png"));

  console.log("Expo assets updated.");

  // 2. Android mipmaps
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
    await sharp(Buffer.from(fullIconSvg))
      .resize(m.size, m.size)
      .png()
      .toFile(resolve(targetDir, "ic_launcher.png"));

    // Round launcher
    await sharp(Buffer.from(roundIconSvg))
      .resize(m.size, m.size)
      .png()
      .toFile(resolve(targetDir, "ic_launcher_round.png"));

    // Adaptive foreground (108dp base)
    const fgSize = Math.round((m.size / 48) * 108);
    await sharp(Buffer.from(adaptiveForegroundSvg))
      .resize(fgSize, fgSize)
      .png()
      .toFile(resolve(targetDir, "ic_launcher_foreground.png"));

    console.log(`Generated ${m.dir} (${m.size}x${m.size}, fg: ${fgSize}x${fgSize})`);
  }

  // 3. Android splash drawables
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
    await sharp(Buffer.from(fullIconSvg))
      .resize(s.size, s.size)
      .png()
      .toFile(resolve(targetDir, "splashscreen_logo.png"));
    console.log(`Generated ${s.dir}/splashscreen_logo.png (${s.size}x${s.size})`);
  }

  console.log("All app icons and splash assets successfully generated with LaLuxury wine background (#7a2e3c) & serif 'L'!");
}

main().catch(console.error);
