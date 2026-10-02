const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const masterIcon = 'C:/Users/ASUS/.gemini/antigravity/brain/7ab48c79-1251-4f50-a419-d125b77f0fa9/nobel_enclave_master_1024.png';

async function makeIcons() {
  const masterBuffer = fs.readFileSync(masterIcon);

  // 1. Mobile assets
  await sharp(masterBuffer).resize(1024, 1024).png().toFile('mobile/assets/icon.png');
  await sharp(masterBuffer).resize(512, 512).png().toFile('mobile/assets/splash-icon.png');
  await sharp(masterBuffer).resize(48, 48).png().toFile('mobile/assets/favicon.png');

  // Background for Android adaptive icon
  await sharp({
    create: {
      width: 1024,
      height: 1024,
      channels: 4,
      background: { r: 62, g: 4, b: 22, alpha: 1 }
    }
  }).png().toFile('mobile/assets/android-icon-background.png');

  // Foreground for Android adaptive icon (padded to fit inside the adaptive icon safe circle)
  const fgInnerSize = Math.round(1024 * 0.72);
  const fgInner = await sharp(masterBuffer).resize(fgInnerSize, fgInnerSize).png().toBuffer();
  const pad = Math.round((1024 - fgInnerSize) / 2);
  await sharp({
    create: {
      width: 1024,
      height: 1024,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
  .composite([{ input: fgInner, top: pad, left: pad }])
  .png()
  .toFile('mobile/assets/android-icon-foreground.png');

  // Mipmap sizes for Android
  const mipmaps = [
    { dir: 'mipmap-mdpi', icon: 48, fg: 108 },
    { dir: 'mipmap-hdpi', icon: 72, fg: 162 },
    { dir: 'mipmap-xhdpi', icon: 96, fg: 216 },
    { dir: 'mipmap-xxhdpi', icon: 144, fg: 324 },
    { dir: 'mipmap-xxxhdpi', icon: 192, fg: 432 },
  ];

  for (const m of mipmaps) {
    const dir = path.join('mobile/android/app/src/main/res', m.dir);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    // ic_launcher.png
    await sharp(masterBuffer).resize(m.icon, m.icon).png().toFile(path.join(dir, 'ic_launcher.png'));

    // ic_launcher_round.png
    const r = m.icon / 2;
    const circleSvg = Buffer.from(
      '<svg width="' + m.icon + '" height="' + m.icon + '"><circle cx="' + r + '" cy="' + r + '" r="' + r + '" fill="#fff"/></svg>'
    );
    await sharp(masterBuffer)
      .resize(m.icon, m.icon)
      .composite([{ input: circleSvg, blend: 'dest-in' }])
      .png()
      .toFile(path.join(dir, 'ic_launcher_round.png'));

    // ic_launcher_foreground.png
    const fgScale = Math.round(m.fg * 0.72);
    const fgResized = await sharp(masterBuffer).resize(fgScale, fgScale).png().toBuffer();
    const fgPad = Math.round((m.fg - fgScale) / 2);
    await sharp({
      create: {
        width: m.fg,
        height: m.fg,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      }
    })
    .composite([{ input: fgResized, top: fgPad, left: fgPad }])
    .png()
    .toFile(path.join(dir, 'ic_launcher_foreground.png'));
  }

  // Web icons
  await sharp(masterBuffer).resize(512, 512).png().toFile('src/app/icon.png');
  await sharp(masterBuffer).resize(180, 180).png().toFile('src/app/apple-icon.png');
  await sharp(masterBuffer).resize(48, 48).png().toFile('public/icon.png');

  console.log('All icons generated successfully!');
}

makeIcons().catch(console.error);
