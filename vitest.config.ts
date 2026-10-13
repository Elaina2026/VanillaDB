import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    testTimeout: 25000,
    hookTimeout: 30000,
    fileParallelism: false,
    environment: 'node',
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, './shared'),
      '@web': path.resolve(__dirname, './src/web'),
    },
  },
});
