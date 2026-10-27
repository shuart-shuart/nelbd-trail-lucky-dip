import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
export default defineConfig({plugins:[react(),tailwindcss()],build:{outDir:'dist-safe-preview',emptyOutDir:true,rollupOptions:{input:path.resolve(process.cwd(),'safe-preview.html')}}});
