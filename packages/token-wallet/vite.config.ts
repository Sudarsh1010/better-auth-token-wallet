import { defineConfig } from 'vite-plus';

export default defineConfig({
  pack: {
    entry: ['./src/index.ts', './src/client.ts', './src/types.ts'],
    dts: true,
    format: ['esm'],
    sourcemap: true,
    deps: {
      neverBundle: ['better-auth', 'better-call', '@better-fetch/fetch']
    }
  }
});
