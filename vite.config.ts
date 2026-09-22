import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Monaco Editor — very large, isolate completely
          if (id.includes('node_modules/monaco-editor') || id.includes('@monaco-editor')) {
            return 'vendor-monaco';
          }
          // Core React runtime
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/')) {
            return 'vendor-react';
          }
          // React Query + table
          if (id.includes('@tanstack/react-query') || id.includes('@tanstack/react-table')) {
            return 'vendor-query';
          }
          // Lucide icons — large but needed across pages
          if (id.includes('lucide-react')) {
            return 'vendor-icons';
          }
          // Chart / recharts if used
          if (id.includes('recharts') || id.includes('d3-')) {
            return 'vendor-charts';
          }
        },
      },
    },
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, './shared'),
      '@web': path.resolve(__dirname, './src/web'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/v1': 'http://localhost:3000',
      '/health': 'http://localhost:3000',
    },
  },
});
