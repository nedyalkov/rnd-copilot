import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(() => ({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    allowedHosts: ['careful-internally-swine.ngrok-free.app'],
    proxy: {
      '/oauth': {
        target: 'http://localhost:3000',
      },
    },
  },
}));
