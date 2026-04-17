/**
 * Ensure Electron's binary is installed.
 * If `node_modules/electron/path.txt` is missing (e.g. lifecycle scripts were
 * skipped by a user-level `ignore-scripts=true`), run Electron's own installer.
 */
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const electronDir = resolve(root, 'node_modules/electron');
const pathTxt = resolve(electronDir, 'path.txt');
const installScript = resolve(electronDir, 'install.js');

if (!existsSync(electronDir)) {
  console.error('✗ node_modules/electron is missing — run `npm install` first');
  process.exit(1);
}

if (existsSync(pathTxt)) {
  process.exit(0);
}

console.log('── Electron binary missing, running install.js...');
try {
  execSync(`node "${installScript}"`, { cwd: electronDir, stdio: 'inherit' });
  console.log('✓ Electron binary installed');
} catch (err) {
  console.error('✗ Failed to install Electron binary:', err.message);
  console.error('  Try: rm -rf node_modules/electron && npm install');
  process.exit(1);
}
