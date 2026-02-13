import { defineConfig } from 'vite';
import { builtinModules } from 'module';

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    lib: {
      entry: 'src/llm-worker.ts',
      formats: ['cjs'],
      fileName: () => 'llm-worker.js',
    },
    rollupOptions: {
      external: [
        'node-llama-cpp',
        ...builtinModules,
        ...builtinModules.map((m) => `node:${m}`),
      ],
    },
    sourcemap: true,
    minify: false,
    target: 'node20',
  },
});
