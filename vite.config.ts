import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import { categorizeRoute } from './server/categorizeRoute';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || env.GEMINI_API_KEY;

  const categorizePlugin = {
    name: 'categorize-route',
    configureServer(server: { middlewares: { use: (fn: unknown) => void } }) {
      server.middlewares.use(categorizeRoute);
    },
    configurePreviewServer(server: { middlewares: { use: (fn: unknown) => void } }) {
      server.middlewares.use(categorizeRoute);
    },
  };

  return {
    plugins: [react(), tailwindcss(), categorizePlugin],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify-file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      allowedHosts: [
        'localhost',
        '.ngrok-free.dev',
      ],
    },
    preview: {
      port: 4173,
      strictPort: false,
    },
  };
});
