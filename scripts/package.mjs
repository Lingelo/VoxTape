/**
 * Packaging script for Sourdine.
 *
 * 1. Builds the Angular renderer
 * 2. Builds the Electron main/preload/workers
 * 3. Copies the renderer output to where main.ts expects it in production
 * 4. Runs electron-forge package or make
 *
 * Usage:
 *   node scripts/package.mjs          → electron-forge package
 *   node scripts/package.mjs --make   → electron-forge make (DMG/ZIP)
 */
import { execSync } from 'child_process';
import { cpSync, rmSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const shouldMake = process.argv.includes('--make');

function run(cmd, label) {
  console.log(`\n── ${label}...`);
  execSync(cmd, { cwd: root, stdio: 'inherit' });
  console.log(`✓ ${label} done`);
}

// 1. Generate .icns icon if missing
const icnsPath = resolve(root, 'assets/icon.icns');
if (!existsSync(icnsPath)) {
  run('node scripts/generate-icon.mjs', 'Generating .icns icon');
} else {
  console.log('\n✓ .icns icon exists');
}

// 2. Build renderer (Angular)
run(
  'NX_IGNORE_UNSUPPORTED_TS_SETUP=true npx nx build renderer --configuration=production',
  'Building renderer'
);

// 3. Build electron-shell (main, preload, workers)
run('node apps/electron-shell/build.mjs', 'Building electron-shell');

// 4. Copy renderer output to apps/electron-shell/renderer/
const rendererSrc = resolve(root, 'dist/apps/renderer/browser');
const rendererDest = resolve(root, 'apps/electron-shell/renderer');

if (existsSync(rendererDest)) {
  rmSync(rendererDest, { recursive: true });
}

if (!existsSync(rendererSrc)) {
  console.error(`\n✗ Renderer build output not found at ${rendererSrc}`);
  process.exit(1);
}

console.log('\n── Copying renderer to electron-shell/renderer/...');
cpSync(rendererSrc, rendererDest, { recursive: true });
console.log('✓ Renderer copied');

// 5. Run Electron Forge
if (shouldMake) {
  run('npx electron-forge make', 'Electron Forge make (DMG/ZIP)');
} else {
  run('npx electron-forge package', 'Electron Forge package');
}

// 6. Cleanup temporary renderer copy
if (existsSync(rendererDest)) {
  rmSync(rendererDest, { recursive: true });
  console.log('✓ Cleaned up temporary renderer copy');
}

console.log('\n✓ Packaging complete!');
if (shouldMake) {
  console.log('  Distributables: out/make/');
} else {
  console.log('  App: out/Sourdine-darwin-*/Sourdine.app');
}
