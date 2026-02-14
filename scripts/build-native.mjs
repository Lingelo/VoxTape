/**
 * Build native-audio-capture module if Rust is available.
 * Used by `npm run dev` — fails gracefully if Rust isn't installed.
 */
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const arch = process.arch === 'x64' ? 'x86_64' : 'arm64';
const nativeNodeFile = resolve(root, `libs/native-audio-capture/native-audio-capture.darwin-${arch}.node`);

if (existsSync(nativeNodeFile)) {
  console.log('✓ native-audio-capture already built');
  process.exit(0);
}

// Check if Rust is installed
try {
  execSync('cargo --version', { stdio: 'ignore' });
} catch {
  console.warn('⚠ Rust not installed — system audio capture disabled');
  console.warn('  Install: curl --proto "=https" --tlsv1.2 -sSf https://sh.rustup.rs | sh');
  process.exit(0); // Don't fail dev mode
}

// Build the native module
console.log('── Building native-audio-capture...');
try {
  execSync('npm run build:native', { cwd: root, stdio: 'inherit' });
  console.log('✓ native-audio-capture built');
} catch (err) {
  console.error('✗ Failed to build native-audio-capture:', err.message);
  console.warn('  System audio capture will be disabled');
  process.exit(0); // Don't fail dev mode
}
