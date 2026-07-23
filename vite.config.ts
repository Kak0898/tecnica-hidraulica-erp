import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(({ isSsrBuild }) => ({
  plugins: [react()],
  publicDir: isSsrBuild ? false : 'public',
  server: {
    host: '0.0.0.0',
    allowedHosts: ['.serveousercontent.com'],
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
    },
  },
}));
