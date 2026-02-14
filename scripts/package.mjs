/**
 * Packaging script for Sourdine.
 *
 * 1. Builds native audio capture module (Rust napi-rs) if needed
 * 2. Builds the Angular renderer
 * 3. Builds the Electron main/preload/workers
 * 4. Copies the renderer output to where main.ts expects it in production
 * 5. Replaces workspace symlink with real files for native-audio-capture
 * 6. Runs electron-forge package or make
 * 7. Restores workspace symlink for dev mode
 *
 * Usage:
 *   node scripts/package.mjs          → electron-forge package
 *   node scripts/package.mjs --make   → electron-forge make (DMG/ZIP)
 */
import { execSync } from 'child_process';
import { cpSync, rmSync, existsSync, lstatSync, unlinkSync, symlinkSync } from 'fs';
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

// 2. Build native audio capture module (Rust → .node) — skip if already built
const nativeNodeFile = resolve(root, 'libs/native-audio-capture/native-audio-capture.darwin-arm64.node');
if (!existsSync(nativeNodeFile)) {
  run('npm run build:native', 'Building native-audio-capture');
} else {
  console.log('\n✓ native-audio-capture .node binary exists, skipping Rust build');
}

// 3. Build renderer (Angular)
run(
  'NX_IGNORE_UNSUPPORTED_TS_SETUP=true npx nx build renderer --configuration=production',
  'Building renderer'
);

// 4. Build electron-shell (main, preload, workers)
run('node apps/electron-shell/build.mjs', 'Building electron-shell');

// 5. Copy renderer output to apps/electron-shell/renderer/
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

// 6. Replace workspace symlink with real files for native-audio-capture
//    ASAR doesn't preserve symlinks, so we must copy the actual files into node_modules.
const nativeSymlink = resolve(root, 'node_modules/@sourdine/native-audio-capture');
const nativeSource = resolve(root, 'libs/native-audio-capture');
let needsSymlinkRestore = false;

try {
  const stat = lstatSync(nativeSymlink);
  if (stat.isSymbolicLink()) {
    console.log('\n── Replacing native-audio-capture symlink with copy (runtime files only)...');
    unlinkSync(nativeSymlink);
    cpSync(nativeSource, nativeSymlink, {
      recursive: true,
      filter: (src) => {
        const rel = src.slice(nativeSource.length);
        if (!rel) return true; // root dir itself
        if (rel.startsWith('/target')) return false;
        if (rel.startsWith('/src')) return false;
        if (rel.startsWith('/npm')) return false;
        if (rel.startsWith('/.napi')) return false;
        if (['/Cargo.toml', '/Cargo.lock', '/build.rs', '/.gitignore'].includes(rel)) return false;
        return true;
      },
    });
    needsSymlinkRestore = true;
    console.log('✓ native-audio-capture copied to node_modules (runtime only)');
  }
} catch (e) {
  console.warn(`⚠ Could not replace symlink: ${e.message}`);
}

// 7. Run Electron Forge
try {
  if (shouldMake) {
    run('npx electron-forge make', 'Electron Forge make (DMG/ZIP)');
  } else {
    run('npx electron-forge package', 'Electron Forge package');
  }
} finally {
  // 8. Always restore symlink for dev mode (even if forge fails)
  if (needsSymlinkRestore) {
    rmSync(nativeSymlink, { recursive: true, force: true });
    symlinkSync('../../libs/native-audio-capture', nativeSymlink);
    console.log('✓ Restored native-audio-capture symlink');
  }

  // 9. Cleanup temporary renderer copy
  if (existsSync(rendererDest)) {
    rmSync(rendererDest, { recursive: true });
    console.log('✓ Cleaned up temporary renderer copy');
  }
}

console.log('\n✓ Packaging complete!');
if (shouldMake) {
  console.log('  Distributables: out/make/');
} else {
  console.log('  App: out/Sourdine-darwin-*/Sourdine.app');
}
