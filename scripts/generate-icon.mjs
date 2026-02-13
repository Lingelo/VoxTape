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

// SVG content (same as logo.svg but with solid background for icon)
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" fill="none">
  <rect width="1024" height="1024" rx="224" fill="#1a1a1a"/>
  <path d="M304 416c-32 32-48 72-48 112s16 80 48 112" stroke="#4ade80" stroke-width="24" stroke-linecap="round" fill="none" opacity="0.5"/>
  <path d="M352 448c-20 20-32 48-32 72s12 52 32 72" stroke="#4ade80" stroke-width="24" stroke-linecap="round" fill="none" opacity="0.75"/>
  <rect x="448" y="320" width="128" height="256" rx="64" fill="#4ade80"/>
  <rect x="448" y="320" width="128" height="80" rx="64" fill="#3bc96f"/>
  <path d="M512 608v96" stroke="#4ade80" stroke-width="24" stroke-linecap="round"/>
  <path d="M448 704h128" stroke="#4ade80" stroke-width="24" stroke-linecap="round"/>
  <path d="M672 448c20 20 32 48 32 72s-12 52-32 72" stroke="#4ade80" stroke-width="24" stroke-linecap="round" fill="none" opacity="0.75"/>
  <path d="M720 416c32 32 48 72 48 112s-16 80-48 112" stroke="#4ade80" stroke-width="24" stroke-linecap="round" fill="none" opacity="0.5"/>
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
