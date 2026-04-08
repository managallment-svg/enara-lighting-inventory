import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv, type PluginOption} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  const isTauriDesktopBuild =
    Boolean(process.env.TAURI_ENV_PLATFORM) || process.env.ENARA_DESKTOP_BUILD === '1';

  const plugins: PluginOption[] = [
    react(),
    tailwindcss(),
  ];

  if (!isTauriDesktopBuild) {
    plugins.push(
      VitePWA({
        registerType: 'autoUpdate',
        manifestFilename: 'manifest.webmanifest',
        includeAssets: ['apple-touch-icon.png', 'icon-192.png', 'icon-512.png'],
        workbox: {
          cleanupOutdatedCaches: true,
          navigateFallback: 'index.html',
          globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,json,woff2}'],
        },
        manifest: {
          id: './',
          name: 'إدارة مخازن إنارة',
          short_name: 'مخازن إنارة',
          description: 'نظام لإدارة مخازن الإنارة والمخزون والحركات المخزنية.',
          theme_color: '#004d40',
          background_color: '#f2f7f5',
          display: 'standalone',
          orientation: 'portrait',
          start_url: './',
          scope: './',
          lang: 'ar',
          dir: 'rtl',
          icons: [
            {
              src: 'icon-192.png',
              sizes: '192x192',
              type: 'image/png',
            },
            {
              src: 'icon-512.png',
              sizes: '512x512',
              type: 'image/png',
            },
            {
              src: 'icon-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any maskable',
            },
            {
              src: 'apple-touch-icon.png',
              sizes: '180x180',
              type: 'image/png',
            },
          ],
        },
      }),
    );
  }

  return {
    base: './',
    plugins,
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      hmr: process.env.DISABLE_HMR !== 'true',
    },
    preview: {
      host: '0.0.0.0',
      port: 4173,
    },
  };
});