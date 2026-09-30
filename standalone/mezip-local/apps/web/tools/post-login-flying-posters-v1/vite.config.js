import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/post-login-flying-posters-v1/',
  plugins: [react()],
  build: {
    outDir: '../../public/post-login-flying-posters-v1',
    emptyOutDir: true,
  },
});
