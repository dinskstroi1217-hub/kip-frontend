import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { viteSingleFile } from 'vite-plugin-singlefile';
import path from 'node:path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiBase = env.VITE_API_BASE_URL || 'http://2.27.86.52:3500';
  // Base path для роутера и ассетов. На GitHub Pages приложение лежит под
  // /<repo-name>/ — задаётся через VITE_BASE_PATH из workflow. В dev/preview
  // — корень.
  const basePath = env.VITE_BASE_PATH || '/';

  // Профиль 'corp' — «голый» bare-HTTP с корп-сервера (http://IP/kipapp/).
  // Корп-шлюз на :80 принудительно метит ответы text/html → браузер не исполняет
  // внешние JS-модули. Поэтому собираем ВСЁ в один index.html (инлайн JS+CSS):
  // встроенный скрипт исполняется независимо от Content-Type. PWA на http не нужен.
  const isCorp = mode === 'corp';

  return {
    base: basePath,
    plugins: [
      react(),
      ...(isCorp ? [viteSingleFile()] : []),
      ...(isCorp ? [] : [VitePWA({
        registerType: 'autoUpdate',
        injectRegister: 'auto',
        devOptions: { enabled: false },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api\//],
          runtimeCaching: [
            {
              // Справочники (объекты, техника, юрлица, водители) — одинаковы для
              // всех и меняются редко. StaleWhileRevalidate: мгновенно из кэша,
              // обновление в фоне. Кэш на устройстве переживает плохую связь —
              // мастер приёмки открывается даже на флапе сети/офлайне (после
              // первой онлайн-загрузки). Решает «Не удалось загрузить справочники».
              // urlPattern не привязан к домену — ловит и workers.dev (CORS=*).
              urlPattern: /\/api\/(drivers|equipment|objects|legal-entities|counterparties)(\?.*)?$/,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'kip-reference-cache',
                expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 7 }, // 7 дней
                cacheableResponse: { statuses: [200] },
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
      })]),
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
      // Прод: без sourcemap (меньше артефактов на gh-pages, чище). Для отладки
      // временно вернуть true и собрать debug-сборку.
      sourcemap: false,
      chunkSizeWarningLimit: 800,
    },
  };
});
