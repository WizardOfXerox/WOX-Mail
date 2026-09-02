const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

async function generateIcons() {
  const svgPath = path.join(__dirname, '..', 'public', 'brand', 'logo.svg');
  const assetsDir = path.join(__dirname, '..', 'public', 'assets');
  
  if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir, { recursive: true });
  }

  const svgBuffer = fs.readFileSync(svgPath);

  const targets = [
    { file: 'icon-192.png', size: 192, pad: 0 },
    { file: 'icon-512.png', size: 512, pad: 0 },
    { file: 'icon-maskable-192.png', size: 192, pad: 20 },
    { file: 'icon-maskable-512.png', size: 512, pad: 50 },
    { file: 'apple-touch-icon.png', size: 180, pad: 0 },
    { file: 'favicon-32x32.png', size: 32, pad: 0 },
    { file: 'favicon-16x16.png', size: 16, pad: 0 },
  ];

  for (const t of targets) {
    const dest = path.join(assetsDir, t.file);
    if (t.pad > 0) {
      // Create maskable icon with solid background and inset logo
      const innerSize = t.size - (t.pad * 2);
      const innerLogo = await sharp(svgBuffer)
        .resize(innerSize, innerSize)
        .toBuffer();

      await sharp({
        create: {
          width: t.size,
          height: t.size,
          channels: 4,
          background: { r: 11, g: 15, b: 23, alpha: 1 } // #0b0f17
        }
      })
      .composite([{ input: innerLogo, top: t.pad, left: t.pad }])
      .png()
      .toFile(dest);
    } else {
      await sharp(svgBuffer)
        .resize(t.size, t.size)
        .png()
        .toFile(dest);
    }
    console.log(`Generated: ${t.file} (${t.size}x${t.size})`);
  }

  console.log('All PWA icons generated successfully!');
}

generateIcons().catch(err => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
