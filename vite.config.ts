import { defineConfig } from 'vite-plus';

export default defineConfig({
  run: {
    tasks: {
      build: {
        command: 'vp run -r build',
      },
      test: {
        command: 'vp test',
      },
      lint: {
        command: 'vp check',
      },
    },
  },
});
