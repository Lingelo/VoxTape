/**
 * Generate macOS .icns icon from the SVG logo.
 * Uses sips (built-in macOS tool) to create the iconset, then iconutil to produce .icns.
 */
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const assetsDir = join(rootDir, 'assets');
const iconsetDir = join(assetsDir, 'icon.iconset');
const icnsPath = join(assetsDir, 'icon.icns');

// SVG content - VoxTape VU meter logo (scaled to 1024x1024 from 128x128)
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" fill="none">
  <!-- Background with rounded corners for macOS icon -->
  <rect width="1024" height="1024" rx="224" fill="#1a1a1a"/>

  <!-- VU Meter frame (scaled 8x from 128) -->
  <rect x="96" y="96" width="832" height="832" fill="#0a0a0a" stroke="#333" stroke-width="24"/>

  <!-- Left bar (5 segments) -->
  <rect x="192" y="672" width="160" height="48" fill="#dd0000"/>
  <rect x="192" y="592" width="160" height="48" fill="#dd0000"/>
  <rect x="192" y="512" width="160" height="48" fill="#dd0000"/>
  <rect x="192" y="432" width="160" height="48" fill="#dd0000"/>
  <rect x="192" y="352" width="160" height="48" fill="#dd0000"/>
  <!-- Highlights -->
  <rect x="224" y="672" width="96" height="48" fill="#ff4444"/>
  <rect x="224" y="592" width="96" height="48" fill="#ff5555"/>
  <rect x="224" y="512" width="96" height="48" fill="#ff6666"/>
  <rect x="224" y="432" width="96" height="48" fill="#ff5555"/>
  <rect x="224" y="352" width="96" height="48" fill="#ff4444"/>

  <!-- Center bar (7 segments) -->
  <rect x="432" y="752" width="160" height="48" fill="#dd0000"/>
  <rect x="432" y="672" width="160" height="48" fill="#dd0000"/>
  <rect x="432" y="592" width="160" height="48" fill="#dd0000"/>
  <rect x="432" y="512" width="160" height="48" fill="#dd0000"/>
  <rect x="432" y="432" width="160" height="48" fill="#dd0000"/>
  <rect x="432" y="352" width="160" height="48" fill="#dd0000"/>
  <rect x="432" y="272" width="160" height="48" fill="#dd0000"/>
  <!-- Highlights -->
  <rect x="464" y="752" width="96" height="48" fill="#ff3333"/>
  <rect x="464" y="672" width="96" height="48" fill="#ff4444"/>
  <rect x="464" y="592" width="96" height="48" fill="#ff5555"/>
  <rect x="464" y="512" width="96" height="48" fill="#ff6666"/>
  <rect x="464" y="432" width="96" height="48" fill="#ff5555"/>
  <rect x="464" y="352" width="96" height="48" fill="#ff4444"/>
  <rect x="464" y="272" width="96" height="48" fill="#ff3333"/>

  <!-- Right bar (5 segments) -->
  <rect x="672" y="672" width="160" height="48" fill="#dd0000"/>
  <rect x="672" y="592" width="160" height="48" fill="#dd0000"/>
  <rect x="672" y="512" width="160" height="48" fill="#dd0000"/>
  <rect x="672" y="432" width="160" height="48" fill="#dd0000"/>
  <rect x="672" y="352" width="160" height="48" fill="#dd0000"/>
  <!-- Highlights -->
  <rect x="704" y="672" width="96" height="48" fill="#ff4444"/>
  <rect x="704" y="592" width="96" height="48" fill="#ff5555"/>
  <rect x="704" y="512" width="96" height="48" fill="#ff6666"/>
  <rect x="704" y="432" width="96" height="48" fill="#ff5555"/>
  <rect x="704" y="352" width="96" height="48" fill="#ff4444"/>

  <!-- VT text centered - V as diagonal (scaled 8x) -->
  <!-- V -->
  <rect x="288" y="480" width="48" height="48" fill="#4ade80"/>
  <rect x="304" y="528" width="48" height="48" fill="#4ade80"/>
  <rect x="320" y="576" width="48" height="48" fill="#4ade80"/>
  <rect x="352" y="624" width="48" height="48" fill="#4ade80"/>
  <rect x="384" y="576" width="48" height="48" fill="#4ade80"/>
  <rect x="400" y="528" width="48" height="48" fill="#4ade80"/>
  <rect x="416" y="480" width="48" height="48" fill="#4ade80"/>

  <!-- T -->
  <rect x="528" y="480" width="192" height="48" fill="#4ade80"/>
  <rect x="592" y="480" width="64" height="192" fill="#4ade80"/>
</svg>`;

// Required icon sizes for macOS .icns
const sizes = [16, 32, 64, 128, 256, 512, 1024];

function run() {
  // Clean up previous
  if (existsSync(iconsetDir)) rmSync(iconsetDir, { recursive: true });
  mkdirSync(iconsetDir, { recursive: true });

  // Write full-size SVG as a temp file
  const svgPath = join(assetsDir, 'icon-tmp.svg');
  writeFileSync(svgPath, svg);

  // Convert SVG to 1024px PNG using sips (via a temp HTML approach won't work, use rsvg-convert or sips)
  // macOS doesn't natively convert SVG with sips. We'll use qlmanage or a canvas approach.
  // Simplest: write a small HTML, use Electron itself, or use the `convert` if available.
  // For maximum portability, let's create PNGs with a simple approach using `rsvg-convert` or `sips`.

  // Try rsvg-convert first (from librsvg, via brew), fallback to qlmanage
  let pngBase;
  try {
    // Check if rsvg-convert exists
    execSync('which rsvg-convert', { stdio: 'pipe' });
    pngBase = join(assetsDir, 'icon-1024.png');
    execSync(`rsvg-convert -w 1024 -h 1024 "${svgPath}" -o "${pngBase}"`);
  } catch {
    // Fallback: use qlmanage to generate thumbnail from SVG
    try {
      pngBase = join(assetsDir, 'icon-1024.png');
      execSync(`qlmanage -t -s 1024 -o "${assetsDir}" "${svgPath}" 2>/dev/null`);
      // qlmanage outputs to icon-tmp.svg.png
      const qlOutput = join(assetsDir, 'icon-tmp.svg.png');
      if (existsSync(qlOutput)) {
        execSync(`mv "${qlOutput}" "${pngBase}"`);
      } else {
        throw new Error('qlmanage output not found');
      }
    } catch {
      console.error('Neither rsvg-convert nor qlmanage could generate PNG from SVG.');
      console.error('Install librsvg: brew install librsvg');
      process.exit(1);
    }
  }

  // Generate all required sizes
  for (const size of sizes) {
    const name = size === 1024 ? `icon_512x512@2x.png` :
                 `icon_${size}x${size}.png`;
    const outPath = join(iconsetDir, name);
    execSync(`sips -z ${size} ${size} "${pngBase}" --out "${outPath}" 2>/dev/null`);

    // Also generate @2x variants (except for 1024 which is already 512@2x)
    if (size <= 512 && size >= 32) {
      const retinaName = `icon_${size / 2}x${size / 2}@2x.png`;
      const retinaPath = join(iconsetDir, retinaName);
      execSync(`sips -z ${size} ${size} "${pngBase}" --out "${retinaPath}" 2>/dev/null`);
    }
  }

  // Generate .icns
  execSync(`iconutil -c icns "${iconsetDir}" -o "${icnsPath}"`);

  // Cleanup
  rmSync(iconsetDir, { recursive: true, force: true });
  rmSync(svgPath, { force: true });
  rmSync(pngBase, { force: true });

  console.log(`✓ Icon generated: ${icnsPath}`);
}

run();
