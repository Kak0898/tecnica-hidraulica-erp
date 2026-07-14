import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(({ isSsrBuild }) => ({
  plugins: [react()],
  publicDir: isSsrBuild ? false : 'public',
  server: {
    allowedHosts: ['.serveousercontent.com'],
  },
}));
