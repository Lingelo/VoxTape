import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const config: ForgeConfig = {
  packagerConfig: {
    name: 'VoxTape',
    executableName: 'voxtape',
    appBundleId: 'com.voxtape.app',
    icon: resolve(__dirname, 'assets', 'icon'),
    asar: {
      unpack: '{**/node_modules/sherpa-onnx-node/**,**/node_modules/sherpa-onnx-darwin-*/**,**/node_modules/better-sqlite3/**,**/node_modules/node-llama-cpp/**,**/node_modules/@node-llama-cpp/**,**/*.node,**/*.dylib}',
    },
    ignore: (path: string) => {
      if (!path) return false;

      // Always include package.json at root
      if (path === '/package.json') return false;

      // Include parent directories needed to reach nested targets
      if (path === '/apps') return false;
      if (path === '/apps/electron-shell') return false;

      // Include electron-shell dist (main process bundles)
      if (path.startsWith('/apps/electron-shell/dist')) return false;

      // Include renderer build output
      if (path.startsWith('/apps/electron-shell/renderer')) return false;

      // Include node_modules (native deps)
      if (path.startsWith('/node_modules')) return false;

      // Ignore everything else (source code, configs, libs, scripts, etc.)
      return true;
    },
    extendInfo: {
      NSMicrophoneUsageDescription: 'VoxTape needs microphone access to transcribe your voice.',
      NSAudioCaptureUsageDescription: 'VoxTape needs system audio access to transcribe meeting participants.',
      NSScreenCaptureUsageDescription: 'VoxTape needs screen capture access to record system audio from meetings.',
    },
    // macOS code signing (disabled for now — enable with Apple Developer cert)
    osxSign: undefined,
  },

  makers: [
    new MakerDMG({
      format: 'ULFO',
      name: 'VoxTape',
      contents: [
        { x: 130, y: 150, type: 'file', path: resolve(__dirname, 'out', 'VoxTape-darwin-arm64', 'VoxTape.app') },
        { x: 410, y: 150, type: 'link', path: '/Applications' },
      ],
      window: {
        size: { width: 540, height: 380 },
      },
      icon: resolve(__dirname, 'assets', 'icon.icns'),
    }),
    new MakerZIP({}, ['darwin', 'linux', 'win32']),
  ],
};

export default config;
