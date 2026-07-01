import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
  },
  server: {
    port: 5173,
    proxy: {
      '/hermes-api': {
        target: 'http://192.168.1.50:9120',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/hermes-api/, ''),
      },
      '/hermes-ws': {
        target: 'http://192.168.1.50:9119',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/hermes-ws/, ''),
      },
      '/hermes-jobs': {
        target: 'http://192.168.1.50:8642',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/hermes-jobs/, ''),
      },
    },
  },
});
