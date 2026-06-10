import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    fs: {
      // allow importing seed data from the repo-level /data directory in dev
      allow: ['..'],
    },
  },
});
