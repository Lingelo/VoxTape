import { defineConfig } from 'vite';
import { builtinModules } from 'module';

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    lib: {
      entry: 'src/stt-worker.ts',
      formats: ['cjs'],
      fileName: () => 'stt-worker.js',
    },
    rollupOptions: {
      external: [
        'sherpa-onnx-node',
        ...builtinModules,
        ...builtinModules.map((m) => `node:${m}`),
      ],
    },
    sourcemap: true,
    minify: false,
    target: 'node20',
  },
});
