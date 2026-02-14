import { defineConfig } from 'vite';
import { builtinModules } from 'module';

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    lib: {
      entry: 'src/main.ts',
      formats: ['cjs'],
      fileName: () => 'main.js',
    },
    rollupOptions: {
      external: [
        'electron',
        'sherpa-onnx',
        'node-llama-cpp',
        'better-sqlite3',
        '@nestjs/core',
        '@nestjs/common',
        'reflect-metadata',
        'rxjs',
        '@sourdine/native-audio-capture',
        ...builtinModules,
        ...builtinModules.map((m) => `node:${m}`),
      ],
    },
    sourcemap: true,
    minify: false,
    target: 'node20',
  },
  resolve: {
    conditions: ['@sourdine/source', 'import', 'require', 'default'],
  },
});
