import { defineConfig } from 'vite';

export default defineConfig({
  // Use relative base path so static assets load correctly on GitHub Pages
  base: './',
  build: {
    outDir: 'dist',
  }
});
