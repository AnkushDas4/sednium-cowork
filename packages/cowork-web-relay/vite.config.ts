import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    /**
     * Dev only. Vite blocks unknown Host headers; a preview proxy (or any tunnel) then shows
     * "Blocked request". Set COWORK_DEV_ALLOWED_HOSTS to the exact hosts you intend to view -
     * e.g. ".your-preview-domain" for a sandbox - and it stays closed to everyone else.
     * The deployed app is static + serverless and never reads this file.
     */
    allowedHosts: (process.env.COWORK_DEV_ALLOWED_HOSTS || '')
      .split(',')
      .map((h) => h.trim())
      .filter(Boolean),
    proxy: {
      '/api': {
        target: 'https://cowork.sednium.com',
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 4173,
    proxy: {
      '/api': {
        target: 'https://cowork.sednium.com',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  }
});
