import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev: proxy /api to the local CareLink API so the SPA and API share an origin.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_API_TARGET || 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
});
