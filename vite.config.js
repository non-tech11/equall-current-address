import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5199 },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        v2: resolve(__dirname, 'v2.html'),
      },
    },
  },
});
