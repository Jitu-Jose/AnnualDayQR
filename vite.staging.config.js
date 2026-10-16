import { defineConfig } from 'vite';

// A separate build command; the existing Pages job continues building index.html.
export default defineConfig({ base:'./',build:{ target:'es2022',outDir:'dist-staging',
  rollupOptions:{ input:'staging.html' } } });
