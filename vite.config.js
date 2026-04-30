import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: { outDir: '../dist' },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api':   'http://localhost:8000',
      '/auth':  'http://localhost:8000',
      '/admin': 'http://localhost:8000',
    },
  },
});
