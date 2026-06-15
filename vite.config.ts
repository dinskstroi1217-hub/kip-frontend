import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiBase = env.VITE_API_BASE_URL || 'http://2.27.86.52:3500';
  // Base path для роутера и ассетов. На GitHub Pages приложение лежит под
  // /<repo-name>/ — задаётся через VITE_BASE_PATH из workflow. В dev/preview
  // — корень.
  const basePath = env.VITE_BASE_PATH || '/';

  return {
    base: basePath,
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: 'auto',
        devOptions: { enabled: false },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api\//],
          runtimeCaching: [
            {
              urlPattern: /\/api\/drivers(\?.*)?$/,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'drivers-cache',
                networkTimeoutSeconds: 5,
                expiration: { maxEntries: 1, maxAgeSeconds: 60 * 60 * 24 },
              },
            },
            {
              urlPattern: /\/api\/equipment(\?.*)?$/,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'equipment-cache',
                networkTimeoutSeconds: 5,
                expiration: { maxEntries: 1, maxAgeSeconds: 60 * 60 * 24 },
              },
            },
          ],
        },
        manifest: {
          name: 'Спецтехника — ДКБИ',
          short_name: 'Спецтехника',
          description: 'Учёт работы спецтехники — ДКБИ',
          theme_color: '#1e3a8a',
          background_color: '#f1f5f9',
          display: 'standalone',
          orientation: 'portrait',
          start_url: basePath,
          scope: basePath,
          lang: 'ru',
          icons: [
            // purpose:'any' задан явно — чтобы Chrome/Lighthouse гарантированно
            // засчитали не-maskable иконку (не полагаемся на дефолт парсера).
            { src: `${basePath}icons/icon-192.png`.replace('//', '/'), sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: `${basePath}icons/icon-512.png`.replace('//', '/'), sizes: '512x512', type: 'image/png', purpose: 'any' },
            {
              src: `${basePath}icons/icon-512-maskable.png`.replace('//', '/'),
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      host: true,
      port: 5173,
      proxy: {
        '/api': {
          target: apiBase,
          changeOrigin: true,
          secure: false,
        },
        '/health': {
          target: apiBase,
          changeOrigin: true,
          secure: false,
        },
      },
    },
    build: {
      target: 'es2022',
      sourcemap: true,
      chunkSizeWarningLimit: 800,
    },
  };
});
