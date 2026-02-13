/**
 * Build script for electron-shell.
 * Runs 3 Vite builds: main, preload, stt-worker.
 */
import { build } from 'vite';
import { resolve, dirname } from 'path';
import { rmSync } from 'fs';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function run() {
  // Clean dist
  rmSync(resolve(__dirname, 'dist'), { recursive: true, force: true });

  const configs = [
    { name: 'main', configFile: resolve(__dirname, 'vite.main.config.ts') },
    { name: 'preload', configFile: resolve(__dirname, 'vite.preload.config.ts') },
    { name: 'stt-worker', configFile: resolve(__dirname, 'vite.worker.config.ts') },
    { name: 'llm-worker', configFile: resolve(__dirname, 'vite.llm-worker.config.ts') },
  ];

  for (const { name, configFile } of configs) {
    console.log(`\n── Building ${name}...`);
    await build({ configFile, root: __dirname });
    console.log(`✓ ${name} built`);
  }

  console.log('\n✓ All builds complete');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
