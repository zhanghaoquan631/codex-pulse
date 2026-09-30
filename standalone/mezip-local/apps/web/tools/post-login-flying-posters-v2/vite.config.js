import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/post-login-flying-posters-v2/',
  plugins: [react()],
  build: {
    outDir: '../../public/post-login-flying-posters-v2',
    emptyOutDir: true,
  },
});
