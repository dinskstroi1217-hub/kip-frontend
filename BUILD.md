---
created: 2026-05-20
updated: 2026-05-20
pair-of: vite.config.ts, package.json
---

# BUILD — сборка и dev-режим kip-frontend

## Назначение

Билд-конфигурация PWA-фронтенда «КИП Спецтехника». Vite собирает SPA с
Workbox-генерируемым Service Worker и PWA-манифестом.

## Входы

- Исходники: `src/**/*.{ts,tsx}`, `index.html`, `public/**`.
- Env-переменные (читаются Vite, префикс `VITE_`):
  - `VITE_API_BASE_URL` — базовый URL backend. В dev используется для proxy.
    По умолчанию `http://2.27.86.52:3500`.
  - `VITE_APP_VERSION` — опциональный override версии в UI/логах sync.

## Выходы

- `dist/index.html` — HTML с инжектированными хешированными ассетами.
- `dist/assets/index-*.css` — Tailwind production-сборка (~20 КБ).
- `dist/assets/index-*.js` — JS бандл (~350 КБ, gzip ~115 КБ).
- `dist/sw.js`, `dist/workbox-*.js` — Service Worker (precache + runtime cache
  для `/api/drivers`, `/api/equipment` с `NetworkFirst` 5s timeout).
- `dist/manifest.webmanifest` — PWA-манифест (name, icons, theme color и т.д.).
- `dist/registerSW.js` — регистратор SW.

## Как запускать

### Локальная разработка
```bash
cd kip-frontend
npm install
npm run dev
# → http://localhost:5173/
```
Dev-сервер делает proxy `/api/*` и `/health` на `VITE_API_BASE_URL`.
Service Worker в dev отключён (`devOptions.enabled = false`), чтобы не мешать
HMR. На проде включается автоматически.

### Production-сборка
```bash
npm run build
# артефакт в dist/
npm run preview   # локальный smoke-test собранного билда
```

### Type-check без эмита
```bash
npm run typecheck
```

## Зависимости окружения

- Node.js ≥ 18 (используется 24 локально, проверено).
- npm ≥ 9.

## История изменений

### 2026-05-20 — initial
- Скаффолд через ручной `package.json` + конфиги (без `npm create vite`,
  чтобы избежать интерактивных промптов на Windows c кириллицей в пути).
- Vite 5.4 (не v6, для совместимости с `vite-plugin-pwa@0.21`).
- Tailwind v3.4 (не v4-alpha, для стабильности).
- React Router 6.28 (не v7, для стабильности).
- TypeScript 5.7 (без `erasableSyntaxOnly` — фича появится в 5.8).
- Workbox precaches только JS/CSS/HTML/PNG/SVG/WOFF2. Для `/api/drivers` и
  `/api/equipment` — runtime cache `NetworkFirst` 5s timeout, TTL сутки.
- Manifest: ru-локаль, portrait, theme-color `#1e3a8a` (brand-900).
